export const localCalendarDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const localTime = (date: Date) => `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
/** Today starts at the next half-hour; deliberately selected other dates stay selected. */
export function composerDefaults(selectedDate: Date, now = new Date()) {
    const start = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 9);
    if (localCalendarDate(selectedDate) === localCalendarDate(now)) {
        start.setHours(now.getHours(), Math.floor(now.getMinutes()/30)*30 + 30, 0, 0);
    }
    const end = new Date(start); end.setHours(start.getHours()+1);
    return {day: localCalendarDate(start), endDay: localCalendarDate(end), time: localTime(start), endTime: localTime(end)};
}
