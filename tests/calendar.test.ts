import {test,expect} from 'bun:test';
import {parseCalendar,layoutDay,layoutWeekBanners,isBannerEvent,addDays,weekStart,onDay,safeLink,type CalendarSource} from '../src/calendar/model';
import {eventTime} from '../src/calendar/eventLabels';
const source=(body:string,id='one'):CalendarSource=>({id,name:'Test',enabled:true,color:'#b7a6ff',checked:0,ics:`BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR`});
const event=(body:string)=>`BEGIN:VEVENT\r\n${body}\r\nEND:VEVENT`;
const from=Date.parse('2026-09-01T00:00:00Z'),to=Date.parse('2026-10-01T00:00:00Z');
test('recurrences, moved instance and cancelled instance do not duplicate',()=>{
 const s=source([event('UID:weekly\r\nDTSTART:20260907T100000Z\r\nDTEND:20260907T110000Z\r\nRRULE:FREQ=WEEKLY;COUNT=4\r\nSUMMARY:Weekly'),event('UID:weekly\r\nRECURRENCE-ID:20260914T100000Z\r\nDTSTART:20260915T120000Z\r\nDTEND:20260915T130000Z\r\nSUMMARY:Moved'),event('UID:weekly\r\nRECURRENCE-ID:20260921T100000Z\r\nDTSTART:20260921T100000Z\r\nDTEND:20260921T110000Z\r\nSTATUS:CANCELLED')].join('\r\n'));
 const result=parseCalendar(s,from,to);expect(result).toHaveLength(3);expect(result.map(e=>e.title)).toEqual(['Weekly','Moved','Weekly']);expect(new Date(result[1].start).getUTCDate()).toBe(15);
});
test('unrelated recurring series never inherit each others exceptions',()=>{
 const a=event('UID:a\r\nDTSTART:20260907T100000Z\r\nDTEND:20260907T110000Z\r\nRRULE:FREQ=WEEKLY;COUNT=2\r\nSUMMARY:A');
 const b=event('UID:b\r\nDTSTART:20260907T100000Z\r\nDTEND:20260907T110000Z\r\nRRULE:FREQ=WEEKLY;COUNT=2\r\nSUMMARY:B');
 const ex=event('UID:b\r\nRECURRENCE-ID:20260914T100000Z\r\nDTSTART:20260915T100000Z\r\nDTEND:20260915T110000Z\r\nSUMMARY:B moved');
 const events=parseCalendar(source([a,b,ex].join('\r\n')),from,to);expect(events.filter(e=>e.title==='A')).toHaveLength(2);expect(events.filter(e=>e.title==='B moved')).toHaveLength(1);
});
test('all day end date is exclusive and dates remain local',()=>{
 const [e]=parseCalendar(source(event('UID:trip\r\nDTSTART;VALUE=DATE:20260923\r\nDTEND;VALUE=DATE:20260925\r\nSUMMARY:Trip')),from,to);
 expect(e.allDay).toBe(true);expect(onDay(e,new Date(2026,8,24))).toBe(true);expect(onDay(e,new Date(2026,8,25))).toBe(false);
});
test('IANA timezone without VTIMEZONE uses correct UTC offset',()=>{
 const [e]=parseCalendar(source(event('UID:msk\r\nDTSTART;TZID=Europe/Moscow:20260923T120000\r\nDTEND;TZID=Europe/Moscow:20260923T130000\r\nSUMMARY:MSK')),from,to);
 expect(new Date(e.start).toISOString()).toBe('2026-09-23T09:00:00.000Z');
});
test('DST recurring events keep local time across offset change',()=>{
 const events=parseCalendar(source(event('UID:dst\r\nDTSTART;TZID=America/New_York:20260301T090000\r\nDTEND;TZID=America/New_York:20260301T100000\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nSUMMARY:DST')),Date.parse('2026-03-01'),Date.parse('2026-03-20'));
 expect(events.map(e=>new Date(e.start).getUTCHours())).toEqual([14,13,13]);
});
test('EXDATE removes an occurrence',()=>{
 const result=parseCalendar(source(event('UID:ex\r\nDTSTART:20260907T100000Z\r\nDTEND:20260907T110000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nEXDATE:20260908T100000Z\r\nSUMMARY:Test')),from,to);expect(result).toHaveLength(2);
});
test('links allow HTTPS only and event content stays plain text',()=>{
 expect(safeLink('javascript:alert(1)')).toBe('');expect(safeLink('file:///C:/hello')).toBe('');expect(safeLink('https://user:password@example.com')).toBe('');
 const [e]=parseCalendar(source(event('UID:html\r\nDTSTART:20260923T100000Z\r\nDTEND:20260923T110000Z\r\nSUMMARY:<script>alert(1)</script>\r\nDESCRIPTION:https://meet.google.com/abc-defg-hij')),from,to);expect(e.title).toContain('<script>');expect(e.meeting).toBe('https://meet.google.com/abc-defg-hij');
});
test('overlapping events occupy separate lanes',()=>{
 const events=parseCalendar(source([event('UID:a\r\nDTSTART:20260923T100000Z\r\nDTEND:20260923T120000Z'),event('UID:b\r\nDTSTART:20260923T110000Z\r\nDTEND:20260923T130000Z'),event('UID:c\r\nDTSTART:20260923T140000Z\r\nDTEND:20260923T150000Z')].join('\r\n')),from,to);
 const layout=layoutDay(events,new Date(events[0].start));expect(layout.map(e=>e.column)).toEqual([0,1,0]);expect(layout.map(e=>e.columns)).toEqual([2,2,1]);
 expect(weekStart(new Date(2026,8,27)).getDate()).toBe(21);
});

