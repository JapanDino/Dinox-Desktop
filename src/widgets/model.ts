export interface FocusState { duration: number; remaining: number; deadline: number | null; task: string }
export const newFocus = (minutes = 25): FocusState => ({duration: minutes * 60, remaining: minutes * 60, deadline: null, task: ''});
export function readFocus(raw: string | null): FocusState {
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || !Number.isInteger(value.duration) || value.duration < 60 || value.duration > 7200 ||
        !Number.isFinite(value.remaining) || value.remaining < 0 || value.remaining > value.duration ||
        (value.deadline !== null && (!Number.isFinite(value.deadline) || value.deadline < 0)) || typeof value.task !== 'string') return newFocus();
    return {...value, task: value.task.slice(0, 160)};
  } catch { return newFocus(); }
}
export const secondsLeft = (state: FocusState, now: number) => state.deadline === null
  ? state.remaining : Math.min(state.duration, Math.max(0, Math.ceil((state.deadline - now) / 1000)));
export function toggleFocus(state: FocusState, now: number): FocusState {
  const remaining = secondsLeft(state, now);
  return state.deadline !== null && remaining > 0 ? {...state, remaining, deadline: null}
    : {...state, remaining: remaining || state.duration, deadline: now + (remaining || state.duration) * 1000};
}
export function shiftMonth(date: Date, amount: number) { return new Date(date.getFullYear(), date.getMonth() + amount, 1); }
