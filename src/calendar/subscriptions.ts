import type { CalendarSource, CalendarEvent } from './model';

export const providers = {
    google: { name: 'Google Calendar', placeholder: 'https://calendar.google.com/…/basic.ics',
        help: 'Google Calendar → Настройки → нужный календарь → Интеграция календаря → Секретный адрес в формате iCal.' },
    yandex: { name: 'Яндекс Календарь', placeholder: 'https://calendar.yandex.ru/…',
        help: 'Яндекс Календарь → наведи на календарь слева → настройки → Экспорт → скопируй ссылку рядом с iCal.' },
    outlook: { name: 'Outlook', placeholder: 'https://outlook.live.com/…/calendar.ics',
        help: 'Outlook в браузере → Параметры → Календарь → Общие календари → Опубликовать календарь → ссылка ICS. Доступность зависит от организации.' },
    other: { name: 'Другая ICS-подписка', placeholder: 'https://…/calendar.ics',
        help: 'Скопируй ссылку подписки iCal / ICS в сервисе календаря. Нужна ссылка на данные, а не веб-страница, файл с компьютера или адрес CalDAV.' },
} as const;
export type Provider = keyof typeof providers;

export function subscriptionUrl(value: string): string {
    let url: URL;
    try { url = new URL(value.trim().replace(/^webcal:/i, 'https:')); }
    catch { throw new Error('Введите HTTPS-ссылку подписки iCal / ICS'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash)
        throw new Error('Введите HTTPS-ссылку подписки iCal / ICS');
    if (url.hostname === 'caldav.yandex.ru' ||
        (url.hostname === 'calendar.yandex.ru' && url.pathname === '/') ||
        (url.hostname === 'calendar.google.com' && !url.pathname.endsWith('.ics')))
        throw new Error('Это адрес календаря, а не подписки. Скопируйте ссылку iCal / ICS из настроек экспорта.');
    return url.href;
}

// A successful HTTP 304 changes checked, but never the input to the ICS parser.
export function sameCalendarContent(a: CalendarSource[], b: CalendarSource[]) {
    return a.length === b.length && a.every((s, i) => {
        const next = b[i];
        return s.id === next.id && s.name === next.name && s.color === next.color && s.enabled === next.enabled && s.ics === next.ics;
    });
}

export function searchEvents(events: CalendarEvent[], query: string) {
    const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return events.filter(e => {
        const text = [e.title, e.location, e.description, e.sourceName].join(' ').toLocaleLowerCase();
        return words.every(word => text.includes(word));
    });
}
