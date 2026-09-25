import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {PanelTop,Monitor,Battery,Cpu,Check,Search,RotateCcw} from 'lucide-react';
import {tx} from '../desktopText';
import {useBloomAppearance} from '../appearance/BloomAppearance';
import {DockDesignPreview} from '../components/DockDesignSettings';
import {StatusWidgetConfig} from '../components/StatusWidgetConfig';
import {bloomDockDesign} from '../dockDesign';
import {layoutDraft,layoutChanges,layoutWidgets,parseDockDesign} from './layoutModel';
import './layoutEditor.css';
export function LayoutEditor(){
 useBloomAppearance();
 const [snapshot,setSnapshot]=useState<Record<string,unknown>>({}),[draft,setDraft]=useState(()=>layoutDraft({})),[part,setPart]=useState('island');
 const [loading,setLoading]=useState(true),[pending,setPending]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const alive=useRef(true),saving=useRef(false);
 const load=async()=>{setLoading(true);setError('');try{const next=await invoke<Record<string,unknown>>('load_settings');if(alive.current){setSnapshot({...next});setDraft(layoutDraft(next));setSaved(false);}}catch{if(alive.current)setError(tx('Не удалось загрузить настройки. Повторите попытку.','Could not load settings. Please retry.'));}finally{if(alive.current)setLoading(false);}};
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;};},[]);
 const change=(key:string,value:string)=>{setDraft(old=>({...old,[key]:value}));setSaved(false);};
 const design=parseDockDesign(draft['bloom-dock-design']),widgets=layoutWidgets(draft['bloom-status-widgets']);
 const visual=draft['bloom-unified-appearance']==='true'?bloomDockDesign(design):design;
 const dirty=Object.keys(layoutChanges(draft,snapshot)).length>0;
 const save=async()=>{if(saving.current||!dirty)return;saving.current=true;setPending(true);setError('');const values=layoutChanges(draft,snapshot),expected=Object.fromEntries(Object.keys(values).map(key=>[key,snapshot[key]??null]));try{await invoke('save_layout',{values,expected});for(const [key,value]of Object.entries(values))localStorage.setItem(key,value);if(alive.current){setSnapshot(old=>({...old,...values}));setSaved(true);}}catch(e){if(alive.current)setError(String(e).includes('another window')?tx('Настройки изменились в другом окне. Загрузите актуальную версию и повторите правки.','Settings changed in another window. Reload the latest version and reapply your changes.'):tx('Не удалось сохранить. Ваши правки остались в предпросмотре.','Could not save. Your edits are still in the preview.'));}finally{saving.current=false;if(alive.current)setPending(false);}};
 const toggle=(key:string,ru:string,en:string)=><label className="layout-option"><span>{tx(ru,en)}</span><input type="checkbox" checked={draft[key]==='true'} onChange={e=>change(key,String(e.target.checked))}/></label>;
 return <section className="layout-editor"><div className="layout-heading"><div><h2>{tx('Ваш рабочий стол','Your workspace')}</h2><p>{tx('Выберите панель. Настройте её и сохраните результат.','Choose a panel, adjust it and save the result.')}</p></div><button className="layout-search" onClick={()=>void invoke('launcher_show').catch(()=>setError(tx('Не удалось открыть поиск','Could not open search')))}><Search size={16}/>{tx('Поиск','Search')}</button></div>
 <fieldset disabled={loading||pending}><div className="layout-canvas" aria-label={tx('Предпросмотр рабочего стола','Workspace preview')}>
 <button className={`layout-island ${part==='island'?'chosen':''}`} aria-label={tx('Настроить остров','Edit island')} onClick={()=>setPart('island')}>
 {draft['bloom-island-cpu']==='true'&&<span><Cpu size={13}/>12%</span>}<strong>10:24</strong>{draft['bloom-island-date']==='true'&&<span>25 {tx('сент.','Sep')}</span>}{draft['bloom-island-battery']==='true'&&<span><Battery size={16}/>86%</span>}</button>
 <div className="layout-canvas-title"><span>DINOX</span><small>{tx('Предпросмотр · изменения ещё не применены','Preview · changes are not applied yet')}</small></div>
 <button className={`layout-dock ${part==='dock'?'chosen':''}`} style={{alignSelf:design.align==='left'?'flex-start':design.align==='right'?'flex-end':'center',opacity:draft['bloom-dock-enabled']==='true'?1:.35}} aria-label={tx('Настроить док','Edit dock')} onClick={()=>setPart('dock')}><DockDesignPreview design={visual}/></button>
 </div>
 <div className="layout-tabs"><button aria-pressed={part==='island'} onClick={()=>setPart('island')}><PanelTop size={16}/>{tx('Остров','Island')}</button><button aria-pressed={part==='dock'} onClick={()=>setPart('dock')}><Monitor size={16}/>{tx('Док','Dock')}</button></div>
 <div className="layout-inspector">{part==='island'?<>
 <label className="layout-option"><span>{tx('Когда показывать','When to show')}</span><select aria-label={tx('Поведение острова','Island behavior')} value={draft['bloom-notch-mode']} onChange={e=>change('bloom-notch-mode',e.target.value)}>{[['fixed','Всегда','Always'],['hover','Только при наведении','On hover only'],['peek','При наведении и событиях','Hover and events'],['smart','Не перекрывая окна','When not overlapping windows']].map(([v,ru,en])=><option key={v} value={v}>{tx(ru,en)}</option>)}</select></label>
 {toggle('bloom-island-date','Дата рядом со временем','Date beside the time')}{toggle('bloom-island-battery','Заряд батареи','Battery level')}{toggle('bloom-island-cpu','Загрузка процессора','CPU usage')}
 <h3>{tx('Виджеты раскрытого острова','Expanded island widgets')}</h3><p>{tx('Перетаскивайте между сторонами. Стрелки и кнопка удаления работают с клавиатуры.','Drag between sides. Arrow and remove buttons also work with a keyboard.')}</p><StatusWidgetConfig value={widgets} onChange={value=>change('bloom-status-widgets',JSON.stringify(value))}/>
 </>:<>{toggle('bloom-dock-enabled','Показывать док','Show dock')}{toggle('bloom-unified-appearance','Единый чёрно-белый стиль','Unified monochrome style')}
 <label className="layout-option"><span>{tx('Поведение дока','Dock behavior')}</span><select aria-label={tx('Поведение дока','Dock behavior')} value={draft['bloom-dock-mode']} onChange={e=>change('bloom-dock-mode',e.target.value)}>{[['fixed','Всегда','Always'],['peek','Автоскрытие','Auto-hide'],['smart','Не перекрывая окна','When not overlapping windows']].map(([v,ru,en])=><option key={v} value={v}>{tx(ru,en)}</option>)}</select></label>
 {([['size','Размер значков','Icon size',28,64],['gap','Расстояние','Spacing',2,20],['radius','Скругление','Corner radius',0,32]] as const).map(([key,ru,en,min,max])=><label className="layout-range" key={key}><span>{tx(ru,en)}<output>{design[key]} px</output></span><input aria-label={tx(ru,en)} type="range" min={min} max={max} value={design[key]} onChange={e=>change('bloom-dock-design',JSON.stringify({...design,[key]:Number(e.target.value)}))}/></label>)}
 <label className="layout-option"><span>{tx('Расположение','Alignment')}</span><select aria-label={tx('Расположение дока','Dock alignment')} value={design.align} onChange={e=>change('bloom-dock-design',JSON.stringify({...design,align:e.target.value}))}>{[['left','Слева','Left'],['center','По центру','Center'],['right','Справа','Right']].map(([v,ru,en])=><option key={v} value={v}>{tx(ru,en)}</option>)}</select></label>
 <label className="layout-option"><span>{tx('Кнопка поиска в доке','Search button in dock')}</span><input type="checkbox" checked={design.showSearch} onChange={e=>change('bloom-dock-design',JSON.stringify({...design,showSearch:e.target.checked}))}/></label>
 </>}</div></fieldset>
 {error&&<div className="layout-error" role="alert">{error}<button disabled={pending} onClick={()=>void load()}><RotateCcw size={14}/>{tx('Загрузить заново','Reload settings')}</button></div>}
 <footer className="layout-actions"><span role="status">{loading?tx('Загрузка…','Loading…'):saved?<><Check size={15}/>{tx('Сохранено','Saved')}</>:dirty?tx('Есть несохранённые изменения','Unsaved changes'):tx('Изменений нет','No changes')}</span><button disabled={!dirty||pending||loading} onClick={()=>{setDraft(layoutDraft(snapshot));setError('');setSaved(false);}}>{tx('Отменить','Cancel')}</button><button className="primary" disabled={!dirty||pending||loading} onClick={()=>void save()}>{pending?tx('Сохраняем…','Saving…'):tx('Сохранить','Save')}</button></footer>
 </section>;
}
