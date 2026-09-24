export function shiftMonth(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

export interface WheelState { total: number; last: number; previous: number }
export function wheelStep(state: WheelState, delta: number, mode: number, now: number) {
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? 240 : 1);
  const reset = now - state.previous > 200 || Math.sign(pixels) !== Math.sign(state.total);
  let total = (reset ? 0 : state.total) + pixels;
  const step = now - state.last >= 300 && Math.abs(total) >= 60 ? Math.sign(total) : 0;
  if (step || now - state.last < 300) total = 0;
  return { step, state: { total, last: step ? now : state.last, previous: now } };
}

export interface WindowApp { hwnd?: number; all_hwnds?: [number, string][] }
export function appWindows(app: WindowApp): number[] {
  return [...new Set([...(app.hwnd ? [app.hwnd] : []), ...(app.all_hwnds || []).map(([id]) => id)])];
}
export function needsAttention(app: WindowApp, entries: Record<number, number>, now: number) {
  return appWindows(app).some(id => (entries[id] || 0) > now);
}
