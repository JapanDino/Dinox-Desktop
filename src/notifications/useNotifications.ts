import {tr} from '../i18n/core';
import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { usePersonalSetting } from '../components/PersonalFeatures';
import { freshNotices, isQuiet, noticeKey, notificationDefaults, parseNotificationOptions, type Notice } from './model';
export function useNotifications() {
    const [raw] = usePersonalSetting('bloom-notifications', JSON.stringify(notificationDefaults));
    const options = parseNotificationOptions(raw), optionsRef = useRef(options);
    optionsRef.current = options;
    const [history, setHistory] = useState<Notice[]>([]), [popups, setPopups] = useState<{
        notice: Notice;
        expires: number;
    }[]>([]), [center, setCenter] = useState(false), [error, setError] = useState('');
    const previous = useRef<Notice[] | null>(null), read = useRef(new Set<string>()), hidden = useRef(new Set<string>()), paused = useRef(0), current = useRef(history);
    current.current = history;
    const allowed = (n: Notice) => !options.blocked.includes(n.app_id);
    const unread = history.filter(n => allowed(n) && !read.current.has(noticeKey(n))).length;
    useEffect(() => { void emit('bloom-notification-count', options.enabled ? unread : 0); }, [unread, options.enabled]);
    useEffect(() => {
        const open = listen('bloom-open-notifications', () => { setCenter(true); setPopups([]); });
        const count = listen('notification-count-request', () => { void emit('bloom-notification-count', optionsRef.current.enabled ? current.current.filter(n => !optionsRef.current.blocked.includes(n.app_id) && !read.current.has(noticeKey(n))).length : 0); });
        const preview = listen<Notice>('bloom-preview-notification', ({ payload }) => { if (optionsRef.current.enabled)
            setPopups([{ notice: payload, expires: Date.now() + optionsRef.current.duration * 1000 }]); });
        return () => { for (const stop of [open, count, preview])
            void stop.then(f => f()); };
    }, []);
    useEffect(() => {
        if (!options.enabled || !options.windowsEnabled) {
            previous.current = null;
            read.current.clear();
            hidden.current.clear();
            setHistory([]);
            setPopups([]);
            setError('');
            return;
        }
        let disposed = false, busy = false, pending = false;
        const poll = async () => {
            if (disposed)return;
            if (busy){pending=true;return;}
            busy = true;
            try {
                const next = await invoke<Notice[]>('notification_snapshot');
                if (disposed)
                    return;
                const fresh = previous.current ? freshNotices(previous.current, next) : [];
                const knownKeys=new Set((previous.current||[]).map(noticeKey));
                previous.current = next;
                setHistory(next);
                setError('');
                const cfg = optionsRef.current;
                const news = fresh.filter(n => !cfg.blocked.includes(n.app_id) && (knownKeys.has(noticeKey(n)) || Date.now() - n.created < 120000));
                void emit('bloom-notification-health',{checked:Date.now(),count:next.length,last:next[0]?.created||null,telegram:next.some(n=>/telegram/i.test(n.app_name))});
                for(const notice of news){read.current.delete(noticeKey(notice));hidden.current.delete(noticeKey(notice));}
                if (news.length && !isQuiet(cfg)) {
                    for(const notice of news)void emit('bloom-app-notice',{app_id:notice.app_id,app_name:notice.app_name});
                    setPopups(old => [...news.map(notice => ({ notice, expires: Date.now() + cfg.duration * 1000 })), ...old.filter(p=>!news.some(n=>noticeKey(n)===noticeKey(p.notice)))].slice(0, cfg.maxVisible));
                }
                const keys = new Set(next.map(noticeKey));
                read.current = new Set([...read.current].filter(k => keys.has(k)));
                hidden.current = new Set([...hidden.current].filter(k => keys.has(k)));
            }
            catch {
                if (!disposed)
                    setError(tr("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F. \u041F\u0440\u043E\u0432\u0435\u0440\u044C \u0434\u043E\u0441\u0442\u0443\u043F \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445."));
            }
            finally {
                busy = false;
                if(pending&&!disposed){pending=false;void poll();}
            }
        };
        // Register before the baseline read. Events refresh immediately; polling recovers missed events.
        const change=listen('bloom-notifications-changed',()=>void poll());
        void change.then(async()=>{if(disposed)return;await poll();if(!disposed)try{await invoke('notification_watch',{watch:true});}catch{/* fallback polling remains active */}});
        const timer = setInterval(poll, 5000);
        return () => { disposed = true; clearInterval(timer);void change.then(f=>f());void invoke('notification_watch',{watch:false}).catch(()=>{}); };
    }, [options.enabled, options.windowsEnabled]);
    useEffect(() => { if (!options.enabled) {
        setPopups([]);
        return;
    } setPopups(old => old.filter(p => !options.blocked.includes(p.notice.app_id))); }, [raw]);
    useEffect(() => { if (!popups.length) {
        paused.current = 0;
        return;
    } const timer = setInterval(() => { if (!paused.current)
        setPopups(old => old.filter(x => x.expires > Date.now())); }, 500); return () => clearInterval(timer); }, [popups.length]);
    const close = () => { paused.current = 0; history.forEach(n => read.current.add(noticeKey(n))); setCenter(false); setPopups([]); };
    return { options, history: history.filter(n => allowed(n) && !hidden.current.has(noticeKey(n))), popups, center, error, unread, visible: center || popups.length > 0, close,
        showCenter: () => { setCenter(true); setPopups([]); },
        dismiss: (notice: Notice) => { hidden.current.add(noticeKey(notice)); read.current.add(noticeKey(notice)); setPopups(old => old.filter(x => noticeKey(x.notice) !== noticeKey(notice))); },
        pause: (value: boolean) => { if (value) {
            if (!paused.current)
                paused.current = Date.now();
        }
        else if (paused.current) {
            const elapsed = Date.now() - paused.current;
            paused.current = 0;
            setPopups(old => old.map(x => ({ ...x, expires: x.expires + elapsed })));
        } },
    };
}
