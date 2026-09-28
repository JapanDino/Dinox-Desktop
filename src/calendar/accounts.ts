import {tx} from '../desktopText';
import type {CalendarSource,RemoteItem} from './model';
export interface Collection{id:string;name:string;kind:'event'|'task';writable:boolean;enabled?:boolean;ics:string;items:RemoteItem[];checked:number}
export interface CalendarAccount{id:string;provider:'google'|'yandex';label:string;collections:Collection[]}
export function accountSources(accounts:CalendarAccount[]):CalendarSource[]{return accounts.flatMap(account=>account.collections.map(c=>({id:`sync:${account.id}:${c.kind}:${encodeURIComponent(c.id)}`,accountId:account.id,collectionId:c.id,provider:account.provider,kind:c.kind,writable:c.writable,name:`${c.name} · ${account.provider==='google'?'Google':'Яндекс'}`,color:c.kind==='task'?'#8dd6b0':'#b7a6ff',enabled:c.enabled!==false,ics:c.ics,checked:c.checked,...(account.provider==='google'?{items:c.items}:{})})));}
export interface CreateDraft{request_id:string;account_id:string;collection_id:string;kind:'event'|'task';title:string;description:string;start:string|null;end:string|null;all_day:boolean}
export function makeDraft(input:{source:CalendarSource;kind:'event'|'task';title:string;description:string;day:string;time:string;endDay:string;endTime:string;allDay:boolean;requestId:string}):CreateDraft{
 const {source,kind,title,description,day,time,endDay,endTime,allDay,requestId}=input;
 if(!source.writable||!source.accountId||!source.collectionId||source.kind!==kind)throw new Error(tx('Выберите календарь с доступом на запись','Choose a writable calendar'));
 if(!title.trim())throw new Error(tx('Введите название','Enter a title'));
 if(kind==='task'&&source.provider==='google'&&!allDay)throw new Error(tx('Google Tasks поддерживает дату, но не точное время','Google Tasks supports dates, not exact times'));
 if(kind==='event'&&(!day||!endDay))throw new Error(tx('Выберите даты начала и окончания','Choose start and end dates'));
 const date=(d:string,t:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(d))throw new Error(tx('Проверьте дату','Check the date'));const value=new Date(`${d}T${allDay?'00:00':t}`);if(!Number.isFinite(+value)||value.getFullYear()!==+d.slice(0,4)||value.getMonth()+1!==+d.slice(5,7)||value.getDate()!==+d.slice(8,10)||(!allDay&&(value.getHours()!==+t.slice(0,2)||value.getMinutes()!==+t.slice(3,5))))throw new Error(tx('Такое местное время не существует. Выберите другое.','This local date or time does not exist. Choose another.'));return allDay?d:value.toISOString();};
 const start=day?date(day,time):null;let end=kind==='event'?date(endDay,endTime):null;
 // The UI end date is inclusive; calendar APIs use an exclusive all-day end.
 if(end&&allDay){const d=new Date(end+'T12:00:00');d.setDate(d.getDate()+1);end=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
 if(start&&end&&end<=start)throw new Error(tx('Окончание должно быть позже начала','The end must follow the start'));
 if(!day&&!allDay)throw new Error(tx('Для времени нужна дата','A time requires a date'));
 return {request_id:requestId,account_id:source.accountId,collection_id:source.collectionId,kind,title:title.trim(),description,start,end,all_day:allDay};
}
