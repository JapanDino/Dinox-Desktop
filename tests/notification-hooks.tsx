// Browser fixture harness: synthetic calendar events, no native mutations.
import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {useReminders} from '../src/calendar/useCalendar';
import type {CalendarEvent} from '../src/calendar/model';
export function mountReminderTest(events: CalendarEvent[]) {
    const container=document.createElement('div');
    container.style.cssText='position:fixed;top:100px;left:20px;z-index:99999;background:black;color:white;padding:20px';
    document.body.append(container);
    const root=createRoot(container);
    function Harness() {
        const [suppressed,setSuppressed]=useState(false);
        const reminders=useReminders(events,10,suppressed);
        return <section aria-label="Reminder test"><output>{reminders.active?.title || 'none'}</output><span data-queue>{reminders.pendingCount}</span><button onClick={reminders.dismiss}>Dismiss reminder</button><button onClick={()=>setSuppressed(value=>!value)}>DND test</button></section>;
    }
    root.render(<Harness/>);
    return ()=>{root.unmount();container.remove();};
}
