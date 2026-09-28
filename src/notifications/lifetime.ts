import type {Notice} from './model';

// Hover/focus may give the reader extra time, but a lost pointer-leave event
// must never keep a transient popup (and the island) open indefinitely.
export const READING_GRACE_MS = 15_000;
export type Popup = {notice:Notice;expires:number;deadline:number};
export function popup(notice:Notice,duration:number,now=Date.now()):Popup {
  const expires=now+duration*1000;
  return {notice,expires,deadline:expires+READING_GRACE_MS};
}
export function livePopups(items:Popup[],now:number,paused:boolean) {
  return items.filter(item=>now<item.deadline&&(paused||now<item.expires));
}
export function resumePopups(items:Popup[],elapsed:number) {
  return items.map(item=>({...item,expires:Math.min(item.deadline,item.expires+Math.max(0,elapsed))}));
}
