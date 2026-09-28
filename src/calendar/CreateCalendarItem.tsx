import {calendarError} from './errors';
import {useId,useRef,useState,useEffect} from 'react';
import {createPortal} from 'react-dom';
import {invoke} from '@tauri-apps/api/core';
import {X,Check,CalendarDays,Clock3,ChevronDown,AlignLeft} from 'lucide-react';
import {tx} from '../desktopText';
import {locale} from '../i18n/core';
import {makeDraft} from './accounts';
import type {CalendarSource} from './model';
import './sync.css';
const localDate=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function CreateCalendarItem({sources,onClose,onSaved,initialKind='event',initialDate=new Date()}:{sources:CalendarSource[];onClose:()=>void;onSaved:()=>void;initialKind?:'event'|'task';initialDate?:Date}){
 const [kind,setKind]=useState(initialKind),[sourceId,setSourceId]=useState('');
 const [title,setTitle]=useState(''),[description,setDescription]=useState('');
 const [day,setDay]=useState(()=>localDate(initialDate)),[endDay,setEndDay]=useState(()=>localDate(initialDate));
 const [time,setTime]=useState('10:00'),[endTime,setEndTime]=useState('11:00'),[allDay,setAllDay]=useState(initialKind==='task');
 const [details,setDetails]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[uncertain,setUncertain]=useState(false);
 const detailsId=useId(),request=useRef(crypto.randomUUID()),root=useRef<HTMLDivElement>(null),previous=useRef(document.activeElement as HTMLElement|null);
 const options=sources.filter(s=>s.writable&&s.kind===kind),source=options.find(s=>s.id===sourceId)||options[0],dateOnly=kind==='task'&&source?.provider==='google';
 const hasTime=!allDay&&!dateOnly;
 useEffect(()=>{root.current?.querySelector<HTMLInputElement>('input')?.focus();return()=>previous.current?.focus();},[]);
 const change=()=>{request.current=crypto.randomUUID();setError('');};
 const submit=async()=>{
  if(!source)return;
  setBusy(true);setError('');
  try{
   const draft=makeDraft({source,kind,title,description,day,time,endDay,endTime,allDay:dateOnly||allDay,requestId:request.current});
   const result=await invoke<{saved:boolean;warning?:string}>('calendar_create_item',{draft});
   if(!result.saved)throw new Error('Service did not confirm creation');
   setSaved(true);onSaved();
   if(result.warning)setError(tx('Запись создана. Список обновится после восстановления связи.','Entry created. The list will update when connectivity returns.'));
  }catch(e){setError(calendarError(e));if(/uncertain|Previous creation/i.test(String(e)))setUncertain(true);}
  finally{setBusy(false);}
 };
 return createPortal(<div className="cs-backdrop" onClick={e=>e.stopPropagation()}>
  <div ref={root} className={`cs-composer cs-quick-composer ${details?'cs-expanded':''}`} role="dialog" aria-modal="true" aria-label={tx('Создание записи','Create entry')} onKeyDown={e=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!busy)onClose();}
   if(e.key==='Tab'){
    const elements=Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')||[]).filter(e=>e.getClientRects().length);
    const first=elements[0],last=elements[elements.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
   }
  }}>
   <button className="cs-quick-close" aria-label={tx('Закрыть создание','Close composer')} disabled={busy} onClick={onClose}><X size={17}/></button>
   {saved?<div className="cs-success"><Check size={28}/><h3>{tx('Создано в календаре','Created in your calendar')}</h3><strong>{title}</strong><p>{source?.name}</p>{error&&<p>{error}</p>}<button onClick={onClose}>{tx('Готово','Done')}</button></div>:
    <form onSubmit={e=>{e.preventDefault();void submit();}}>
     <fieldset disabled={busy||uncertain}>
      <input className="cs-quick-title" required maxLength={300} aria-label={tx('Название записи','Entry title')} value={title} onChange={e=>{setTitle(e.target.value);change();}} placeholder={kind==='task'?tx('Что нужно сделать?','What needs doing?'):tx('Добавьте название','Add a title')}/>
      <div className="cs-quick-tabs">{(['event','task'] as const).map(k=><button type="button" aria-pressed={kind===k} key={k} onClick={()=>{setKind(k);setSourceId('');setAllDay(k==='task');change();}}>{k==='event'?tx('Событие','Event'):tx('Задача','Task')}</button>)}</div>
      {!options.length?<div className="cs-empty"><p>{tx('Подключите календарь, чтобы сохранять записи в исходном сервисе.','Connect a writable calendar to save entries to the original service.')}</p><button type="button" onClick={()=>{void invoke('open_calendar_settings').then(onClose).catch(e=>setError(calendarError(e)));}}>{tx('Подключить календарь','Connect a calendar')}</button></div>:<>
       <div className="cs-quick-row"><Clock3 size={17} aria-hidden="true"/><div className="cs-quick-schedule">
        <div className={`cs-quick-when ${hasTime&&kind==='event'?'cs-with-range':''}`}>
         <input aria-label={tx('Дата начала','Start date')} type="date" required={kind==='event'} value={day} onChange={e=>{setDay(e.target.value);if(endDay===day||endDay<e.target.value)setEndDay(e.target.value);change();}}/>
         {hasTime&&<input aria-label={tx('Время начала','Start time')} type="time" required value={time} onChange={e=>{setTime(e.target.value);change();}}/>}
         {hasTime&&kind==='event'&&<><span className="cs-time-dash" aria-hidden="true">—</span><input aria-label={tx('Время окончания','End time')} type="time" required value={endTime} onChange={e=>{setEndTime(e.target.value);change();}}/></>}
        </div>
        <div className="cs-quick-date-options">
         {dateOnly?<span>{tx('Дата задачи · без времени','Task date · no time')}</span>:<label className="cs-checkbox"><input type="checkbox" checked={allDay} onChange={e=>{setAllDay(e.target.checked);change();}}/>{kind==='task'?tx('Без точного времени','No exact time'):tx('Весь день','All day')}</label>}
         {kind==='task'&&day&&<button className="cs-link-button" type="button" onClick={()=>{setDay('');setAllDay(true);change();}}>{tx('Без срока','No date')}</button>}
         {kind==='task'&&!day&&<span>{tx('Без срока','No date')}</span>}
         {kind==='event'&&day!==endDay&&<button className="cs-link-button" type="button" onClick={()=>setDetails(true)}>{tx('до','until')} {new Date(endDay+'T12:00:00').toLocaleDateString(locale(),{day:'numeric',month:'short'})}</button>}
        </div>
       </div></div>
       <div className="cs-quick-row"><CalendarDays size={17} aria-hidden="true"/><select aria-label={tx('Куда сохранить','Save to')} value={source?.id} onChange={e=>{setSourceId(e.target.value);change();}}>{options.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
       <button className="cs-details-toggle" type="button" aria-expanded={details} aria-controls={detailsId} onClick={()=>setDetails(v=>!v)}><AlignLeft size={17}/><span>{details?tx('Свернуть детали','Hide details'):description?tx('Детали · есть описание','Details · description added'):tx('Детали','Details')}</span><ChevronDown size={15}/></button>
       {details&&<div id={detailsId} className="cs-extra-details">
        {kind==='event'&&<label>{tx('Дата окончания','End date')}<input aria-label={tx('Дата окончания','End date')} type="date" required value={endDay} min={day||undefined} onChange={e=>{setEndDay(e.target.value);change();}}/></label>}
        <label>{tx('Описание','Description')}<textarea aria-label={tx('Описание записи','Entry description')} maxLength={8000} rows={2} value={description} onChange={e=>{setDescription(e.target.value);change();}} placeholder={tx('Ссылка, план или пара слов','A link, an agenda or a few words')}/></label>
        {dateOnly?<p className="cs-footnote">{tx('Google передаёт задачам только дату. Для точного времени создайте событие.','Google only provides a date for tasks. Create an event for an exact time.')}</p>:hasTime&&<small>{tx('Часовой пояс:','Time zone:')} {Intl.DateTimeFormat().resolvedOptions().timeZone}</small>}
       </div>}
      </>}
     </fieldset>
     {error&&<p role="alert" className="cs-error">{error}</p>}
     {uncertain&&<p className="cs-footnote">{tx('Не отправляем повторно, чтобы избежать дубля. Проверьте исходный календарь и обновите список.','We will not resend and risk a duplicate. Check the original calendar and refresh the list.')}</p>}
     <footer><button type="button" className="cs-cancel" disabled={busy} onClick={onClose}>{tx('Отмена','Cancel')}</button><button className="cs-primary" disabled={busy||uncertain||!source||!title.trim()}>{busy?tx('Сохранение…','Saving…'):tx('Создать','Create')}</button></footer>
    </form>}
  </div>
 </div>,document.body);
}
