import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {ArrowLeft,X,Volume2,VolumeX,Headphones,RefreshCw} from 'lucide-react';
import {tx} from '../desktopText';
import './mixer.css';
export interface AudioSession {id:string;name:string;volume:number;muted:boolean}
export interface AudioDevice extends AudioSession {default:boolean;sessions:AudioSession[]}
function VolumeRow({row,disabled,onSet}:{row:AudioSession;disabled:boolean;onSet:(value:{volume?:number;muted?:boolean})=>Promise<void>}){
 const [draft,setDraft]=useState(Math.round(row.volume*100));const editing=useRef(false),dirty=useRef(false);
 useEffect(()=>{if(!editing.current)setDraft(Math.round(row.volume*100));},[row.volume,disabled]);
 const commit=()=>{editing.current=false;if(!dirty.current)return;dirty.current=false;void onSet({volume:draft/100});};
 return <div className="mixer-row"><div><button disabled={disabled} aria-label={`${row.muted?tx('Включить звук','Unmute'):tx('Выключить звук','Mute')}: ${row.name}`} onClick={()=>void onSet({muted:!row.muted})}>{row.muted?<VolumeX size={18}/>:<Volume2 size={18}/>}</button><strong title={row.name}>{row.name}</strong><output>{draft}%</output></div><input aria-label={tx('Громкость','Volume')+': '+row.name} type="range" min="0" max="100" value={draft} disabled={disabled} onChange={e=>{editing.current=true;dirty.current=true;setDraft(Number(e.target.value));}} onPointerUp={commit} onPointerCancel={()=>{editing.current=false;dirty.current=false;setDraft(Math.round(row.volume*100));}} onKeyUp={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key))commit();}} onBlur={commit}/></div>;
}
export function MixerPanel({onBack,onClose}:{onBack?:()=>void;onClose:()=>void}){
 const [devices,setDevices]=useState<AudioDevice[]>([]),[selected,setSelected]=useState(''),[loading,setLoading]=useState(true),[pending,setPending]=useState(false),[error,setError]=useState('');
 const alive=useRef(true),busy=useRef(false),reading=useRef(false),generation=useRef(0);
 const refresh=async(force=false)=>{if((reading.current||busy.current)&&!force)return;reading.current=true;const token=++generation.current;try{const rows=await invoke<AudioDevice[]>('mixer_snapshot');if(alive.current&&token===generation.current){setDevices(rows);setSelected(old=>rows.some(d=>d.id===old)?old:rows.find(d=>d.default)?.id??rows[0]?.id??'');}}catch{if(alive.current&&token===generation.current)setError(tx('Не удалось прочитать аудиоустройства. Повторите попытку.','Could not read audio devices. Please retry.'));}finally{if(token===generation.current)reading.current=false;if(alive.current)setLoading(false);}};
 useEffect(()=>{alive.current=true;void refresh();const timer=setInterval(()=>{if(!document.hidden)void refresh();},3000);return()=>{alive.current=false;generation.current++;clearInterval(timer);};},[]);
 const apply=async(command:string,args:Record<string,unknown>)=>{if(busy.current)return;busy.current=true;generation.current++;setPending(true);setError('');try{await invoke(command,args);}catch{if(alive.current)setError(tx('Windows не подтвердила изменение. Устройство могло отключиться или приложение закрыться.','Windows did not confirm the change. The device may have disconnected or the app may have closed.'));}finally{busy.current=false;if(alive.current){await refresh(true);if(alive.current)setPending(false);}}};
 const device=devices.find(d=>d.id===selected);
 return <section className="dinox-mixer"><header>{onBack&&<button aria-label={tx('Назад','Back')} onClick={onBack}><ArrowLeft size={18}/></button>}<div><strong>{tx('Звук','Sound')}</strong><span>{tx('Громкость каждого приложения','Volume for every app')}</span></div><button aria-label={tx('Закрыть микшер','Close mixer')} onClick={onClose}><X size={18}/></button></header>
 {error&&<div className="mixer-error" role="alert">{error}<button onClick={()=>{setError('');void refresh();}}><RefreshCw size={14}/>{tx('Повторить','Retry')}</button></div>}
 {loading?<p role="status">{tx('Загружаем устройства…','Loading devices…')}</p>:!devices.length?<p>{tx('Устройства вывода не найдены. Подключите наушники или колонки.','No output devices found. Connect headphones or speakers.')}</p>:<>
 <label className="mixer-output"><span><Headphones size={16}/>{tx('Устройство вывода','Output device')}</span><select value={selected} disabled={pending} onChange={e=>setSelected(e.target.value)}>{devices.map(d=><option key={d.id} value={d.id}>{d.name}{d.default?' · '+tx('по умолчанию','default'):''}</option>)}</select></label>
 {device&&<><div className="mixer-default">{device.default?<span>{tx('Основной выход Windows','Default Windows output')}</span>:<button disabled={pending} onClick={()=>void apply('mixer_default_device',{deviceId:device.id})}>{tx('Использовать по умолчанию','Use as default')}</button>}</div>
 <VolumeRow key={device.id} row={{...device,name:tx('Общая громкость','Master volume')}} disabled={pending} onSet={value=>apply('mixer_set',{deviceId:device.id,sessionId:null,...value})}/>
 <div className="mixer-section-label">{tx('Приложения на этом устройстве','Apps on this device')}</div>
 {device.sessions.length?device.sessions.map(row=><VolumeRow key={row.id} row={{...row,name:row.name==='System sounds'?tx('Системные звуки','System sounds'):row.name}} disabled={pending} onSet={value=>apply('mixer_set',{deviceId:device.id,sessionId:row.id,...value})}/>):<p className="mixer-empty">{tx('Запустите музыку или видео — приложение появится здесь.','Play music or a video and its app will appear here.')}</p>}
 <p className="mixer-note">{tx('Приложения с собственным выбором выхода могут остаться на прежнем устройстве. Выход для звонков не меняется.','Apps with their own output selection may stay on the previous device. The calls output stays unchanged.')}</p></>}
 </>}
 </section>;
}
