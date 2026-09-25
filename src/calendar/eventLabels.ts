import {locale,tr} from '../i18n/core';
import {sameDay,type CalendarEvent} from './model';

export function eventTime(event: CalendarEvent) {
    const clock = (n:number) => new Date(n).toLocaleTimeString(locale(), {hour:'2-digit',minute:'2-digit'});
    const dates = new Intl.DateTimeFormat(locale(), {day:'numeric',month:'short',year:'numeric'});
    if (event.allDay) {
        // ICS DTEND is exclusive: a Monday end means the last occupied day is Sunday.
        const last = Math.max(event.start, event.end - 1);
        return sameDay(event.start,last) ? tr('Весь день')
            : `${dates.formatRange(event.start,last)} · ${tr('Весь день')}`;
    }
    if (!sameDay(event.start,event.end))
        return `${dates.format(event.start)}, ${clock(event.start)} — ${dates.format(event.end)}, ${clock(event.end)}`;
    return `${clock(event.start)}–${clock(event.end)}`;
}
