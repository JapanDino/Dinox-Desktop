import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {ArrowLeft,Check,Headphones,Mic,MicOff,RefreshCw,Volume2,VolumeX,X} from 'lucide-react';
import {tx} from '../desktopText';
import './audioDevices.css';

type Direction='output'|'input';
export interface AudioDevice {
 id:string;name:string;default:boolean;communications_default:boolean;
 volume:number|null;muted:boolean|null;controllable:boolean;
}
export interface AudioDevicesSnapshot {outputs:AudioDevice[];inputs:AudioDevice[];warning:string|null}
interface Props {onBack:()=>void;onClose:()=>void}
function audioError(error:unknown):string {
 const messages:Record<string,string>={
  audio_device_disconnected:tx('Устройство отключилось. Обновите список.','The device disconnected. Refresh the list.'),
  audio_default_unavailable:tx('Windows не поддерживает переключение устройства.','Windows does not support switching this device.'),
  audio_default_unconfirmed:tx('Windows не подтвердила переключение. Прежний выбор восстановлен.','Windows did not confirm the switch. The previous selection was restored.'),
  audio_default_partial:tx('Переключение применилось частично. Обновите список и выберите устройство снова.','The switch was only partially applied. Refresh and select the device again.'),
  audio_controls_unavailable:tx('Регулировка этого устройства недоступна.','Controls for this device are unavailable.'),
  audio_readback_failed:tx('Не удалось подтвердить новое состояние. Обновите список.','Could not confirm the new state. Refresh the list.'),
  audio_update_failed:tx('Не удалось изменить звук. Обновите список и повторите.','Could not change the audio setting. Refresh and try again.'),
 };
 return messages[String(error)]??tx('Не удалось прочитать звуковые устройства. Попробуйте обновить.','Could not read audio devices. Try refreshing.');
}

