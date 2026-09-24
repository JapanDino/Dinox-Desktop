import {tr} from '../i18n/core';
export interface Notice {
    id: number;
    app_id: string;
    app_name: string;
    title: string;
    body: string;
    created: number;
}
export const notificationDefaults = { enabled: false, windowsEnabled: false, style: 'glass', privacy: 'full', duration: 8, maxVisible: 2, quiet: false, quietStart: '22:00', quietEnd: '08:00', accent: '#b7a6ff', blocked: [] as string[] };
export type NotificationOptions = typeof notificationDefaults;
export function messengerIdentity(notice: Notice, privacy: string) {
    if (!/telegram|whatsapp|signal|discord|viber|slack|teams/i.test(notice.app_name)) return null;
    const name = privacy === 'hidden' ? tr('Новое уведомление') : notice.title || tr('Новое уведомление');
    const initials = privacy === 'hidden' ? '' : name.trim().split(/\s+/).map(word => word.match(/[\p{L}\p{N}]/u)?.[0] ?? '').filter(Boolean).slice(0, 2).join('').toLocaleUpperCase();
    return { name, initials };
}
export function parseNotificationOptions(raw: string): NotificationOptions {
    let v: any = {};
    try {
        v = JSON.parse(raw);
        if (!v || typeof v !== 'object')
            v = {};
    }
    catch { }
    const bool = (k: string, d: boolean) => typeof v[k] === 'boolean' ? v[k] : d;
    const opt = (k: string, def: string, list: string[]) => list.includes(v[k]) ? v[k] : def;
    const time = (key: string, def: string) => typeof v[key] === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v[key]) ? v[key] : def;
    return { enabled: bool('enabled', false), windowsEnabled: bool('windowsEnabled', false), style: opt('style', 'glass', ['glass', 'solid', 'minimal']), privacy: opt('privacy', 'full', ['full', 'title', 'hidden']), duration: [4, 8, 12, 20].includes(v.duration) ? v.duration : 8, maxVisible: [1, 2, 3].includes(v.maxVisible) ? v.maxVisible : 2, quiet: bool('quiet', false), quietStart: time('quietStart', '22:00'), quietEnd: time('quietEnd', '08:00'), accent: typeof v.accent === 'string' && /^#[a-f0-9]{6}$/i.test(v.accent) ? v.accent : '#b7a6ff', blocked: Array.isArray(v.blocked) ? v.blocked.filter((x: unknown) => typeof x === 'string').slice(0, 100) : [] };
}
export function isQuiet(options: NotificationOptions, date = new Date()) {
    if (!options.quiet)
        return false;
    const n = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
    const now = date.getHours() * 60 + date.getMinutes(), start = n(options.quietStart), end = n(options.quietEnd);
    return start === end || start < end ? (now >= start && now < end) || (start === end) : now >= start || now < end;
}
export const noticeKey = (n: Notice) => `${n.app_id}:${n.id}:${n.created}`;
export function freshNotices(previous: Notice[], next: Notice[]) {
    const before=new Map(previous.map(n=>[noticeKey(n),n]));
    return next.filter(n=>{const old=before.get(noticeKey(n));return !old||old.title!==n.title||old.body!==n.body;});
}
export const sampleNotice: Notice = { id: 100, app_id: 'bloom-demo', get app_name(){ return tr("Telegram \u00B7 \u043F\u0440\u0438\u043C\u0435\u0440"); }, get title() {
        return tr("\u041A\u043E\u043C\u0430\u043D\u0434\u0430 \u043F\u0440\u043E\u0435\u043A\u0442\u0430");
    }, get body(){ return tr("\u0412\u0441\u0442\u0440\u0435\u0447\u0430\u0435\u043C\u0441\u044F \u0432 18:30. \u041F\u043B\u0430\u043D \u0438 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B \u0443\u0436\u0435 \u0432 \u0447\u0430\u0442\u0435."); }, created: Date.now() };
