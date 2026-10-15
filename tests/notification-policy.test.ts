import {test,expect} from 'bun:test';
import {dueReminders,parseDismissedReminders,reminderKey} from '../src/notifications/reminders';
import {automaticNoticeAllowed,notificationDefaults,freshNotices,noticeKey,sampleNotice} from '../src/notifications/model';
import type {CalendarEvent} from '../src/calendar/model';
const now=10000000;
const event:CalendarEvent={id:'shared',uid:'shared',sourceId:'one',title:'Upcoming',start:now+60000,end:now+3600000,allDay:false,location:'',description:'',url:'',meeting:'',color:'#ffffff',sourceName:'Calendar'};
test('Dinox DND suppresses automatic messages independent of quiet schedule',()=>{
 const options={...notificationDefaults,enabled:true};
 expect(automaticNoticeAllowed(options,true)).toBe(false); expect(automaticNoticeAllowed(options,false)).toBe(true);
 expect(automaticNoticeAllowed({...options,enabled:false},false)).toBe(false);
 expect(automaticNoticeAllowed({...options,quiet:true,quietStart:'00:00',quietEnd:'00:00'},false)).toBe(false);
});
test('reminder identity isolates sources and recurring occurrences; duplicate snapshot rows collapse',()=>{
 const next={...event,start:event.start+60000}, other={...event,sourceId:'two'};
 expect(new Set([event,next,other].map(reminderKey)).size).toBe(3);
 expect(dueReminders([event,{...event},next,other],10,{}, {},now)).toHaveLength(3);
 const dismissed={[reminderKey(event)]:event.end};
 expect(dueReminders([event,next,other],10,dismissed,{},now)).toEqual([other,next]);
});
test('suppression, completion, all-day and future snooze remove automatic reminders',()=>{
 expect(dueReminders([event],10,{}, {},now,true)).toEqual([]);
 expect(dueReminders([event],0,{}, {},now)).toEqual([]);
 expect(dueReminders([{...event,allDay:true},{...event,completed:true}],10,{}, {},now)).toEqual([]);
 expect(dueReminders([event],10,{}, {[reminderKey(event)]:now+60000},now)).toEqual([]);
 expect(dueReminders([event],10,{}, {[reminderKey(event)]:now},now)).toEqual([event]);
});
test('legacy occurrence dismissal migrates safely and malformed storage is ignored',()=>{
 expect(dueReminders([event],10,{shared:event.start},{},now)).toEqual([]);
 for(const raw of ['null','[]','bad'])expect(parseDismissedReminders(raw)).toEqual({});
 expect(parseDismissedReminders('{"x":1,"y":"bad"}')).toEqual({x:1});
});
test('unchanged Windows snapshots never resurrect a dismissed notification; content replacement is new',()=>{
 const previous={...sampleNotice,created:now};
 expect(freshNotices([previous],[{...previous}])).toEqual([]);
 const next={...previous,body:'new message'}; expect(noticeKey(next)).toBe(noticeKey(previous)); expect(freshNotices([previous],[next])).toEqual([next]);
});
