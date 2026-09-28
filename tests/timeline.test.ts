import {test,expect} from 'bun:test';
import {containsNow,timeOffset,openingScroll} from '../src/calendar/timeline';
test('the whole current week opens at the current minute, even when Monday is selected',()=>{
  const monday=new Date(2026,8,21),now=+new Date(2026,8,25,17,35);
  expect(containsNow(monday,now)).toBe(true);
  expect(timeOffset(now,60)).toBe(1055);
  expect(openingScroll(monday,now,60,360)).toBe(995);
  expect(containsNow(new Date(2026,8,28),now)).toBe(false);
  expect(openingScroll(new Date(2026,8,28),now,60,360)).toBe(480);
});
test('opening position stays inside the timeline at midnight, late night and compact density',()=>{
  const day=new Date(2026,8,25);
  expect(openingScroll(day,+new Date(2026,8,25,0,5),52,300)).toBe(0);
  expect(openingScroll(day,+new Date(2026,8,25,23,59),52,300)).toBe(948);
  expect(openingScroll(day,+new Date(2026,8,25,12,30),40,240)).toBe(460);
});
