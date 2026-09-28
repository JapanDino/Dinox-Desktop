import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {CheckSquare,FolderOpen,Music2,Plus,Trash2,ArrowUpRight,Play,Pause,SkipBack,SkipForward,Undo2} from 'lucide-react';
import {tx} from '../desktopText';
import {locale} from '../i18n/core';
import {CalendarTasks} from '../calendar/CalendarTasks';
import type {CalendarEvent,CalendarSource} from '../calendar/model';
import {tasksFrom,linksFrom,validTarget,validDate,type Task,type ProjectLink} from './personalModel';

// Failed writes retain their drafts while the overlay is hidden, so dismissing
// the board cannot silently discard text after a quota/storage error.
const drafts=new Map<string,unknown>();
function useLocalCard<T>(key:string,initial:T,decode:(value:unknown)=>T){
  const [loaded]=useState(()=>{try{const raw=localStorage.getItem(key);return {value:drafts.has(key)?decode(drafts.get(key)):raw===null?initial:decode(JSON.parse(raw)),blocked:false};}catch{return {value:initial,blocked:true};}});
  const [value,setValue]=useState(loaded.value),[error,setError]=useState(loaded.blocked||drafts.has(key));
  const save=(next:T)=>{if(loaded.blocked)return;setValue(next);drafts.set(key,next);try{localStorage.setItem(key,JSON.stringify(next));drafts.delete(key);setError(false);}catch{setError(true);}};
  return {value,save,blocked:loaded.blocked,status:<p className={error?'wb-save-error':'wb-save-status'} role={error?'alert':'status'}>{loaded.blocked?tx('Не удалось прочитать данные. Исходная запись сохранена; редактирование отключено.','Could not read data. The original entry is preserved; editing is disabled.'):error?<>{tx('Не сохранено на диск. Черновик доступен до выхода из Dinox.','Not saved to disk. Draft retained until Dinox exits.')} <button onClick={()=>save(value)}>{tx('Повторить','Retry')}</button></>:tx('Сохранено на этом устройстве','Saved on this device')}</p>};
}

export function TasksWidget({calendarTasks=[],calendarSources=[],refreshCalendar=()=>{}}:{calendarTasks?:CalendarEvent[];calendarSources?:CalendarSource[];refreshCalendar?:()=>void}){
  const data=useLocalCard<Task[]>('dinox-widget-tasks-data',[],tasksFrom);
  const [text,setText]=useState(''),[due,setDue]=useState(''),[removed,setRemoved]=useState<{task:Task;index:number}|null>(null);
  const remaining=data.value.filter(t=>!t.done).length;
  return <article className="wb-card wb-tasks"><header><h2><CheckSquare size={17}/>{tx('Задачи','Tasks')}</h2><span>{remaining} {tx('осталось','remaining')}</span></header>
    <form className="wb-inline-form" onSubmit={e=>{e.preventDefault();if(!text.trim()||!validDate(due)||data.blocked||data.value.length>=100)return;data.save([...data.value,{id:crypto.randomUUID(),text:text.trim(),done:false,due}]);setText('');setDue('');}}>
      <input aria-label={tx('Новая задача','New task')} placeholder={tx('Что нужно сделать?','What needs doing?')} maxLength={200} value={text} disabled={data.blocked||data.value.length>=100} onChange={e=>setText(e.target.value)}/><button aria-label={tx('Добавить задачу','Add task')} disabled={!text.trim()||data.blocked||data.value.length>=100}><Plus size={17}/></button>
    </form>
    <label className="wb-due">{tx('Срок новой задачи','New task due date')}<input type="date" min="0001-01-01" max="9999-12-31" aria-label={tx('Срок новой задачи','New task due date')} value={due} disabled={data.blocked} onChange={e=>setDue(e.target.value)}/></label>
    <ul className="wb-task-list">{data.value.map((task,index)=><li key={task.id}><label><input type="checkbox" checked={task.done} disabled={data.blocked} onChange={()=>data.save(data.value.map(t=>t.id===task.id?{...t,done:!t.done}:t))}/><span className={task.done?'done':''}>{task.text}{task.due&&<small className={!task.done&&new Date(task.due+'T23:59:59').getTime()<Date.now()?'overdue':''}>{new Date(task.due+'T12:00:00').toLocaleDateString(locale(),{day:'numeric',month:'short',year:'numeric'})}</small>}</span></label><button aria-label={`${tx('Удалить','Delete')}: ${task.text}`} onClick={()=>{setRemoved({task,index});data.save(data.value.filter(t=>t.id!==task.id));}}><Trash2 size={14}/></button></li>)}</ul>
    {!data.value.length&&<p className="wb-card-empty">{tx('Освободите голову — запишите первое дело.','Clear your head — write down your first task.')}</p>}
    {data.value.length>=100&&<p className="wb-hint">{tx('Лимит: 100 задач. Удалите ненужные.','Limit: 100 tasks. Remove any you no longer need.')}</p>}
    {removed&&<button className="wb-undo" disabled={data.value.length>=100} onClick={()=>{const next=[...data.value];next.splice(removed.index,0,removed.task);data.save(next);setRemoved(null);}}><Undo2 size={14}/>{tx('Вернуть удалённую задачу','Restore deleted task')}</button>}{data.status}
    <CalendarTasks tasks={calendarTasks} sources={calendarSources} onRefresh={refreshCalendar}/>
  </article>;
}