test('cancelled occurrence can omit DTSTART and DTEND',()=>{
 const result=parseCalendar(source([event('UID:cancel\r\nDTSTART:20260907T100000Z\r\nDTEND:20260907T110000Z\r\nRRULE:FREQ=WEEKLY;COUNT=2'),event('UID:cancel\r\nRECURRENCE-ID:20260914T100000Z\r\nSTATUS:CANCELLED')].join('\r\n')),from,to);
 expect(result).toHaveLength(1);
});

test('multi-week timed event uses one clipped banner and keeps original timestamps',()=>{
 const [e]=parseCalendar(source(event('UID:long\r\nDTSTART:20260827T120000\r\nDTEND:20270531T235900\r\nSUMMARY:Long project')),from,to);
 const before={...e};
 const [bar]=layoutWeekBanners([e],new Date(2026,8,23));
 expect(bar.first).toBe(0);expect(bar.span).toBe(7);expect(bar.continuesBefore).toBe(true);expect(bar.continuesAfter).toBe(true);
 expect(e.allDay).toBe(false);expect(layoutDay([e],new Date(2026,8,23))).toEqual([]);expect(e).toEqual(before);
 expect(eventTime(e)).toContain('2026');expect(eventTime(e)).toContain('2027');
});

test('all-day spans exclude DTEND and overlapping banners occupy separate rows',()=>{
 const events=parseCalendar(source([
  event('UID:week\r\nDTSTART;VALUE=DATE:20260921\r\nDTEND;VALUE=DATE:20260928'),
  event('UID:trip\r\nDTSTART;VALUE=DATE:20260923\r\nDTEND;VALUE=DATE:20260925'),
  event('UID:day\r\nDTSTART;VALUE=DATE:20260925'),
 ].join('\r\n')),from,to);
 const bars=layoutWeekBanners(events,new Date(2026,8,23));
 expect(bars.map(b=>[b.first,b.span,b.lane])).toEqual([[0,7,0],[2,2,1],[4,1,1]]);
 expect(bars[0].continuesAfter).toBe(false);
 expect(layoutWeekBanners(events,new Date(2026,8,28))).toHaveLength(0);
 expect(eventTime(events[0])).toContain('27');expect(eventTime(events[0])).not.toContain('28');
});

test('short overnight events remain in hourly grid and midnight does not add a day',()=>{
 const [e]=parseCalendar(source(event('UID:overnight\r\nDTSTART:20260923T230000\r\nDTEND:20260924T010000')),from,to);
 expect(isBannerEvent(e)).toBe(false);expect(layoutWeekBanners([e],new Date(e.start))).toHaveLength(0);
 expect(layoutDay([e],new Date(2026,8,23))[0]).toMatchObject({top:1380,height:60});
 expect(layoutDay([e],new Date(2026,8,24))[0]).toMatchObject({top:0,height:60});
 const full={...e,start:+new Date(2026,8,23),end:+new Date(2026,8,24)};
 expect(layoutWeekBanners([full],new Date(full.start))[0].span).toBe(1);
});

test('calendar-day duration uses local dates across DST transitions',()=>{
 const [base]=parseCalendar(source(event('UID:base\r\nDTSTART;VALUE=DATE:20260923')),from,to);
 const start=new Date(2026,2,29),end=addDays(start,1);
 const e={...base,start:+start,end:+end,allDay:false};
 expect(isBannerEvent(e)).toBe(true);
 expect(layoutWeekBanners([e],start)[0].span).toBe(1);
});
