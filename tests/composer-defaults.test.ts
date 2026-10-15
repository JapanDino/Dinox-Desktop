import {test,expect} from 'bun:test';
import {composerDefaults,localCalendarDate} from '../src/calendar/composerDefaults';
test('today advances to the next half hour rather than creating in the past',()=>{
 const now=new Date(2026,9,12,17,45);expect(composerDefaults(now,now)).toEqual({day:'2026-10-12',endDay:'2026-10-12',time:'18:00',endTime:'19:00'});
 const boundary=new Date(2026,9,12,10,0);expect(composerDefaults(boundary,boundary).time).toBe('10:30');
});
test('midnight rollover keeps a positive one-hour duration and coherent dates',()=>{
 const now=new Date(2026,9,12,23,50);expect(composerDefaults(now,now)).toEqual({day:'2026-10-13',endDay:'2026-10-13',time:'00:00',endTime:'01:00'});
 const late=new Date(2026,9,12,23,10);expect(composerDefaults(late,late)).toEqual({day:'2026-10-12',endDay:'2026-10-13',time:'23:30',endTime:'00:30'});
});
test('explicitly selected past and future dates stay selected and use local calendar components',()=>{
 const now=new Date(2026,9,12,17,45);
 for(const selected of [new Date(2026,9,11),new Date(2026,9,14)]) {const defaults=composerDefaults(selected,now);expect(defaults.day).toBe(localCalendarDate(selected));expect(defaults.time).toBe('09:00');expect(defaults.endTime).toBe('10:00');}
});