export {StickyNotesWidget as NoteWidget} from '../notes/StickyNotes';

export function ProjectsWidget(){
  const data=useLocalCard<ProjectLink[]>('dinox-widget-projects-data',[],linksFrom);
  const [editing,setEditing]=useState(false),[name,setName]=useState(''),[target,setTarget]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[removed,setRemoved]=useState<ProjectLink|null>(null);
  const open=async(link:ProjectLink)=>{setBusy(true);setError('');try{await invoke('widgets_open_target',{target:link.target});}catch{setError(tx('Не удалось открыть. Проверьте адрес или наличие файла.','Could not open. Check the address or whether the file exists.'));}finally{setBusy(false);}};
  return <article className="wb-card wb-projects"><header><h2><FolderOpen size={17}/>{tx('Мои проекты','My projects')}</h2><button aria-label={tx('Добавить ссылку или путь','Add link or path')} aria-expanded={editing} disabled={data.blocked} onClick={()=>setEditing(v=>!v)}><Plus size={17}/></button></header>
    <ul className="wb-project-list">{data.value.map(link=><li key={link.id}><button disabled={busy} onClick={()=>void open(link)} title={link.target}><FolderOpen size={17}/><span><strong>{link.name}</strong><small>{link.target}</small></span><ArrowUpRight size={15}/></button><button aria-label={`${tx('Удалить','Delete')}: ${link.name}`} onClick={()=>{setRemoved(link);data.save(data.value.filter(l=>l.id!==link.id));}}><Trash2 size={14}/></button></li>)}</ul>
    {!data.value.length&&!editing&&<p className="wb-card-empty">{tx('Соберите рядом папки, файлы, приложения и ссылки вашего проекта.','Keep your project folders, files, apps and links together.')}</p>}
    {editing&&<form className="wb-project-form" onSubmit={e=>{e.preventDefault();if(!validTarget(target)){setError(tx('Нужна ссылка https://… или полный путь, например C:\\Projects.','Enter an https://… link or a full path, such as C:\\Projects.'));return;}if(!name.trim()||data.value.length>=40)return;data.save([...data.value,{id:crypto.randomUUID(),name:name.trim(),target:target.trim()}]);setName('');setTarget('');setError('');setEditing(false);}}>
      <input aria-label={tx('Название проекта','Project name')} placeholder={tx('Название, например FAIO','Name, e.g. FAIO')} value={name} maxLength={80} onChange={e=>setName(e.target.value)} required/>
      <input aria-label={tx('Ссылка или путь','Link or path')} placeholder="https://… / C:\Projects" value={target} maxLength={2048} onChange={e=>setTarget(e.target.value)} required/>
      <p className="wb-hint">{tx('Вставьте ссылку или полный путь из Проводника. Приложение — путь к его EXE, без аргументов.','Paste a link or full path from Explorer. For an app, use its EXE path without arguments.')}</p>
      <div><button disabled={!name.trim()||!target.trim()||data.value.length>=40}>{tx('Закрепить','Pin')}</button><button type="button" onClick={()=>setEditing(false)}>{tx('Отмена','Cancel')}</button></div>
    </form>}
    {data.value.length>=40&&<p className="wb-hint">{tx('Лимит: 40 закреплений.','Limit: 40 pins.')}</p>}
    {removed&&<button className="wb-undo" disabled={data.value.length>=40} onClick={()=>{data.save([...data.value,removed]);setRemoved(null);}}><Undo2 size={14}/>{tx('Вернуть закрепление','Restore pin')}</button>}
    {error&&<p className="wb-save-error" role="alert">{error}</p>}{data.status}
  </article>;
}

