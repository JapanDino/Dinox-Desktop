import {calendarError} from './errors';
import {useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {CheckSquare,Plus} from 'lucide-react';
import {tx} from '../desktopText';
import {locale} from '../i18n/core';
import type {CalendarEvent,CalendarSource} from './model';
import {eventTime} from './eventLabels';
import {CreateCalendarItem} from './CreateCalendarItem';
import './sync.css';
export function CalendarTasks({tasks,sources,onRefresh}:{tasks:CalendarEvent[];sources:CalendarSource[];onRefresh:()=>void}){
 const [showDone,setShowDone]=useState(false),[query,setQuery]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState(''),[create,setCreate]=useState(false),[limit,setLimit]=useState(60);
 const entries=tasks.filter(t=>(showDone||!t.completed)&&`${t.title} ${t.sourceName}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a,b)=>Number(!!a.unscheduled)-Number(!!b.unscheduled)||a.start-b.start);
 return <section className="cs-tasks"><header><h3><CheckSquare size={17}/>{tx('Задачи календарей','Calendar tasks')}</h3><button aria-label={tx('Создать задачу в календаре','Create calendar task')} onClick={()=>setCreate(true)}><Plus size={18}/></button></header><div className="cs-task-filters"><input aria-label={tx('Поиск задач календарей','Search calendar tasks')} placeholder={tx('Найти задачу','Find a task')} value={query} onChange={e=>{setQuery(e.target.value);setLimit(60);}}/><label><input type="checkbox" checked={showDone} onChange={e=>setShowDone(e.target.checked)}/>{tx('Выполненные','Completed')}</label></div>
 {error&&<p className="cs-error" role="alert">{error}</p>}
 <div className="cs-task-list">{entries.slice(0,limit).map(task=>{const source=sources.find(s=>s.id===task.sourceId),editable=source?.provider==='google'&&source.writable;return <article key={task.id}><input type="checkbox" aria-label={`${tx('Выполнено','Completed')}: ${task.title}`} checked={!!task.completed} disabled={!editable||!!busy} onChange={e=>{setBusy(task.id);setError('');void invoke('calendar_task_complete',{accountId:source?.accountId,collectionId:source?.collectionId,id:task.uid,completed:e.target.checked}).then(onRefresh).catch(e=>setError(calendarError(e))).finally(()=>setBusy(''));}}/><div><strong className={task.completed?'cs-done':''}>{task.title||tx('Без названия','Untitled')}</strong><small>{task.unscheduled?tx('Без срока','No date'):`${new Date(task.start).toLocaleDateString(locale(),{day:'numeric',month:'short'})} · ${eventTime(task)}`} · {task.sourceName}</small>{task.description&&<p>{task.description.slice(0,300)}</p>}{!editable&&<small>{tx('Статус меняется в исходном сервисе','Change status in the original service')}</small>}</div></article>;})}{!entries.length&&<p className="cs-empty">{tasks.length?tx('Нет задач с такими условиями','No matching tasks'):tx('Подключите аккаунт с задачами или ICS-подписку, которая их содержит.','Connect an account with tasks or an ICS subscription that contains them.')}</p>}</div>
 {entries.length>limit&&<button onClick={()=>setLimit(n=>n+60)}>{tx('Показать ещё','Show more')}</button>}
 {create&&<CreateCalendarItem sources={sources} initialKind="task" onClose={()=>setCreate(false)} onSaved={onRefresh}/>}
 </section>;
}
