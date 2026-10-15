import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {X} from 'lucide-react';
import {tx} from '../desktopText';
import {calendarError} from './errors';
import type {CalendarSource} from './model';

export function CalendarVisibility({sources,onClose,onSaved,onOpenChange}:{sources:CalendarSource[];onClose:()=>void;onSaved:()=>Promise<void>;onOpenChange?:(open:boolean)=>void}) {
 const root=useRef<HTMLDivElement>(null),previous=useRef(document.activeElement as HTMLElement|null);
 const [query,setQuery]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const saving=useRef(false);
 useLayoutEffect(()=>{onOpenChange?.(true);return()=>onOpenChange?.(false);},[onOpenChange]);
 useEffect(()=>{root.current?.querySelector<HTMLInputElement>('input')?.focus();return()=>previous.current?.focus();},[]);
 const update=async(items:CalendarSource[],enabled:boolean)=>{
  if(saving.current)return;
  saving.current=true;setBusy(true);setError('');
  try {
   for(const s of items.filter(s=>s.enabled!==enabled)) {
    await (s.accountId?invoke('calendar_collection_enabled',{accountId:s.accountId,collectionId:s.collectionId,kind:s.kind,enabled}):invoke('calendar_save',{id:s.id,name:s.name,color:s.color,enabled,url:null}));
   }
  } catch(e) {setError(calendarError(e));}
  finally {await onSaved();saving.current=false;setBusy(false);}
 };
 const visible=sources.filter(s=>s.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 return <div className="cal-picker-backdrop" onClick={()=>{if(!busy)onClose();}}>
  <div ref={root} className="cal-picker" role="dialog" aria-modal="true" aria-label={tx('Видимые календари','Visible calendars')} onClick={e=>e.stopPropagation()} onKeyDown={e=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!busy)onClose();}
   if(e.key==='Tab'){
    const elements=Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')||[]).filter(el=>el.getClientRects().length);
    const first=elements[0],last=elements[elements.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
   }
  }}>
   <header><strong>{tx('Календари','Calendars')}</strong><button className="cal-icon-button" disabled={busy} aria-label={tx('Закрыть список календарей','Close calendar list')} onClick={onClose}><X size={17}/></button></header>
   <p>{tx('Выберите, что показывать в Dinox. Исходные календари не изменятся.','Choose what appears in Dinox. Your original calendars stay unchanged.')}</p>
   <input className="cal-picker-search" type="search" aria-label={tx('Найти календарь','Find a calendar')} placeholder={tx('Найти календарь','Find a calendar')} value={query} onChange={e=>setQuery(e.target.value)}/>
   <div className="cal-picker-actions"><span aria-live="polite">{sources.filter(s=>s.enabled).length} / {sources.length}</span><button disabled={busy||!visible.length} onClick={()=>void update(visible,true)}>{query.trim()?tx('Показать найденные','Show matches'):tx('Показать все','Show all')}</button><button disabled={busy||!visible.length} onClick={()=>void update(visible,false)}>{query.trim()?tx('Скрыть найденные','Hide matches'):tx('Скрыть все','Hide all')}</button></div>
   {error&&<p className="cal-error" role="alert">{error}</p>}
   <div className="cal-picker-list" aria-busy={busy}>{visible.map(s=><label key={s.id} className={!s.enabled?'is-hidden':''}>
    <input type="checkbox" checked={s.enabled} disabled={busy} onChange={e=>void update([s],e.target.checked)}/>
    <span className="cal-dot" style={{background:s.color}}/>
    <span>{s.name}<small>{s.kind==='task'?tx('Задачи','Tasks'):tx('События','Events')}</small></span>
   </label>)}{!visible.length&&<p>{sources.length?tx('Ничего не найдено','No calendars found'):tx('Сначала подключите календарь в настройках','Connect a calendar in settings first')}</p>}</div>
   <footer><small aria-live="polite">{busy?tx('Сохранение…','Saving…'):tx('Выбор сохраняется автоматически','Selection is saved automatically')}</small><button className="cal-text-button" disabled={busy} onClick={onClose}>{tx('Готово','Done')}</button></footer>
  </div>
 </div>;
}