type Media={title:string;artist:string;is_playing:boolean;has_media:boolean;artwork?:string[]|null};
export function MusicWidget(){
  const [media,setMedia]=useState<Media|null>(null),[error,setError]=useState(false),[busy,setBusy]=useState(false);
  const active=useRef(true);
  useEffect(()=>{active.current=true;let revision=0,alive=true;
    const stop=listen<Media>('media-update',({payload})=>{revision++;if(alive){setMedia(payload);setError(false);}});
    void stop.then(async()=>{if(!alive)return;const before=revision;const snapshot=await invoke<Media|null>('widgets_media_snapshot');if(alive&&revision===before)setMedia(snapshot);}).catch(()=>{if(alive)setError(true);});
    return()=>{alive=false;active.current=false;void stop.then(f=>f()).catch(()=>{});};
  },[]);
  const command=async(action:string)=>{setBusy(true);setError(false);try{await invoke('widgets_media_control',{action});}catch{if(active.current)setError(true);}finally{if(active.current)setBusy(false);}};
  const art=media?.artwork?.find(a=>/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(a));
  return <article className="wb-card wb-music"><header><h2><Music2 size={17}/>{tx('Музыка','Music')}</h2><span>{media?.has_media?tx('Медиаплеер Windows','Windows media session'):tx('Нет воспроизведения','Nothing playing')}</span></header>
    <div className="wb-track"><div className="wb-album">{art?<img src={art} alt=""/>:<Music2 size={32}/>}</div><div><h3>{media?.has_media?media.title||tx('Без названия','Untitled'):tx('Включите любимую музыку','Play something you love')}</h3><p>{media?.has_media?media.artist:tx('Трек появится здесь, если плеер передаёт данные Windows.','Tracks appear here when your player shares media with Windows.')}</p></div></div>
    <div className="wb-music-controls"><button aria-label={tx('Предыдущий трек','Previous track')} disabled={!media?.has_media||busy} onClick={()=>void command('previous')}><SkipBack size={20}/></button><button aria-label={media?.is_playing?tx('Приостановить музыку','Pause music'):tx('Воспроизвести музыку','Play music')} disabled={!media?.has_media||busy} onClick={()=>void command('toggle')}>{media?.is_playing?<Pause size={23}/>:<Play size={23}/>}</button><button aria-label={tx('Следующий трек','Next track')} disabled={!media?.has_media||busy} onClick={()=>void command('next')}><SkipForward size={20}/></button></div>
    {error&&<p className="wb-save-error" role="alert">{tx('Медиасервис недоступен. Попробуйте открыть панель снова.','Media service unavailable. Try reopening the board.')}</p>}
  </article>;
}
