import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {ArrowLeft,Check,Keyboard,X} from 'lucide-react';
import {tr,trError} from '../i18n/core';
interface Snapshot {target:string|null;target_name:string|null;layouts:{id:string;label:string;name:string;active:boolean}[]}
export function LanguagePanel({onBack,onClose,onChanged}:{onBack:()=>void;onClose:()=>void;onChanged:()=>void}){
  const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(''),[pending,setPending]=useState<string|null>(null);
  const alive=useRef(true),busy=useRef(false),back=useRef<HTMLButtonElement>(null);
  useEffect(()=>{alive.current=true;back.current?.focus();void invoke<Snapshot>('keyboard_layout_snapshot').then(s=>{if(alive.current)setData(s);}).catch(e=>{if(alive.current)setError(trError(e));});return()=>{alive.current=false;};},[]);
  useEffect(()=>{window.dispatchEvent(new Event('system-panel-bounds'));},[data,error,pending]);
  const choose=async(id:string)=>{
    if(!data?.target||busy.current)return;busy.current=true;setPending(id);setError('');
    try{await invoke('keyboard_layout_select',{id,targetToken:data.target});if(alive.current){onChanged();onClose();}}
    catch(e){if(alive.current)setError(trError(e));}
    finally{busy.current=false;if(alive.current)setPending(null);}
  };
  return <>
    <header className="bluetooth-heading"><button ref={back} onClick={onBack} aria-label={tr('Назад к быстрым настройкам')}><ArrowLeft size={18}/></button><strong>{tr('Раскладка клавиатуры')}</strong><button onClick={onClose} aria-label={tr('Закрыть выбор раскладки')}><X size={18}/></button></header>
    <p className="bluetooth-hint">{tr('Выберите язык ввода для последнего активного приложения. Язык интерфейса Dinox не изменится.')}</p>
    {data?.target_name&&<p className="layout-target" title={data.target_name}>{data.target_name}</p>}
    {error&&<p className="system-error" role="alert">{error}</p>}
    {!data&&!error&&<p role="status">{tr('Загружаем раскладки…')}</p>}
    {data&&!data.target&&<p className="system-error">{tr('Сначала откройте приложение, в котором хотите печатать, затем выберите раскладку.')}</p>}
    {data&&!data.layouts.length&&<p role="status">{tr('Установленные раскладки не найдены')}</p>}
    <ul className="wifi-networks">{data?.layouts.map(item=><li key={item.id}><button className="wifi-network layout-choice" data-connected={item.active} aria-pressed={item.active} disabled={!data.target||!!pending} onClick={()=>void choose(item.id)}><Keyboard size={20}/><span className="wifi-network-info"><strong>{item.name}</strong><small>{pending===item.id?tr('Применение…'):item.active?tr('Текущая раскладка'):item.label}</small></span>{item.active&&<Check size={16}/>}</button></li>)}</ul>
  </>;
}
