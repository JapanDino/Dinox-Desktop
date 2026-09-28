import {test,expect} from 'bun:test';
import {parseTasks} from '../src/calendar/tasks';
import {parseCalendar,onDay,type CalendarSource} from '../src/calendar/model';
import {makeDraft,accountSources} from '../src/calendar/accounts';
const from=Date.parse('2026-09-01'),to=Date.parse('2026-10-01');
const todo=(body:string)=>`BEGIN:VTODO\r\n${body}\r\nEND:VTODO`;
const source=(body:string):CalendarSource=>({id:'tasks',name:'Tasks',enabled:true,color:'#fff',checked:0,ics:`BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR`});
test('task due date is inclusive and does not create a week-long appointment',()=>{
 const [e]=parseTasks(source(todo('UID:a\r\nDTSTART;VALUE=DATE:20260907\r\nDUE;VALUE=DATE:20260914')),from,to);
 expect(e.kind).toBe('task');expect(onDay(e,new Date(2026,8,14))).toBe(true);expect(onDay(e,new Date(2026,8,13))).toBe(false);expect(e.end-e.start).toBe(86400000);
});
test('timed task preserves the deadline timezone separately from its start',()=>{
 const [e]=parseTasks(source(todo('UID:a\r\nDTSTART;TZID=America/New_York:20260907T090000\r\nDUE;TZID=Europe/Moscow:20260908T120000')),from,to);
 expect(new Date(e.start).toISOString()).toBe('2026-09-08T09:00:00.000Z');expect(e.end-e.start).toBe(60000);
});
test('undated and completed tasks remain discoverable; cancelled tasks disappear',()=>{
 const events=parseTasks(source([todo('UID:a\r\nSUMMARY:Undated'),todo('UID:b\r\nCOMPLETED:20260907T120000Z'),todo('UID:c\r\nPERCENT-COMPLETE:100'),todo('UID:d\r\nSTATUS:CANCELLED')].join('\r\n')),from,to);
 expect(events).toHaveLength(3);expect(events.every(e=>e.unscheduled)).toBe(true);expect(events.map(e=>e.completed)).toEqual([false,true,true]);
});
test('task recurrence shifts exclusions and cancelled instances to deadline',()=>{
 const master=todo('UID:a\r\nDTSTART:20260907T090000Z\r\nDUE:20260907T120000Z\r\nRRULE:FREQ=DAILY;COUNT=4\r\nEXDATE:20260908T090000Z');
 const cancel=todo('UID:a\r\nRECURRENCE-ID:20260909T090000Z\r\nSTATUS:CANCELLED');
 const events=parseTasks(source(master+'\r\n'+cancel),from,to);
 expect(events.map(e=>new Date(e.start).toISOString())).toEqual(['2026-09-07T12:00:00.000Z','2026-09-10T12:00:00.000Z']);
});
test('moved task instance does not duplicate its original deadline',()=>{
 const master=todo('UID:a\r\nDTSTART:20260907T090000Z\r\nDUE:20260907T120000Z\r\nRRULE:FREQ=DAILY;COUNT=2');
 const moved=todo('UID:a\r\nRECURRENCE-ID:20260908T090000Z\r\nDTSTART:20260908T090000Z\r\nDUE:20260908T150000Z');
 expect(parseTasks(source(master+'\r\n'+moved),from,to).map(e=>new Date(e.start).getUTCHours())).toEqual([12,15]);
});
const writable:CalendarSource={...source(''),kind:'event',provider:'google',writable:true,accountId:'account',collectionId:'calendar'};
const base={source:writable,kind:'event' as const,title:'Plan',description:'',day:'2026-09-28',time:'10:00',endDay:'2026-09-28',endTime:'11:00',allDay:true,requestId:'613a6a45-cbe9-4a3a-84a4-5d6716dac7f8'};
test('all-day creation converts inclusive UI date to exclusive API end',()=>{expect(makeDraft(base).end).toBe('2026-09-29');expect(makeDraft({...base,endDay:'2026-09-30'}).end).toBe('2026-10-01');});
test('rejects invalid dates, reversed time and read-only destinations',()=>{
 expect(()=>makeDraft({...base,day:'2026-02-30'})).toThrow();expect(()=>makeDraft({...base,allDay:false,endTime:'09:00'})).toThrow();expect(()=>makeDraft({...base,source:{...writable,writable:false}})).toThrow();expect(()=>makeDraft({...base,title:' '})).toThrow();
});
test('Google task supports a date or no date but rejects fabricated exact time',()=>{
 const task={...base,kind:'task' as const,source:{...writable,kind:'task' as const}};
 expect(makeDraft(task).start).toBe('2026-09-28');expect(makeDraft({...task,day:''}).start).toBeNull();expect(()=>makeDraft({...task,allDay:false})).toThrow();expect(makeDraft(task).end).toBeNull();
});
test('Google tasks retain local dates, undated and completed rows without polluting timeline',()=>{
 const items=[{id:'a',title:'Deadline',start:'2026-09-28',end:null,all_day:true,task:true,completed:false,description:'',url:''},{id:'b',title:'Someday',start:null,end:null,all_day:true,task:true,completed:false,description:'',url:''},{id:'c',title:'Done',start:'2026-09-28',end:null,all_day:true,task:true,completed:true,description:'',url:''}];
 const [s]=accountSources([{id:'a',provider:'google',label:'Demo',collections:[{id:'t',name:'Tasks',kind:'task',writable:true,ics:'',checked:0,items}]}]);
 expect(parseTasks(s,from,to)).toHaveLength(3);const events=parseCalendar(s,from,to);expect(events).toHaveLength(1);expect(new Date(events[0].start).getDate()).toBe(28);
});
test('weekly BYDAY stays tied to DTSTART while deadline falls on another weekday',()=>{
 const events=parseTasks(source(todo('UID:a\r\nDTSTART;VALUE=DATE:20260907\r\nDUE;VALUE=DATE:20260909\r\nRRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260921')),from,to);
 expect(events.map(e=>new Date(e.start).getDate())).toEqual([9,16,23]);
});
