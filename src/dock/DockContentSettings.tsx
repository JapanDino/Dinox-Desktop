import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {ArrowUp,ArrowDown,Plus,X,Search,Pin,RefreshCw,GripVertical,AppWindow,Check} from 'lucide-react';
import {moveTo} from './geometry';
import {usePersonalSetting} from '../components/PersonalFeatures';
import {tr,trError} from '../i18n/core';
import {contentDefaults,parseDockContent,mergePins,movePin,pinKey,type PinnedApp} from './content';
import './content.css';

export function DockContentSettings({compact=false}:{compact?:boolean}={}){
 const [raw,save]=usePersonalSetting('bloom-dock-content',JSON.stringify(contentDefaults));
 const options=parseDockContent(raw);
 const [pins,setPins]=useState<PinnedApp[]>([]),[available,setAvailable]=useState<PinnedApp[]>([]),[imports,setImports]=useState<PinnedApp[]|null>(null);
 const [query,setQuery]=useState(''),[adding,setAdding]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[status,setStatus]=useState('');
 const [loadFailed,setLoadFailed]=useState(false),[retry,setRetry]=useState(0);
 const lock=useRef(false);const generation=useRef(0);
 const [icons,setIcons]=useState<Record<string,string>>({}),[dragging,setDragging]=useState<string|null>(null);
 useEffect(()=>{let live=true;const items=[...pins,...available].slice(0,160);void Promise.all(items.filter(a=>!a.icon&&!icons[a.path]).map(async a=>{try{const icon=await invoke<string|null>('get_app_icon',{path:a.path});if(live&&icon)setIcons(old=>({...old,[a.path]:icon}));}catch{}}));return()=>{live=false;};},[pins,available]);
 const loadCommand=options.mode==='personal'?'load_personal_pins':'load_pinned_apps';
 useEffect(()=>{
  const id=++generation.current;let disposed=false;setLoading(true);setLoadFailed(false);setError('');setImports(null);setAdding(false);
  const load=()=>invoke<PinnedApp[]>(loadCommand).then(items=>{if(!disposed&&id===generation.current){setPins(items);setLoading(false);}}).catch(e=>{if(!disposed){setError(trError(e));setPins([]);setLoadFailed(true);setLoading(false);}});
  void load();const stop=listen<string>('dock-pins-changed',e=>{if(e.payload===options.mode)void load();});
  return()=>{disposed=true;void stop.then(f=>f());};
 },[loadCommand,options.mode,retry]);
 const run=async(work:()=>Promise<unknown>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');setStatus('');try{await work();}catch(e){setError(trError(e));}finally{lock.current=false;setBusy(false);}};
 const update=async(next:PinnedApp[])=>{
  if(loadFailed)throw new Error(tr("Не удалось загрузить закрепления"));
  await invoke(options.mode==='personal'?'save_personal_pins':'save_pinned_apps',{apps:next});setPins(next);setStatus(tr('Изменения сохранены'));
 };
 const changeMode=(mode:string)=>void run(async()=>{await save(JSON.stringify({...options,mode}));});
 const add=()=>void run(async()=>{if(!adding){setAvailable(await invoke<PinnedApp[]>('get_installed_apps'));}setAdding(!adding);});
 const choices=available.filter(a=>a.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 const icon=(app:PinnedApp)=><span className="dock-pin-app-icon">{app.icon||icons[app.path]?<img src={app.icon||icons[app.path]} alt="" draggable={false}/>:<AppWindow size={20}/>}</span>;
 const reorder=(from:number,to:number)=>void run(()=>update(moveTo(pins,from,to)));
 return <section className="dock-content-settings" aria-label={tr('Приложения в доке')}>
  {!compact&&<div className="setting-group-label">{tr('Приложения в доке')}</div>}
  <div className="setting-group">
   <div className="dock-content-heading"><Pin size={19}/><div><strong>{tr('Твой порядок. Твои приложения.')}</strong><p>{tr('Два независимых списка — переключайтесь без потери закреплений.')}</p></div></div>
   <div className="dock-mode-choice" role="group" aria-label={tr('Режим приложений')}>
    <button aria-pressed={options.mode==='classic'} disabled={busy} onClick={()=>changeMode('classic')}><strong>{tr('Как сейчас')}</strong><small>{tr('Прежние закрепления и запущенные окна')}</small></button>
    <button aria-pressed={options.mode==='personal'} disabled={busy} onClick={()=>changeMode('personal')}><strong>{tr('Мой док')}</strong><small>{tr('Свои закрепления, порядок и видимость окон')}</small></button>
   </div>
   {options.mode==='personal'&&<><p className="dock-content-note">{tr('При первом выборе импортируются доступные ярлыки панели Windows. Приложения Store и исходный порядок могут не перенестись. Дальше список независим от Windows.')}</p><label className="dock-running-option"><span>{tr('Показывать незакреплённые запущенные приложения')}</span><input type="checkbox" checked={options.showRunning} disabled={busy} onChange={e=>void run(()=>save(JSON.stringify({...options,showRunning:e.target.checked})))}/></label></>}
   <div className="dock-pin-toolbar"><strong>{tr('Закреплённые приложения')} <span>{pins.length}</span></strong><button disabled={busy||loading||loadFailed} onClick={add} aria-expanded={adding}><Plus size={16}/>{tr('Добавить')}</button></div>
   {!loading&&!!pins.length&&<p className="dock-content-note dock-order-hint">{tr('Перетащите за ручку или используйте стрелки. Порядок сохраняется для всех страниц дока.')}</p>}
   {loading?<p className="dock-content-note" role="status">{tr('Загрузка…')}</p>:<ol className="dock-pin-list">{pins.map((app,index)=><li key={pinKey(app)} className={dragging===pinKey(app)?'is-dragging':''} onDragOver={e=>{if(dragging&&!busy){e.preventDefault();e.dataTransfer.dropEffect='move';}}} onDrop={e=>{e.preventDefault();const from=pins.findIndex(a=>pinKey(a)===dragging);setDragging(null);if(from>=0)reorder(from,index);}}><button className="dock-pin-grip" draggable={!busy} disabled={busy} aria-label={tr('Переместить: {0}',app.name)} title={tr('Alt + стрелки — изменить порядок')} onDragStart={e=>{setDragging(pinKey(app));e.dataTransfer.setData('text/plain',pinKey(app));e.dataTransfer.effectAllowed='move';}} onDragEnd={()=>setDragging(null)} onKeyDown={e=>{if(e.altKey&&(e.key==='ArrowUp'||e.key==='ArrowDown')){e.preventDefault();reorder(index,index+(e.key==='ArrowUp'?-1:1));}}}><GripVertical size={16}/></button>{icon(app)}<span className="dock-pin-name" title={app.name}>{app.name}</span><div className="dock-pin-actions"><button aria-label={tr('Выше: {0}',app.name)} disabled={busy||index===0} onClick={()=>void run(()=>update(movePin(pins,index,-1)))}><ArrowUp size={16}/></button><button aria-label={tr('Ниже: {0}',app.name)} disabled={busy||index===pins.length-1} onClick={()=>void run(()=>update(movePin(pins,index,1)))}><ArrowDown size={16}/></button><button aria-label={tr('Открепить: {0}',app.name)} disabled={busy} onClick={()=>void run(()=>update(pins.filter((_,i)=>i!==index)))}><X size={16}/></button></div></li>)}</ol>}
   {!loading&&!loadFailed&&!pins.length&&<p className="dock-content-note">{tr('Пока пусто. Добавьте приложения или импортируйте ярлыки Windows.')}</p>}
   {adding&&<div className="dock-app-picker"><label><Search size={16}/><input autoFocus placeholder={tr('Найти приложение')} aria-label={tr('Найти приложение')} value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="dock-app-results">{choices.slice(0,60).map(app=>{const pinned=pins.some(p=>pinKey(p)===pinKey(app));return <button disabled={busy||(!pinned&&pins.length>=128)} key={pinKey(app)} aria-pressed={pinned} aria-label={`${pinned?tr('Открепить'):tr('Закрепить')}: ${app.name}`} onClick={()=>void run(()=>update(pinned?pins.filter(p=>pinKey(p)!==pinKey(app)):mergePins(pins,[app])))}>{icon(app)}<span>{app.name}</span>{pinned?<Check size={16}/>:<Plus size={16}/>}</button>;})}{!choices.length&&<p>{tr('Нет подходящих приложений')}</p>}{choices.length>60&&<p>{tr('Уточните поиск — показаны первые 60 приложений.')}</p>}</div></div>}
   {options.mode==='personal'&&<div className="dock-import"><button disabled={busy||loading||loadFailed} onClick={()=>void run(async()=>setImports(await invoke<PinnedApp[]>('windows_taskbar_pins')))}><RefreshCw size={15}/>{tr('Импортировать из Windows')}</button>{imports!==null&&<div role="region" aria-label={tr('Предпросмотр импорта')}><p>{imports.length?imports.map(a=>a.name).join(' · '):tr('Доступных ярлыков Windows нет')}</p><small>{tr('Новые приложения добавятся в конец. Текущий список сохранится.')}</small><div><button disabled={busy||!imports.length} onClick={()=>void run(async()=>{await update(mergePins(pins,imports));setImports(null);})}>{tr('Добавить в мой док')}</button><button disabled={busy} onClick={()=>setImports(null)}>{tr('Отмена')}</button></div></div>}</div>}
   {loadFailed&&<button onClick={()=>setRetry(v=>v+1)}>{tr("Повторить загрузку")}</button>}{error&&<p className="notice-error" role="alert">{error}</p>}<p className="dock-save-status" role="status">{busy?tr('Сохранение…'):status}</p>
  </div>
 </section>;
}
