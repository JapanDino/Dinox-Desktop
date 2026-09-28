export type Task = {id:string;text:string;done:boolean;due?:string};
export function validDate(value:unknown):boolean{if(value==='')return true;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===value;}
export type ProjectLink = {id:string;name:string;target:string};
export const widgetCatalog=[{id:'tasks',ru:'Задачи',en:'Tasks'},{id:'note',ru:'Заметки',en:'Notes'},{id:'projects',ru:'Мои проекты',en:'My projects'},{id:'music',ru:'Музыка',en:'Music'},{id:'today',ru:'Сегодня',en:'Today'},{id:'calendar',ru:'Календарь',en:'Calendar'},{id:'focus',ru:'Фокус',en:'Focus'}];
export function readWidgetLayout(raw:string):{order:string[];wide:string[]}{
  const ids=widgetCatalog.map(w=>w.id);
  try{const value=JSON.parse(raw);return {order:[...new Set([...(Array.isArray(value?.order)?value.order.filter((id:unknown)=>typeof id==='string'&&ids.includes(id)):[]),...ids])] as string[],wide:Array.isArray(value?.wide)?ids.filter(id=>value.wide.includes(id)):[]};}
  catch{return {order:ids,wide:[]};}
}
export function tasksFrom(value:unknown):Task[]{
  if(!Array.isArray(value)||value.length>100||value.some(v=>!v||typeof v.id!=='string'||typeof v.text!=='string'||v.text.length>200||typeof v.done!=='boolean'||(v.due!==undefined&&!validDate(v.due)))||new Set(value.map(v=>v.id)).size!==value.length)throw new Error('Invalid tasks');
  return value;
}
export function linksFrom(value:unknown):ProjectLink[]{
  if(!Array.isArray(value)||value.length>40||value.some(v=>!v||typeof v.id!=='string'||typeof v.name!=='string'||v.name.length>80||typeof v.target!=='string'||v.target.length>2048)||new Set(value.map(v=>v.id)).size!==value.length)throw new Error('Invalid links');
  return value;
}
export function noteFrom(value:unknown):string{if(typeof value!=='string'||value.length>20000)throw new Error('Invalid note');return value;}
export function validTarget(raw:string):boolean{
  const target=raw.trim();if(!target||target.length>2048||/[\x00-\x1f]/.test(target))return false;
  if(/^https?:\/\//i.test(target)){try{const u=new URL(target);return !!u.hostname&&!u.username&&!u.password;}catch{return false;}}
  return /^[a-z]:[\\/]/i.test(target)||/^\\\\[^\\]+\\[^\\]+/.test(target);
}