export function AudioDevicesPanel({onBack,onClose}:Props) {
 const [snapshot,setSnapshot]=useState<AudioDevicesSnapshot|null>(null);
 const [kind,setKind]=useState<Direction>('output'),[loading,setLoading]=useState(true),[changing,setChanging]=useState(false),[error,setError]=useState('');
 const [draft,setDraft]=useState(0),[calls,setCalls]=useState(false);
 const alive=useRef(true),busy=useRef(false),back=useRef<HTMLButtonElement>(null),dirty=useRef(false);
 const devices=kind==='output'?snapshot?.outputs:snapshot?.inputs;
 const selected=devices?.find(d=>d.default);
 async function refresh() {
  if(busy.current)return;
  busy.current=true;setLoading(true);
  try {
   const next=await invoke<AudioDevicesSnapshot>('audio_devices_snapshot');
   if(alive.current){setSnapshot(next);setError('');dirty.current=false;}
  }catch(e){if(alive.current)setError(audioError(e));}
  finally{busy.current=false;if(alive.current)setLoading(false);}
 }
 useEffect(()=>{
  alive.current=true;back.current?.focus();void refresh();
  const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!dirty.current)void refresh();},10000);
  return()=>{alive.current=false;clearInterval(timer);};
 },[]);
 useEffect(()=>{dirty.current=false;setDraft(Math.round((selected?.volume??0)*100));},[kind,selected?.id,selected?.volume]);
 useEffect(()=>{window.dispatchEvent(new Event('system-panel-bounds'));},[snapshot,error,kind,loading]);
 async function apply(command:string,args:Record<string,unknown>) {
  if(busy.current)return;
  busy.current=true;setChanging(true);setError('');
  try {
   const next=await invoke<AudioDevicesSnapshot>(command,args);
   if(alive.current){setSnapshot(next);dirty.current=false;const rows=kind==='output'?next.outputs:next.inputs;setDraft(Math.round((rows.find(d=>d.default)?.volume??0)*100));}
  }catch(e){
   // A partially applied native operation must not leave an optimistic state
   // on screen. Re-read only; never retry the write automatically.
   if(alive.current){
    try {
     const actual=await invoke<AudioDevicesSnapshot>('audio_devices_snapshot');
     if(alive.current){setSnapshot(actual);const rows=kind==='output'?actual.outputs:actual.inputs;setDraft(Math.round((rows.find(d=>d.default)?.volume??0)*100));}
    }catch{if(alive.current)setDraft(Math.round((selected?.volume??0)*100));}
    if(alive.current){setError(audioError(e));dirty.current=false;}
   }
  }finally{busy.current=false;if(alive.current)setChanging(false);}
 }
 function commitVolume() {
  if(selected&&dirty.current&&!busy.current){dirty.current=false;void apply('audio_device_set',{deviceId:selected.id,kind,volume:draft/100});}
 }
 const label=kind==='input'?tx('Микрофон','Microphone'):tx('Выход звука','Sound output');
 const disabled=loading||changing;
 const VolumeIcon=kind==='input'?(selected?.muted?MicOff:Mic):(selected?.muted?VolumeX:Volume2);
 return <div className="audio-devices-content">
  <header className="audio-devices-heading"><button ref={back} type="button" onClick={onBack} aria-label={tx('Назад к быстрым настройкам','Back to quick settings')}><ArrowLeft size={18}/></button><strong>{tx('Звук','Audio')}</strong><button type="button" onClick={()=>void refresh()} disabled={disabled} aria-label={tx('Обновить устройства','Refresh devices')}><RefreshCw size={16}/></button><button type="button" onClick={onClose} aria-label={tx('Закрыть звуковые устройства','Close audio devices')}><X size={18}/></button></header>
  <div className="audio-device-tabs" role="tablist" aria-label={tx('Звуковые устройства','Audio devices')}>
   {(['output','input'] as const).map(value=><button type="button" key={value} role="tab" tabIndex={kind===value?0:-1} aria-selected={kind===value} aria-controls={kind===value?`audio-${value}-panel`:undefined} id={`audio-${value}-tab`} disabled={changing} onClick={()=>{dirty.current=false;setKind(value);}} onKeyDown={e=>{
    if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'output':e.key==='End'?'input':value==='output'?'input':'output';dirty.current=false;setKind(next);document.getElementById(`audio-${next}-tab`)?.focus();}
   }}>{value==='output'?<Headphones size={16}/>:<Mic size={16}/>} {value==='output'?tx('Выход','Output'):tx('Микрофон','Microphone')}</button>)}
  </div>
  {error&&<p className="system-error" role="alert">{error}</p>}
  {snapshot?.warning&&<p className="audio-device-warning" role="status">{tx('У некоторых устройств регулировка громкости недоступна.','Volume controls are unavailable for some devices.')}</p>}
  <div id={`audio-${kind}-panel`} role="tabpanel" aria-labelledby={`audio-${kind}-tab`} aria-busy={disabled}>
   {loading&&!snapshot&&<p className="audio-device-empty" role="status">{tx('Читаем звуковые устройства…','Reading audio devices…')}</p>}
   {devices?.length===0&&<p className="audio-device-empty">{kind==='input'?tx('Микрофон не найден. Подключите устройство и обновите список.','No microphone found. Connect a device and refresh.'):tx('Выходные устройства не найдены. Подключите колонки или наушники.','No output devices found. Connect speakers or headphones.')}</p>}
   {(devices?.length??0)>0&&<ul className="audio-device-list" aria-label={label}>{devices?.map(device=><li key={device.id}><button type="button" className="audio-device-choice" disabled={disabled} aria-pressed={device.default} onClick={()=>void apply('audio_device_default',{deviceId:device.id,kind,communications:calls})}>
    {kind==='output'?<Headphones size={19}/>:<Mic size={19}/>}<span><strong>{device.name||tx('Звуковое устройство','Audio device')}</strong><small>{device.default?tx('Выбрано','Selected'):device.communications_default?tx('Для звонков','For calls'):tx('Доступно','Available')}</small></span>{device.default&&<Check size={16}/>}</button></li>)}</ul>}
   {(devices?.length??0)>0&&<label className="audio-calls-option"><input type="checkbox" checked={calls} disabled={disabled} onChange={e=>setCalls(e.target.checked)}/>{tx('При переключении менять и устройство для звонков','Switch the device for calls too')}</label>}
   {selected&&<div className="audio-endpoint-controls"><div><button type="button" className="audio-mute" aria-label={kind==='input'?(selected.muted?tx('Включить микрофон','Unmute microphone'):tx('Выключить микрофон','Mute microphone')):(selected.muted?tx('Включить звук','Unmute'):tx('Выключить звук','Mute'))} aria-pressed={selected.muted??false} disabled={disabled||!selected.controllable} onClick={()=>void apply('audio_device_set',{deviceId:selected.id,kind,muted:!selected.muted})}><VolumeIcon size={20}/></button><label htmlFor={`audio-${kind}-volume`}>{kind==='input'?tx('Громкость микрофона','Microphone volume'):tx('Громкость','Volume')}</label><output htmlFor={`audio-${kind}-volume`}>{selected.volume===null?'—':`${draft}%`}</output></div>
    <input id={`audio-${kind}-volume`} style={{'--audio-level':`${draft}%`} as CSSProperties} type="range" min={0} max={100} step={1} value={draft} disabled={disabled||!selected.controllable} onChange={e=>{dirty.current=true;setDraft(Number(e.target.value));}} onPointerUp={commitVolume} onKeyUp={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key))commitVolume();}} onBlur={commitVolume}/>
    {selected.muted&&<span className="audio-device-status">{kind==='input'?tx('Микрофон выключен','Microphone muted'):tx('Звук выключен','Sound muted')}</span>}
    {!selected.controllable&&<p className="audio-device-empty">{tx('Для этого устройства регулировка недоступна.','Volume controls are unavailable for this device.')}</p>}
   </div>}
   {!selected&&(devices?.length??0)>0&&<p className="audio-device-empty">{tx('Выберите устройство, чтобы изменить громкость.','Select a device to adjust its volume.')}</p>}
  </div>
 </div>;
}
