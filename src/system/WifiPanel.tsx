import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {ArrowLeft,ArrowUpRight,Check,ChevronRight,LockKeyhole,RefreshCw,Wifi,X} from 'lucide-react';
import {tr,trError} from '../i18n/core';
interface Network {id:string;adapter:string;name:string;signal:number;secure:boolean;saved:boolean;connected:boolean;connectable:boolean;personal:boolean}
interface Snapshot {available:boolean;enabled:boolean|null;controllable:boolean;networks:Network[];warning:string|null}
interface Props {onBack:()=>void;onClose:()=>void;onWindows:(action:string)=>Promise<void>}
export function WifiPanel({onBack,onClose,onWindows}:Props){
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [pending,setPending]=useState<string|null>(null);
  const [selected,setSelected]=useState<Network|null>(null),[password,setPassword]=useState(''),[remember,setRemember]=useState(true),[changing,setChanging]=useState(false);
  const mutating=useRef(false);
  const alive=useRef(true),busy=useRef(false),connecting=useRef<{id:string;since:number}|null>(null),back=useRef<HTMLButtonElement>(null),form=useRef<HTMLFormElement>(null);
  const refresh=async(scan=false)=>{
    if(busy.current)return;busy.current=true;if(alive.current)setLoading(true);
    try{const data=await invoke<Snapshot>('wifi_snapshot',{scan});if(!alive.current)return;setSnapshot(data);
      const current=connecting.current;
      if(current && data.networks.some(n=>n.id===current.id&&n.connected)){connecting.current=null;setPending(null);setError('');}
      if(data.enabled===false){setSelected(null);setPassword('');}
    }catch(e){if(alive.current)setError(trError(e));}finally{busy.current=false;if(alive.current)setLoading(false);}
  };
  useEffect(()=>{alive.current=true;back.current?.focus();void refresh(true);const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},3000);const timeout=setInterval(()=>{const current=connecting.current;if(current&&Date.now()-current.since>25000){connecting.current=null;setPending(null);setPassword('');setError(tr('Подключение не подтверждено. Проверьте сеть или откройте панель Windows.'));}},1000);return()=>{alive.current=false;clearInterval(timer);clearInterval(timeout);};},[]);
  useEffect(()=>{if(selected){form.current?.scrollIntoView({block:'nearest'});form.current?.querySelector<HTMLElement>('input,button')?.focus();}},[selected?.id]);
  useEffect(()=>{window.dispatchEvent(new Event('system-panel-bounds'));},[snapshot,error,loading,pending,selected,changing]);
  const connect=async(network:Network,key?:string)=>{
    if(connecting.current||mutating.current||network.connected)return;
    connecting.current={id:network.id,since:Date.now()};setPending(network.id);setError('');
    try{await invoke('wifi_connect',{id:network.id,password:key??null,remember:(!network.saved||key!==undefined)&&remember});if(alive.current){setPassword('');await refresh();}}
    catch(e){connecting.current=null;if(alive.current){setPending(null);setError(trError(e));}}
  };
  const operate=async(command:'wifi_set_enabled'|'wifi_disconnect',args:Record<string,unknown>)=>{
    if(mutating.current||connecting.current)return;mutating.current=true;setChanging(true);setError('');
    try{await invoke(command,args);if(alive.current){setSelected(null);setPassword('');await refresh();}}catch(e){if(alive.current)setError(trError(e));}finally{mutating.current=false;if(alive.current)setChanging(false);}
  };
  const choose=(network:Network)=>{setError('');setPassword('');setSelected(network);};
  const chosen=selected?{...selected,...snapshot?.networks.find(n=>n.id===selected.id)}:null;
  const permissionDenied=/местоположение|location/i.test(`${snapshot?.warning??''} ${error}`);
  return <>
    <header className="bluetooth-heading"><button ref={back} onClick={()=>{if(selected){setSelected(null);setPassword('');}else onBack();}} aria-label={selected?tr('Назад к списку сетей'):tr('Назад к быстрым настройкам')}><ArrowLeft size={18}/></button><strong>Wi-Fi</strong><button onClick={onClose} aria-label={tr('Закрыть Wi-Fi')}><X size={18}/></button></header>
    <div className="bluetooth-power"><div className="bluetooth-power-label"><Wifi size={22}/><div><strong>Wi-Fi</strong><span>{changing?tr('Применение…'):snapshot?.enabled===true?tr('Включён'):snapshot?.enabled===false?tr('Выключен'):tr('Статус недоступен')}</span></div></div><button className="bluetooth-switch" role="switch" aria-label={tr('Включить Wi-Fi')} aria-checked={snapshot?.enabled??false} disabled={!snapshot?.controllable||changing||!!pending} onClick={()=>void operate('wifi_set_enabled',{enabled:!snapshot?.enabled})}><span/></button></div>
    {!selected&&<div className="bluetooth-list-heading"><span>{permissionDenied?tr('Нужно разрешение Windows'):tr('Доступные сети')}</span><button disabled={loading||!!pending||snapshot?.enabled===false} onClick={()=>{setError('');void refresh(true);}} aria-label={tr('Обновить сети')}><RefreshCw size={16}/></button></div>}
    {error&&<p className="system-error" role="alert">{error}</p>}
    {snapshot?.warning&&<p className="system-error" role="status">{trError(snapshot.warning)}</p>}
    {loading&&!snapshot&&<p className="bluetooth-empty" role="status">{tr('Ищем сети Wi-Fi…')}</p>}
    {snapshot&&!snapshot.available&&<p className="bluetooth-empty">{tr('Адаптер Wi-Fi не найден')}</p>}
    {snapshot?.available&&snapshot.enabled===false&&<p className="bluetooth-empty">{tr('Включите Wi-Fi переключателем выше, чтобы увидеть сети.')}</p>}
    {snapshot?.available&&snapshot.enabled!==false&&!snapshot.networks.length&&!snapshot.warning&&<p className="bluetooth-empty">{tr('Сети не найдены. Проверьте, включён ли Wi-Fi, и обновите список.')}</p>}
    {!selected&&<ul className="wifi-networks">{snapshot?.networks.map(network=><li key={network.id}>
      <button className="wifi-network" data-connected={network.connected} disabled={!!pending||changing||snapshot?.enabled===false||(!network.connected&&!network.connectable)} onClick={()=>choose(network)} title={network.adapter} aria-label={tr('{0}: {1}',network.name||tr('Скрытая сеть'),network.connected?tr('Подключено'):tr('Подключить'))}>
        <span className="wifi-signal"><Wifi size={20}/>{network.secure&&<LockKeyhole size={10}/>}</span>
        <span className="wifi-network-info"><strong>{network.name||tr('Скрытая сеть')}</strong><small>{pending===network.id?tr('Подключение…'):network.connected?tr('Подключено'):!network.connectable?tr('Недоступна'):network.saved?tr('Сохранена'):network.secure?tr('Защищённая сеть'):tr('Открытая сеть')}</small></span>
        <span className="wifi-signal-value">{network.connected?<Check size={15}/>:<>{network.signal}% <ChevronRight size={13}/></>}</span>
      </button>
    </li>)}</ul>}
    {chosen&&<form ref={form} className="wifi-connect-form" onSubmit={e=>{e.preventDefault();void connect(chosen,chosen.secure&&password?password:undefined);}} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setSelected(null);setPassword('');}}}>
      <strong>{chosen.name||tr('Скрытая сеть')}</strong>
      <p className="bluetooth-hint">{tr('Сигнал: {0}%',chosen.signal)}{chosen.connected?` · ${tr('Подключено')}`:''}</p>
      {chosen.connected?<button type="button" className="bluetooth-add" disabled={changing} onClick={()=>void operate('wifi_disconnect',{id:chosen.id})}>{tr('Отключиться')}</button>:chosen.personal||chosen.saved?<>
        {chosen.secure&&chosen.personal?<label>{tr('Пароль сети')}{chosen.saved&&<small>{tr('Оставьте пустым, чтобы использовать сохранённый пароль.')}</small>}<input autoFocus type="password" autoComplete="off" maxLength={63} minLength={8} required={!chosen.saved} disabled={!!pending} value={password} onChange={e=>setPassword(e.target.value)} aria-label={tr('Пароль сети')}/></label>:!chosen.secure?<p className="bluetooth-hint">{tr('У этой сети нет шифрования. Подключайтесь, только если доверяете ей.')}</p>:null}
        <label className="wifi-remember"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>{tr('Запомнить сеть в Windows')}</label>
        <button className="bluetooth-add" type="submit" disabled={!!pending||changing}>{pending?tr('Подключение…'):tr('Подключить')}</button>
      </>:<><p className="bluetooth-hint">{tr('Для этой корпоративной сети нужны дополнительные параметры Windows')}</p><button type="button" className="bluetooth-add" onClick={()=>void onWindows('wifi-panel')}>{tr('Открыть в Windows')}<ArrowUpRight size={14}/></button></>}
      <button type="button" className="wifi-cancel" onClick={()=>{setSelected(null);setPassword('');}}>{tr('Отмена')}</button>
    </form>}
    <p className="bluetooth-hint">{tr('Пароль передаётся напрямую Windows и не записывается в файлы Dinox.')}</p>
    {permissionDenied&&<><p className="bluetooth-hint">{tr('В Windows включите службы местоположения и доступ для классических приложений. Затем вернитесь в Dinox и обновите список. Это разрешение Windows, а не отправка координат в Dinox.')}</p><button className="bluetooth-add" onClick={()=>void onWindows('wifi-location')}>{tr('Разрешение на список сетей')}<ArrowUpRight size={14}/></button></>}
    <footer className="bluetooth-footer"><button onClick={()=>void onWindows('wifi')}>{tr('Дополнительные параметры Windows')}<ArrowUpRight size={14}/></button></footer>
  </>;
}
