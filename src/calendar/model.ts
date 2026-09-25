import {tr} from '../i18n/core';
import ICAL from 'ical.js';
export interface CalendarSource {
    id: string;
    name: string;
    color: string;
    enabled: boolean;
    ics: string;
    checked: number;
}
export interface CalendarEvent {
    id: string;
    uid: string;
    sourceId: string;
    title: string;
    start: number;
    end: number;
    allDay: boolean;
    location: string;
    description: string;
    url: string;
    meeting: string;
    color: string;
    sourceName: string;
}
export const dayStart = (value: Date | number) => { const d = new Date(value); d.setHours(0, 0, 0, 0); return d; };
export const addDays = (date: Date, days: number) => { const d = new Date(date); d.setDate(d.getDate() + days); return d; };
export const weekStart = (date: Date) => addDays(dayStart(date), -(date.getDay() + 6) % 7);
export const sameDay = (a: Date | number, b: Date | number) => +dayStart(a) === +dayStart(b);
export const onDay = (event: CalendarEvent, date: Date) => event.start < +addDays(dayStart(date), 1) && event.end > +dayStart(date);
export function safeLink(value: unknown) {
    if (typeof value !== 'string')
        return '';
    try {
        const u = new URL(value);
        return u.protocol === 'https:' && !u.username && !u.password ? u.href : '';
    }
    catch {
        return '';
    }
}
function meetingLink(text: string) {
    for (const candidate of text.match(/https:\/\/[^\s<>"\\]+/g) || []) {
        const value = safeLink(candidate.replace(/[).,;]+$/, ''));
        if (value && /(^|\.)(meet\.google\.com|zoom\.us|teams\.microsoft\.com|teams\.live\.com|webex\.com)$/.test(new URL(value).hostname))
            return value;
    }
    return '';
}
// ICS commonly embeds VTIMEZONE. Use the browser's IANA database when it doesn't.
function registerIana(id: string) {
    if (ICAL.TimezoneService.has(id))
        return;
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: id, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    const zone = new ICAL.Timezone({ tzid: id });
    zone.utcOffset = time => {
        const wall = Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
        let guess = wall, offset = 0;
        for (let i = 0; i < 3; i++) {
            const fields = Object.fromEntries(formatter.formatToParts(guess).map(p => [p.type, p.value]));
            offset = (Date.UTC(+fields.year, +fields.month - 1, +fields.day, +fields.hour, +fields.minute, +fields.second) - guess) / 1000;
            const next = wall - offset * 1000;
            if (next === guess)
                break;
            guess = next;
        }
        return offset;
    };
    ICAL.TimezoneService.register(zone);
}
export function parseCalendar(source: CalendarSource, from: number, to: number): CalendarEvent[] {
    const root = new ICAL.Component(ICAL.parse(source.ics.replace(/^\uFEFF/, '')));
    if (root.name !== 'vcalendar')
        throw new Error(tr("\u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u044C ICS"));
    ICAL.TimezoneService.reset();
    for (const tz of root.getAllSubcomponents('vtimezone'))
        ICAL.TimezoneService.register(new ICAL.Timezone(tz));
    const parts = root.getAllSubcomponents('vevent');
    for (const part of parts)
        for (const prop of part.getAllProperties()) {
            const tzid = prop.getParameter('tzid');
            if (typeof tzid === 'string' && !ICAL.TimezoneService.has(tzid)) {
                try {
                    registerIana(tzid);
                }
                catch {
                    throw new Error(tr("\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u0447\u0430\u0441\u043E\u0432\u043E\u0439 \u043F\u043E\u044F\u0441: {0}", tzid.slice(0, 60)));
                }
            }
        }
    const groups = new Map<string, ICAL.Component[]>();
    for (const c of parts) {
        const uid = String(c.getFirstPropertyValue('uid') || '');
        if (!uid)
            continue;
        const group = groups.get(uid) || [];
        group.push(c);
        groups.set(uid, group);
    }
    const result: CalendarEvent[] = [];
    const seen = new Set<string>();
    let iterations = 0;
    const push = (event: ICAL.Event, start: ICAL.Time, end: ICAL.Time, recurrence: string) => {
        if (String(event.component.getFirstPropertyValue('status')).toUpperCase() === 'CANCELLED')
            return;
        const s = +start.toJSDate(), e = +end.toJSDate();
        if (!Number.isFinite(s) || !Number.isFinite(e) || e <= from || s >= to)
            return;
        const id = `${source.id}:${event.uid}:${recurrence}`;
        if (seen.has(id))
            return;
        seen.add(id);
        const url = safeLink(event.component.getFirstPropertyValue('url'));
        const description = String(event.description || '').slice(0, 8000), location = String(event.location || '').slice(0, 1000);
        result.push({ id, uid: event.uid, sourceId: source.id, title: String(event.summary || '').slice(0, 300), start: s, end: Math.max(e, s + 60000), allDay: start.isDate, description, location, url, meeting: meetingLink(`${url} ${location} ${description}`), color: source.color, sourceName: source.name });
    };
    for (const components of groups.values()) {
        const masters = components.filter(c => !c.hasProperty('recurrence-id')).sort((a, b) => Number(b.getFirstPropertyValue('sequence') || 0) - Number(a.getFirstPropertyValue('sequence') || 0));
        const exceptions = components.filter(c => c.hasProperty('recurrence-id'));
        // Cancelled instances are allowed to omit DTSTART/DTEND in subscription feeds.
        const cancelled = new Set(exceptions.filter(c => String(c.getFirstPropertyValue('status')).toUpperCase() === 'CANCELLED').map(c => String(c.getFirstPropertyValue('recurrence-id'))));
        if (!masters.length) {
            for (const c of exceptions) {
                if (cancelled.has(String(c.getFirstPropertyValue('recurrence-id'))))
                    continue;
                const e = new ICAL.Event(c, { exceptions: [] });
                push(e, e.startDate, e.endDate, e.recurrenceId.toString());
            }
            continue;
        }
        const event = new ICAL.Event(masters[0], { exceptions: exceptions.filter(c => !cancelled.has(String(c.getFirstPropertyValue('recurrence-id')))), strictExceptions: true });
        if (String(event.component.getFirstPropertyValue('status')).toUpperCase() === 'CANCELLED')
            continue;
        if (event.isRecurring()) {
            const iterator = event.iterator();
            let next: ICAL.Time | null;
            while ((next = iterator.next())) {
                if (++iterations > 100000)
                    throw new Error(tr("\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u043F\u043E\u0432\u0442\u043E\u0440\u0435\u043D\u0438\u0439. \u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u044C \u0441 \u043C\u0435\u043D\u044C\u0448\u0438\u043C \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u043E\u043C."));
                if (+next.toJSDate() > to + 366 * 86400000)
                    break;
                if (cancelled.has(next.toString()))
                    continue;
                const detail = event.getOccurrenceDetails(next);
                push(detail.item, detail.startDate, detail.endDate, next.toString());
                if (+next.toJSDate() > to)
                    break;
            }
            // Include exceptions moved into the range from an occurrence outside it.
            for (const c of exceptions) {
                if (cancelled.has(String(c.getFirstPropertyValue('recurrence-id'))))
                    continue;
                const e = new ICAL.Event(c, { exceptions: [] });
                push(e, e.startDate, e.endDate, e.recurrenceId.toString());
            }
        }
        else
            push(event, event.startDate, event.endDate, event.startDate.toString());
        if (result.length > 15000)
            throw new Error(tr("\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u0441\u043E\u0431\u044B\u0442\u0438\u0439 \u0434\u043B\u044F \u043E\u0442\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F"));
    }
    return result.sort((a, b) => a.start - b.start);
}
export function layoutDay(events: CalendarEvent[], date: Date) {
    const start = +dayStart(date), end = +addDays(dayStart(date), 1);
    const sorted = events.filter(e => !isBannerEvent(e) && onDay(e, date)).sort((a, b) => a.start - b.start || b.end - a.end);
    const output: {
        event: CalendarEvent;
        column: number;
        columns: number;
        top: number;
        height: number;
    }[] = [];
    let group: typeof output = [], groupEnd = 0;
    const lanes: number[] = [];
    const finish = () => { for (const e of group)
        e.columns = lanes.length; output.push(...group); group = []; lanes.length = 0; };
    for (const event of sorted) {
        const s = Math.max(start, event.start), e = Math.min(end, event.end);
        if (group.length && s >= groupEnd)
            finish();
        let column = lanes.findIndex(until => until <= s);
        if (column < 0)
            column = lanes.length;
        lanes[column] = e;
        const sd = new Date(s), ed = new Date(e);
        const top = sd.getHours() * 60 + sd.getMinutes(), bottom = e === end ? 1440 : ed.getHours() * 60 + ed.getMinutes();
        group.push({ event, column, columns: 1, top, height: Math.max(18, bottom - top) });
        groupEnd = Math.max(...lanes);
    }
    finish();
    return output;
}

// Keep short overnight appointments in the hourly grid. Long DATE-TIME events
// use the same banner area as DATE events, without changing their allDay flag.
export const isBannerEvent = (event: CalendarEvent) => event.allDay || event.end >= +addDays(new Date(event.start), 1);

export function layoutWeekBanners(events: CalendarEvent[], date: Date) {
    const start = weekStart(date), end = addDays(start, 7);
    const days = Array.from({length: 7}, (_, i) => addDays(start, i));
    const lanes: number[] = [];
    return events.filter(event => isBannerEvent(event) && event.start < +end && event.end > +start)
        .sort((a,b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id))
        .map(event => {
            const first = days.findIndex(day => onDay(event, day));
            const last = days.reduce((result, day, i) => onDay(event, day) ? i : result, first);
            let lane = lanes.findIndex(until => until <= first);
            if (lane < 0) lane = lanes.length;
            lanes[lane] = last + 1;
            return {event, first, span: last - first + 1, lane,
                continuesBefore: event.start < +start, continuesAfter: event.end > +end};
        });
}

// Localize missing titles at render time; supplied event text is user content.
export const eventTitle = (event: CalendarEvent) => event.title || tr("Без названия");
