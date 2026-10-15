import type {CalendarEvent} from '../calendar/model';
export const reminderKey = (event: CalendarEvent) => JSON.stringify([event.sourceId, event.id, event.start]);
export function parseDismissedReminders(raw: string | null): Record<string, number> {
    try {
        const parsed = JSON.parse(raw ?? '{}');
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return {};
        return Object.fromEntries(Object.entries(parsed).filter(([,value]) => typeof value === 'number' && Number.isFinite(value))) as Record<string,number>;
    } catch { return {}; }
}
export function dueReminders(events: CalendarEvent[], minutes: number, dismissed: Record<string,number>, snoozed: Record<string,number>, now: number, suppressed = false) {
    if (!minutes || suppressed) return [];
    const unique = new Map(events.map(event => [reminderKey(event), event]));
    return [...unique.values()].filter(event => {
        const key = reminderKey(event), snooze = snoozed[key];
        return !event.allDay && !event.completed && !event.unscheduled && event.end > now &&
            event.start <= now + minutes * 60000 && (event.start > now - 5 * 60000 || !!snooze) &&
            dismissed[key] === undefined && dismissed[event.id] !== event.start && (!snooze || snooze <= now);
    }).sort((a,b) => a.start - b.start);
}
