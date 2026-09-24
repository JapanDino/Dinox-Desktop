import {tr} from '../i18n/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {sameCalendarContent} from './subscriptions';
import type { CalendarSource, CalendarEvent } from './model';
export function useCalendar(from: number, to: number, eco: boolean) {
    const [sources, setSources] = useState<CalendarSource[]>([]);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [parseErrors, setParseErrors] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    const running = useRef(false), current = useRef(sources), lastAttempt = useRef(0), mounted = useRef(true);
    current.current = sources;
    const parseSources = useRef(sources);
    if (!sameCalendarContent(parseSources.current, sources)) parseSources.current = sources;
    const parseInput = parseSources.current;
    const load = useCallback(async () => {
        try {
            const values = await invoke<CalendarSource[]>('calendar_list');
            if (mounted.current) {
                setSources(values);
                setErrors({});
            }
        }
        catch (e) {
            if (mounted.current)
                setErrors({ storage: String(e) });
        }
    }, []);
    const refresh = useCallback(async () => {
        if (running.current)
            return;
        running.current = true;
        lastAttempt.current = Date.now();
        setBusy(true);
        const failures: Record<string, string> = {};
        const refreshed = new Map<string, CalendarSource>();
        for (const source of current.current.filter(s => s.enabled)) {
            try {
                const next = await invoke<CalendarSource>('calendar_refresh', { id: source.id });
                refreshed.set(next.id, next);
            }
            catch (e) {
                failures[source.id] = String(e);
            }
        }
        running.current = false;
        if (mounted.current) {
            // Preserve source edits/removals made while the network request was pending.
            setSources(old => old.map(s => { const next = refreshed.get(s.id); return next ? {...s, ics: next.ics, checked: next.checked} : s; }));
            setErrors(failures);
            setBusy(false);
        }
    }, []);
    useEffect(() => {
        mounted.current = true;
        void load();
        const unlisten = listen('calendars-changed', () => void load());
        return () => { mounted.current = false; unlisten.then(f => f()).catch(console.error); };
    }, [load]);
    useEffect(() => {
        const check = () => { if (Date.now() - lastAttempt.current >= (eco ? 30 : 10) * 60000 && current.current.some(s => s.enabled))
            void refresh(); };
        check();
        const timer = setInterval(check, 30000);
        window.addEventListener('online', check);
        document.addEventListener('visibilitychange', check);
        return () => { clearInterval(timer); window.removeEventListener('online', check); document.removeEventListener('visibilitychange', check); };
    }, [eco, refresh, sources.length]);
    useEffect(() => {
        if (!parseInput.some(s => s.enabled)) {
            setEvents([]);
            setParseErrors({});
            return;
        }
        const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        const timeout = setTimeout(() => { worker.terminate(); setParseErrors({ parse: tr("\u0420\u0430\u0437\u0431\u043E\u0440 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u044F \u0437\u0430\u043D\u044F\u043B \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0434\u043E\u043B\u0433\u043E. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u044C \u043C\u0435\u043D\u044C\u0448\u0435\u0433\u043E \u0440\u0430\u0437\u043C\u0435\u0440\u0430.") }); }, 8000);
        worker.onmessage = ({ data }) => { clearTimeout(timeout); setEvents(data.events); setParseErrors(data.errors); worker.terminate(); };
        worker.onerror = () => { clearTimeout(timeout); setParseErrors({ parse: tr("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u044C") }); worker.terminate(); };
        worker.postMessage({ sources: parseInput, from, to });
        return () => { clearTimeout(timeout); worker.terminate(); };
    }, [parseInput, from, to]);
    return { range: {from, to}, sources, events, errors: { ...errors, ...parseErrors }, busy, refresh, load };
}
export function useReminders(events: CalendarEvent[], minutes: number) {
    const [active, setActive] = useState<CalendarEvent | null>(null);
    const [tick, setTick] = useState(Date.now());
    const dismissed = useRef<Record<string, number>>((() => { try {
        return JSON.parse(localStorage.getItem('bloom-calendar-dismissed') || '{}');
    }
    catch {
        return {};
    } })());
    const snoozed = useRef<Record<string, number>>({});
    const persist = () => localStorage.setItem('bloom-calendar-dismissed', JSON.stringify(dismissed.current));
    useEffect(() => { if (!minutes || !events.length) return; const timer = setInterval(() => setTick(Date.now()), 15000); return () => clearInterval(timer); }, [minutes, events.length]);
    useEffect(() => {
        const now = Date.now();
        for (const [id, end] of Object.entries(dismissed.current))
            if (end < now - 86400000)
                delete dismissed.current[id];
        if (!minutes) {
            setActive(null);
            return;
        }
        if (active && (!events.some(e => e.id === active.id && e.start === active.start) || active.end <= now))
            setActive(null);
        const candidate = events.find(e => !e.allDay && e.end > now && e.start <= now + minutes * 60000 && (e.start > now - 5 * 60000 || !!snoozed.current[e.id]) && dismissed.current[e.id] !== e.start && (!snoozed.current[e.id] || snoozed.current[e.id] <= now));
        if (!active && candidate)
            setActive(candidate);
    }, [events, minutes, tick, active]);
    return { active, dismiss: () => { if (active) {
            dismissed.current[active.id] = active.start;
            persist();
            setActive(null);
        } }, snooze: () => { if (active) {
            snoozed.current[active.id] = Date.now() + 5 * 60000;
            setActive(null);
        } } };
}
