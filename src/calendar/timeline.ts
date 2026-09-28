import {weekStart,addDays} from './model';
export const containsNow = (date:Date,now:number) => now>=+weekStart(date)&&now<+addDays(weekStart(date),7);
export const timeOffset = (now:number,hourHeight:number) => {const date=new Date(now);return (date.getHours()+date.getMinutes()/60)*hourHeight;};
export function openingScroll(date:Date,now:number,hourHeight:number,viewport:number) {
  const target=containsNow(date,now)?timeOffset(now,hourHeight)-Math.min(hourHeight,viewport/3):8*hourHeight;
  return Math.max(0,Math.min(target,24*hourHeight-viewport));
}
