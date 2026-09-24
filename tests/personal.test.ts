import { test, expect } from 'bun:test';
import { shiftMonth, wheelStep, needsAttention, appWindows } from '../src/personalLogic';

test('month navigation crosses years and never skips February from a long month', () => {
  const next = shiftMonth(new Date(2026, 0, 31), 1);
  expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([2026, 1, 1]);
  const previous = shiftMonth(new Date(2026, 0, 1), -1);
  expect([previous.getFullYear(), previous.getMonth()]).toEqual([2025, 11]);
  expect(shiftMonth(new Date(2026, 11, 1), 1).getFullYear()).toBe(2027);
});
test('trackpad accumulates small deltas but throttles momentum', () => {
  let state = { total: 0, last: -Infinity, previous: -Infinity };
  let steps = 0;
  for (let i = 0; i < 20; i++) { const result = wheelStep(state, 10, 0, i * 10); state = result.state; steps += result.step; }
  expect(steps).toBe(1);
  expect(wheelStep(state, -120, 0, 600).step).toBe(-1);
});
test('wheel units and paused gestures are handled', () => {
  const empty = { total: 0, last: -Infinity, previous: -Infinity };
  expect(wheelStep(empty, 4, 1, 0).step).toBe(1);
  expect(wheelStep(empty, -1, 2, 0).step).toBe(-1);
  const partial = wheelStep(empty, 40, 0, 0).state;
  expect(wheelStep(partial, 30, 0, 1000).step).toBe(0);
});
test('attention matches secondary grouped windows without affecting other apps', () => {
  const app = { hwnd: 10, all_hwnds: [[10, 'one'], [20, 'two']] as [number,string][] };
  expect(appWindows(app)).toEqual([10,20]);
  expect(needsAttention(app, {20: 4000}, 1000)).toBe(true);
  expect(needsAttention({hwnd:30}, {20:4000}, 1000)).toBe(false);
  expect(needsAttention(app, {20:4000}, 4000)).toBe(false);
  expect(needsAttention({}, {20:4000}, 1000)).toBe(false);
});
