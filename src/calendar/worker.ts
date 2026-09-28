import {tr} from '../i18n/core';
import { parseCalendar, type CalendarSource } from './model';
import {parseTasks} from './tasks';
self.onmessage = ({ data }: MessageEvent<{
    sources: CalendarSource[];
    from: number;
    to: number;
}>) => {
    const events = [];
    const tasks = [];
    const errors: Record<string, string> = {};
    for (const source of data.sources.filter(s => s.enabled)) {
        try {
            events.push(...parseCalendar(source, data.from, data.to));
            const entries=parseTasks(source,data.from,data.to);tasks.push(...entries);
            if(!source.items)events.push(...entries.filter(e=>!e.unscheduled&&!e.completed));
        }
        catch (e) {
            errors[source.id] = e instanceof Error ? e.message : tr("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C \u0441\u043E\u0431\u044B\u0442\u0438\u044F");
        }
    }
    self.postMessage({ events: events.sort((a, b) => a.start - b.start), tasks, errors });
};
