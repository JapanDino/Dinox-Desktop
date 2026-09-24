import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ArrowLeft, ArrowUpRight, Bluetooth, BluetoothOff, Check, Plus, RefreshCw, X } from 'lucide-react';
import { tr, trError } from '../i18n/core';

interface Device { id:string; name:string; connected:boolean|null; low_energy:boolean }
interface Snapshot { available:boolean; enabled:boolean; controllable:boolean; devices:Device[]; warning:string|null }
interface Props { onBack:()=>void; onClose:()=>void; onWindows:(action:string)=>Promise<void> }

export function BluetoothPanel({onBack,onClose,onWindows}:Props) {
    const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
    const [loading,setLoading]=useState(false), [changing,setChanging]=useState(false), [error,setError]=useState('');
    const alive=useRef(true), busy=useRef(false), mutating=useRef(false), back=useRef<HTMLButtonElement>(null);
    const refresh=async()=>{
        if(busy.current||mutating.current)return;
        busy.current=true;
        if(alive.current)setLoading(true);
        try {const next=await invoke<Snapshot>('bluetooth_snapshot');if(alive.current){setSnapshot(next);setError('');}}
        catch(e){if(alive.current)setError(trError(e));}
        finally{busy.current=false;if(alive.current)setLoading(false);}
    };
    useEffect(()=>{
        alive.current=true;back.current?.focus();void refresh();
        const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},10000);
        return()=>{alive.current=false;clearInterval(timer);};
    },[]);
    useEffect(()=>{window.dispatchEvent(new Event('system-panel-bounds'));},[snapshot,error,loading]);
    const toggle=async()=>{
        if(!snapshot||mutating.current)return;
        mutating.current=true;setChanging(true);setError('');
        let failure='';
        try{await invoke('bluetooth_set_enabled',{enabled:!snapshot.enabled});}
        catch(e){failure=trError(e);}
        finally{
            mutating.current=false;
            if(alive.current){setChanging(false);await refresh();if(failure)setError(failure);}
        }
    };
    const connected=snapshot?.devices.filter(d=>d.connected===true)??[];
    const saved=snapshot?.devices.filter(d=>d.connected!==true)??[];
    const rows=(devices:Device[])=>devices.map(device=><li key={device.id} className="bluetooth-device">
        <span className="bluetooth-device-icon"><Bluetooth size={19}/></span>
        <div><strong title={device.name}>{device.name||tr('Устройство Bluetooth')}</strong><span>{device.connected===true?tr('Подключено'):device.connected===false?tr('Не подключено'):tr('Статус недоступен')}{device.low_energy?' · Bluetooth LE':''}</span></div>
        {device.connected===true&&<Check size={15} aria-label={tr('Подключено')}/>}
    </li>);
    return <>
        <header className="bluetooth-heading"><button ref={back} onClick={onBack} aria-label={tr('Назад к быстрым настройкам')}><ArrowLeft size={18}/></button><strong>Bluetooth</strong><button onClick={onClose} aria-label={tr('Закрыть Bluetooth')}><X size={18}/></button></header>
        <div className="bluetooth-power"><div className="bluetooth-power-label">{snapshot?.enabled?<Bluetooth size={23}/>:<BluetoothOff size={23}/>}<div><strong>Bluetooth</strong><span>{changing?tr('Применение…'):snapshot?(snapshot.available?(snapshot.enabled?tr('Включён'):tr('Выключен')):tr('Адаптер не найден')):tr('Загрузка…')}</span></div></div>
            <button className="bluetooth-switch" role="switch" aria-label={tr('Включить Bluetooth')} aria-checked={snapshot?.enabled??false} disabled={!snapshot?.controllable||loading||changing} onClick={()=>void toggle()}><span/></button>
        </div>
        {error&&<p className="system-error" role="alert">{error}</p>}
        {snapshot?.warning&&<p className="bluetooth-hint" role="status">{trError(snapshot.warning)}</p>}
        <div className="bluetooth-list-heading"><span>{tr('Мои устройства')}</span><button disabled={loading||changing} onClick={()=>void refresh()} aria-label={tr('Обновить устройства')} title={tr('Обновить устройства')}><RefreshCw size={15}/></button></div>
        {loading&&!snapshot?<p className="bluetooth-empty" role="status">{tr('Читаем список устройств…')}</p>:<>
            {connected.length>0&&<ul className="bluetooth-devices">{rows(connected)}</ul>}
            {saved.length>0&&<ul className={`bluetooth-devices ${connected.length?'bluetooth-saved':''}`}>{rows(saved)}</ul>}
            {snapshot&&snapshot.devices.length===0&&<p className="bluetooth-empty">{snapshot.available?tr('Сохранённых устройств пока нет. Добавьте наушники, мышь или другое устройство.'):tr('Проверьте Bluetooth-адаптер или подключите его к компьютеру.')}</p>}
            {snapshot&&!snapshot.enabled&&snapshot.available&&<p className="bluetooth-hint">{tr('Включите Bluetooth для подключения устройств.')}</p>}
        </>}
        <button className="bluetooth-add" disabled={!snapshot?.enabled||changing} onClick={()=>void onWindows('bluetooth-add')}><Plus size={17}/>{tr('Добавить устройство')}</button>
        <p className="bluetooth-hint">{tr('Добавление откроет отдельное окно сопряжения Windows.')}</p>
        <footer className="bluetooth-footer"><button onClick={()=>void onWindows('quick-settings')}>{tr('Управлять подключением в Windows')}<ArrowUpRight size={13}/></button><button aria-label={tr('Все настройки Bluetooth')} title={tr('Все настройки Bluetooth')} onClick={()=>void onWindows('bluetooth')}><ArrowUpRight size={15}/></button></footer>
        <p className="bluetooth-hint bluetooth-connection-note">{tr('Подключение и отключение: стрелка рядом с Bluetooth в мини-панели Windows.')}</p>
    </>;
}
