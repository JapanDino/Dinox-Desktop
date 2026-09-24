import {test, expect} from 'bun:test';
import {subscriptionUrl, sameCalendarContent, searchEvents} from '../src/calendar/subscriptions';
import {parseCalendar, type CalendarSource} from '../src/calendar/model';
const source: CalendarSource = {id:'yandex-fixture',name:'Личное',color:'#8dd6b0',enabled:true,checked:0,
    ics: ['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:yandex-style-fixture',
        'DTSTART;TZID=Europe/Moscow:20260924T150000','DTEND;TZID=Europe/Moscow:20260924T160000',
        'RRULE:FREQ=WEEKLY;COUNT=2','SUMMARY:Встреча с командой','LOCATION:Офис',
        'END:VEVENT','END:VCALENDAR'].join('\r\n')};
test('subscriptions normalize webcal and reject pages, passwords and active URLs',()=>{
    expect(subscriptionUrl(' WEBCAL://calendar.yandex.ru/export/ics.xml?private_token=fixture ')).toBe('https://calendar.yandex.ru/export/ics.xml?private_token=fixture');
    expect(subscriptionUrl('https://example.org/feed?id=1')).toBe('https://example.org/feed?id=1');
    for(const value of ['https://calendar.yandex.ru/','https://calendar.google.com/calendar/u/0/r','https://caldav.yandex.ru/','http://example.org/a.ics','https://user:pass@example.org/a.ics','javascript:alert(1)','not a URL'])
        expect(()=>subscriptionUrl(value)).toThrow();
});
test('304 check timestamps do not trigger parsing; edits and visibility do',()=>{
    expect(sameCalendarContent([source],[{...source,checked:999}])).toBe(true);
    for (const update of [{ics:source.ics+'\r\n'}, {enabled:false}, {name:'Работа'}, {color:'#ffffff'}, {id:'other'}])
        expect(sameCalendarContent([source],[{...source,...update}])).toBe(false);
    expect(sameCalendarContent([source],[])).toBe(false);
});
test('Cyrillic recurring events in Moscow time are searchable across fields',()=>{
    const events=parseCalendar(source,Date.parse('2026-09-01'),Date.parse('2026-10-10'));
    expect(events).toHaveLength(2);
    expect(new Date(events[0].start).toISOString()).toBe('2026-09-24T12:00:00.000Z');
    expect(searchEvents(events,'КОМАНДОЙ офис личное')).toHaveLength(2);
    expect(searchEvents(events,'несуществующее')).toHaveLength(0);
    expect(searchEvents(events,'')).toHaveLength(2);
});
