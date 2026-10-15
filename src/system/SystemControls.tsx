import {tx} from '../desktopText';
import {tr,trError} from '../i18n/core';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Wifi, Volume2, VolumeX, Battery, BatteryCharging, ChevronUp, SlidersHorizontal, Bluetooth, Sun, Keyboard, Settings2, Shield, Monitor, ArrowUpRight, ChevronRight, X, PlugZap, Bell, Moon, Headphones } from 'lucide-react';
import { dockVariables, type DockDesign } from '../dockDesign';
import { panelPosition, systemStripWidth, type SystemOptions, type SystemStatus } from './model';
import './system.css';
import './quickSettings.css';
import { BatteryGlyph } from './BatteryGlyph';
import { BluetoothPanel } from './BluetoothPanel';
import { WifiPanel } from './WifiPanel';
import { LanguagePanel } from './LanguagePanel';
import { TrayPanel } from './TrayPanel';
import { MixerPanel } from './MixerPanel';
import { AudioDevicesPanel } from './AudioDevicesPanel';
import { PowerPanel } from './PowerPanel';
import { useDoNotDisturb } from '../notifications/useDoNotDisturb';
interface Props {
    options: SystemOptions;
    design: DockDesign;
    open: boolean;
    onOpen: (open: boolean) => void;
    panelRef: RefObject<HTMLDivElement | null>;
    eco: boolean;
    inline?: boolean;
    initialPage?: SystemPage;
}
export type SystemPage='quick'|'wifi'|'bluetooth'|'language'|'tray'|'mixer'|'audio'|'power';
export function SystemControls({ options: o, design, open, onOpen, panelRef, eco, inline=false, initialPage='quick' }: Props) {
    const anchor = useRef<HTMLButtonElement>(null);
    const returnFocus = useRef<HTMLElement|null>(null);
    const wasOpen = useRef(false);
    const rememberTrigger=(event?:{currentTarget:HTMLElement})=>{if(!open)returnFocus.current=event?.currentTarget??document.activeElement as HTMLElement|null;};
    const [page,setPage]=useState<SystemPage>(initialPage);
    const dnd=useDoNotDisturb();
    const [actionPending,setActionPending]=useState<string|null>(null);
    const actionBusy=useRef(false);
    const bluetoothOpen=page==='bluetooth',wifiOpen=page==='wifi';
    const setWifiOpen=(value:boolean)=>setPage(value?'wifi':'quick');
    const setBluetoothOpen=(value:boolean)=>setPage(value?'bluetooth':'quick');
    useEffect(()=>{if(!open)setPage('quick');},[open]);
    const openLanguage=(event?:{currentTarget:HTMLElement})=>{rememberTrigger(event);setError('');setPage('language');onOpen(true);};
    const openTray=(event?:{currentTarget:HTMLElement})=>{rememberTrigger(event);setError('');setPage('tray');onOpen(true);};
    const [status, setStatus] = useState<SystemStatus | null>(null), [error, setError] = useState('');
    const [connections,setConnections]=useState<{wifi:{available:boolean;enabled:boolean|null;name:string|null}|null;bluetooth:{available:boolean;enabled:boolean;count:number}|null}>({wifi:null,bluetooth:null});
    // Only read cached connection information while this page is visible; never start a scan here.
    useEffect(()=>{
        if(!open||page!=='quick')return;
        let active=true;
        setConnections({wifi:null,bluetooth:null});
        void invoke<{available:boolean;enabled:boolean|null;networks:{connected:boolean;name:string}[]}>('wifi_snapshot',{scan:false})
            .then(s=>{if(active)setConnections(c=>({...c,wifi:{available:s.available,enabled:s.enabled,name:s.networks.find(n=>n.connected)?.name||null}}));})
            .catch(()=>{});
        void invoke<{available:boolean;enabled:boolean;devices:{connected:boolean|null}[]}>('bluetooth_snapshot')
            .then(s=>{if(active)setConnections(c=>({...c,bluetooth:{available:s.available,enabled:s.enabled,count:s.devices.filter(d=>d.connected).length}}));})
            .catch(()=>{});
        return()=>{active=false;};
    },[open,page]);
    const [statusError,setStatusError]=useState('');
    const [volume, setVolume] = useState(0), [brightness, setBrightness] = useState(0);
    const changing = useRef({ volume: false, brightness: false });
    const adjustmentRevision=useRef(0);
    const adjustmentQueue=useRef(Promise.resolve());
    const [position, setPosition] = useState<ReturnType<typeof panelPosition>>({ width: 370, left: 12, bottom: 90, maxHeight: 480 });
    const busy = useRef(false), mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const refresh = async () => {
        if (busy.current)
            return;
        busy.current = true;
        const revision=adjustmentRevision.current;
        try {
            const value = await invoke<SystemStatus>('system_controls_status');
            if (!mounted.current||revision!==adjustmentRevision.current)
                return;
            setStatus(value);
            setStatusError('');
            if (!changing.current.volume)
                setVolume(value.volume ?? 0);
            if (!changing.current.brightness)
                setBrightness(value.brightness ?? 0);
        }
        catch {
            if (mounted.current)
                setStatusError(tr("Не удалось прочитать состояние системы. Кнопки Windows остаются доступны."));
        }
        finally {
            busy.current = false;
        }
    };
    useEffect(() => {
        if (!o.enabled) {
            onOpen(false);
            return;
        }
        void refresh();
        const timer = setInterval(() => void refresh(), eco && !open ? 10000 : 2000);
        const stopVolume = listen<{
            volume: number;
            is_muted: boolean;
        }>('volume-change', ({ payload }) => { if (!changing.current.volume){
            setVolume(Math.round(payload.volume * 100)); setStatus(s => s ? { ...s, volume: Math.round(payload.volume * 100), muted: payload.is_muted } : s); }});
        const stopBrightness = listen<{
            brightness: number;
        }>('brightness-change', ({ payload }) => { if (!changing.current.brightness)
            setBrightness(payload.brightness); });
        return () => { clearInterval(timer); void stopVolume.then(f => f()); void stopBrightness.then(f => f()); };
    }, [o.enabled, eco, open]);
    useLayoutEffect(() => {
        if (!open || inline)
            return;
        const place = () => { const rect = anchor.current?.getBoundingClientRect(); const dock = anchor.current?.closest('.dock')?.getBoundingClientRect(); if (rect)
            setPosition(panelPosition({ right: dock?.right ?? rect.right, left: dock?.left ?? rect.left, top: dock?.top ?? rect.top, bottom: dock?.bottom ?? rect.bottom, edge: design.edge }, { width: window.innerWidth, height: window.innerHeight })); };
        place();
        window.addEventListener('resize', place);
        return () => window.removeEventListener('resize', place);
    }, [open, design.edge, inline]);
    useLayoutEffect(() => { if (open)
        window.dispatchEvent(new Event('system-panel-bounds')); }, [position, open, error, status?.brightness]);
    useLayoutEffect(()=>{
        if(open){wasOpen.current=true;panelRef.current?.querySelector<HTMLButtonElement>('header button:not(:disabled)')?.focus();}
        else if(wasOpen.current){wasOpen.current=false;if(returnFocus.current?.isConnected)returnFocus.current.focus();}
    },[open,page,panelRef]);
    useEffect(() => { if (!open)
        return; const close = (event: KeyboardEvent) => { if (event.key === 'Escape') {
        event.stopPropagation();
        if(page!=='quick'){setPage('quick');return;}
        onOpen(false);
        event.preventDefault();
    } }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [open, onOpen, page]);
    useEffect(()=>{if(!open||inline)return;const trap=(event:KeyboardEvent)=>{if(event.key!=='Tab')return;const nodes=Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')??[]).filter(n=>n.getClientRects().length>0);if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(!panelRef.current?.contains(document.activeElement)){event.preventDefault();(event.shiftKey?last:first).focus();}else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}};window.addEventListener('keydown',trap);return()=>window.removeEventListener('keydown',trap);},[open,panelRef,inline]);
    const action = async (name: string) => {
        if(actionBusy.current)return;actionBusy.current=true;setActionPending(name);
        setError('');
        try {
            await invoke('system_control_action', { action: name });
            if (name === 'mute')
                void refresh();
            else
                onOpen(false);
        }
        catch (e) {
            setError(typeof e === 'string' ? e : tr("Не удалось открыть панель Windows."));
            onOpen(true);
        }
        finally {actionBusy.current=false;if(mounted.current)setActionPending(null);}
    };
    const commit = (kind: 'volume' | 'brightness', value: number) => {
        const revision=++adjustmentRevision.current;
        changing.current[kind] = true;
        setError('');
        const work=async()=>{
        try {
            const actual=await invoke<unknown>(kind === 'volume' ? 'set_volume' : 'set_brightness', kind === 'volume' ? { volume: Math.max(0, Math.min(100, value)) / 100 } : { brightness: Math.round(Math.max(0, Math.min(100, value))) });
            if(!mounted.current||revision!==adjustmentRevision.current)return;
            if(typeof actual==='number'){
                const confirmed=kind==='volume'?Math.round(actual*100):actual;
                if(kind==='brightness')setBrightness(confirmed);else setVolume(confirmed);
                setStatus(s=>s?{...s,[kind]:confirmed}:s);
            }
        }
        catch (e) {
            if(!mounted.current||revision!==adjustmentRevision.current)return;
            if(kind==='brightness')setBrightness(status?.brightness??0);
            else setVolume(status?.volume??0);
            setError(typeof e==='string'?trError(e):tr("Windows не применила значение. Открой настройки устройства."));
        } finally {if(revision===adjustmentRevision.current){changing.current.volume=false;changing.current.brightness=false;void refresh();}}
        };
        adjustmentQueue.current=adjustmentQueue.current.then(work,work);
        return adjustmentQueue.current;
    };
    const BatteryIcon = status?.charging ? BatteryCharging : status?.battery == null ? PlugZap : Battery;
    const VolumeIcon = status?.muted || volume === 0 ? VolumeX : Volume2;
    const batteryText = status?.battery == null ? tr("Питание") : `${status.battery}%`;
    const openNotices=async()=>{if(actionBusy.current)return;actionBusy.current=true;setError('');try{await invoke('open_bloom_notifications');onOpen(false);}catch(e){setError(trError(e));}finally{actionBusy.current=false;}};
    const portalStyle = { ...dockVariables(design), '--system-surface': design.background, ...(inline?{'--system-surface':'var(--bloom-bg-expanded, #000)','--dock-text':'var(--bloom-text, #f5f5f5)','--dock-accent':'var(--dn-focus, #b7a6ff)'}:position) } as CSSProperties;
    const renderPanel=(element:React.ReactNode)=>inline?element:createPortal(element,document.body);
    const wifiLabel=connections.wifi?.available===false?tx('Недоступно','Unavailable'):connections.wifi?.name??(connections.wifi?.enabled===false?tr('Выключен'):tr('Выбор сети'));
    const bluetoothLabel=connections.bluetooth?.available===false?tx('Недоступно','Unavailable'):connections.bluetooth?.enabled===false?tr('Выключен'):connections.bluetooth?.count?tx(`Подключено: ${connections.bluetooth.count}`,`Connected: ${connections.bluetooth.count}`):tr('Устройства');
    if (!o.enabled)
        return null;
    return <>
    {!inline&&<div className="system-strip" style={{ width: systemStripWidth(o) }} onClick={e => e.stopPropagation()} onContextMenu={e => e.stopPropagation()}>
      {o.layout && <button className="system-language" aria-label={tr("Раскладка {0}: переключить язык", status?.language ?? '…')} title={tr("Выбрать раскладку")} aria-expanded={open&&page==='language'} onClick={openLanguage}>{status?.language ?? '…'}</button>}
      <button className="system-quick" ref={anchor} aria-label={tr("Быстрые настройки")} aria-expanded={open} aria-controls="bloom-system-panel" onClick={event => {rememberTrigger(event);onOpen(!open);}} title={tr("Wi-Fi, звук, яркость и питание")}>
        {o.compact || (!o.wifi && !o.volume && !o.battery) ? <SlidersHorizontal size={18}/> : <>{o.wifi && <Wifi size={17}/>} {o.volume && <VolumeIcon size={17}/>} {o.battery && <span className="system-battery">{status?.battery != null ? <BatteryGlyph level={status.battery} charging={status.charging}/> : <PlugZap size={17}/>} {o.percent && status?.battery != null && <small>{status.battery}%</small>}</span>}</>}
      </button>
      {o.tray && <button className="system-tray" aria-label={tr("Скрытые значки приложений")} title={tr("Скрытые значки приложений Windows")} aria-expanded={open&&page==='tray'} onClick={openTray}><ChevronUp size={17}/></button>}
    </div>}
    {open && renderPanel(<div id={inline?'dinox-island-controls':'bloom-system-panel'} ref={panelRef} role={inline?'region':'dialog'} aria-label={page==='audio'?tx('Аудиоустройства','Audio devices'):page==='power'?tx('Питание','Power'):page==='mixer'?tr('Микшер приложений'):page==='tray'?tr('Скрытые значки'):page==='language'?tr('Раскладка клавиатуры'):wifiOpen?'Wi-Fi':bluetoothOpen?"Bluetooth":tr("Быстрые настройки")} className={`system-panel${inline?' system-panel-inline':''}${page==='quick'?' quick-settings':''}`} style={portalStyle} onClick={e => e.stopPropagation()} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}>
      {(error||statusError) && <p className="system-error" role="alert">{trError(error||statusError).slice(0,300)}</p>}
      {page==='audio'?<AudioDevicesPanel onBack={()=>setPage('quick')} onClose={()=>onOpen(false)}/>:page==='power'?<PowerPanel onBack={()=>setPage('quick')} onClose={()=>onOpen(false)}/>:page==='mixer'?<MixerPanel onBack={()=>setPage('quick')} onClose={()=>onOpen(false)}/>:page==='tray'?<TrayPanel onBack={()=>setPage('quick')} onClose={()=>onOpen(false)} busy={actionPending==='tray'} onWindows={()=>void action('tray')}/>:page==='language'?<LanguagePanel onBack={()=>setPage('quick')} onClose={()=>onOpen(false)} onChanged={()=>void refresh()}/>:wifiOpen?<WifiPanel onBack={()=>setWifiOpen(false)} onClose={()=>onOpen(false)} onWindows={action}/>:bluetoothOpen?<BluetoothPanel onBack={()=>setBluetoothOpen(false)} onClose={()=>onOpen(false)} onWindows={action}/>:<>
      <header><strong>{tr("Быстрые настройки")}</strong><button aria-label={tr("Закрыть быстрые настройки")} onClick={() => onOpen(false)}><X size={17}/></button></header>
      <div className="system-connections"><button data-active={!!connections.wifi?.name} onClick={() => {setError('');setWifiOpen(true);}}><span className="quick-connection-icon" aria-hidden="true"><Wifi size={22}/><i/></span><span className="quick-connection-label">Wi-Fi<small title={wifiLabel}>{wifiLabel}</small></span><ChevronRight size={14}/></button><button data-active={connections.bluetooth?.enabled===true} onClick={() => {setError('');setBluetoothOpen(true);}}><span className="quick-connection-icon" aria-hidden="true"><Bluetooth size={22}/><i/></span><span className="quick-connection-label">Bluetooth<small>{bluetoothLabel}</small></span><ChevronRight size={14}/></button></div>
      <div className="system-slider quick-volume" data-muted={status?.muted}><div><button aria-label={status?.muted ? tr("Включить звук") : tr("Выключить звук")} aria-pressed={status?.muted??false} disabled={status?.volume == null} onClick={() => void action('mute')}><VolumeIcon size={19}/></button><label htmlFor="system-volume">{tr("Громкость")}</label><output>{status?.volume == null ? '—' : `${volume}%`}</output></div><div className="quick-range" data-disabled={status?.volume==null} style={{'--quick-level':`${volume}%`} as CSSProperties}><span aria-hidden="true" className="quick-range-icon"><VolumeIcon size={18}/></span><span aria-hidden="true" className="quick-range-ink"><span className="quick-range-icon"><VolumeIcon size={18}/></span></span><input id="system-volume" aria-label={tr("Громкость системы")} type="range" min="0" max="100" disabled={status?.volume == null} value={volume} onChange={e => { adjustmentRevision.current++; changing.current.volume = true; setVolume(Number(e.target.value)); }} onPointerUp={e => void commit('volume', Number(e.currentTarget.value))} onPointerCancel={e => void commit('volume', Number(e.currentTarget.value))} onKeyUp={e => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key))
            void commit('volume', Number(e.currentTarget.value)); }} onBlur={e => { if (changing.current.volume)
            void commit('volume', Number(e.currentTarget.value)); }}/></div>
        <div className="system-links"><button onClick={() => setPage('mixer')}><SlidersHorizontal size={13}/>{tr("Микшер приложений")}</button><button onClick={() => setPage('audio')}><Headphones size={13}/>{tr("Выход и микрофон")}<ChevronRight size={12}/></button></div>
      </div>
      <div className="system-slider quick-brightness"><div><Sun size={19}/><label htmlFor="system-brightness">{tr("Яркость")}</label><output>{status?.brightness == null ? '—' : `${brightness}%`}</output></div><div className="quick-range" data-disabled={status?.brightness==null} style={{'--quick-level':`${brightness}%`} as CSSProperties}><span aria-hidden="true" className="quick-range-icon"><Sun size={18}/></span><span aria-hidden="true" className="quick-range-ink"><span className="quick-range-icon"><Sun size={18}/></span></span><input id="system-brightness" aria-label={tr("Яркость экрана")} type="range" min="0" max="100" disabled={status?.brightness == null} value={brightness} onChange={e => { adjustmentRevision.current++; changing.current.brightness = true; setBrightness(Number(e.target.value)); }} onPointerUp={e => void commit('brightness', Number(e.currentTarget.value))} onPointerCancel={e => void commit('brightness', Number(e.currentTarget.value))} onKeyUp={e => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key))
            void commit('brightness', Number(e.currentTarget.value)); }} onBlur={e => { if (changing.current.brightness)
            void commit('brightness', Number(e.currentTarget.value)); }}/></div>
        <div className="system-links"><span>{status?.brightness == null ? tr("Регулятор экрана недоступен") : status?.brightness_target==='primary-ddc'?tx('Основной монитор · DDC/CI','Primary monitor · DDC/CI'):tr("Встроенный экран")}</span></div>
      </div>
      <div className="system-info-row"><button className="quick-power" onClick={() => setPage('power')}><span className="quick-battery-art" aria-hidden="true" data-low={status?.battery!=null&&status.battery<=20}>{status?.battery==null?<BatteryIcon size={22}/>:<><span className="quick-battery-cells">{Array.from({length:5},(_,i)=><i key={i} data-filled={status.battery!>i*20}/>)}</span>{status.charging&&<PlugZap size={14}/>}</>}</span><span>{batteryText}<small>{status?.charging ? tr("Заряжается") : status?.plugged_in ? tr("От сети") : status?.battery != null ? tr("От батареи") : tr("Параметры питания")}</small></span><ChevronRight size={12}/></button><button className="quick-keyboard" onClick={openLanguage} title={tr("Выбрать раскладку")}><span className="quick-keycap" aria-hidden="true"><Keyboard size={22}/></span><span>{status?.language ?? tr("Раскладка")}<small>{tr("Сменить язык")}</small></span><ChevronRight size={12}/></button></div>
      <div className="system-shortcuts"><button onClick={openTray}><ChevronUp size={16}/>{tr("Скрытые значки")}<ChevronRight size={12}/></button><button onClick={()=>void openNotices()}><Bell size={15}/>{tx('Уведомления Dinox','Dinox notifications')}<ChevronRight size={12}/></button><button className="quick-dnd" role="switch" aria-checked={dnd.enabled} disabled={dnd.pending} title={tx('Скрывает всплывающие уведомления Dinox. Режим Windows не меняется.','Hides Dinox notification popups. Windows notification settings stay unchanged.')} onClick={()=>void dnd.setEnabled(!dnd.enabled)}><Moon size={16}/><span>{tx('Не беспокоить Dinox','Do not disturb Dinox')}</span><i aria-hidden="true"><b/></i></button></div>
      {dnd.error&&<p className="system-error" role="alert">{tx('Не удалось сохранить режим «Не беспокоить». Повторите попытку.','Could not save Do Not Disturb. Please retry.')}</p>}
      <details className="quick-windows" onToggle={()=>window.dispatchEvent(new Event('system-panel-bounds'))}><summary>{tx('Дополнительные параметры Windows','More Windows options')}<ChevronRight size={13}/></summary><div><button onClick={() => void action('quick-settings')}><SlidersHorizontal size={15}/>{tr("Панель Windows")}<ArrowUpRight size={12}/></button><button onClick={() => void action('display')}><Monitor size={15}/>{tr("Параметры дисплея")}<ArrowUpRight size={12}/></button><button onClick={() => void action('vpn')}><Shield size={15}/>VPN<ArrowUpRight size={12}/></button><button onClick={() => void action('notifications')}><Bell size={15}/>{tx('Уведомления Windows','Windows notifications')}<ArrowUpRight size={12}/></button></div></details>
      <footer><button onClick={() => { setError(''); void invoke('open_dock_settings').then(() => onOpen(false)).catch(() => setError(tr('Не удалось открыть настройки Dinox'))); }}><Settings2 size={14}/>{tr("Настроить Dinox")}</button><button onClick={() => void action('restore-taskbar')} title={tr("Отключить док Dinox и вернуть панель задач Windows")}><Monitor size={14}/>{tr("Вернуть таскбар")}</button></footer>
      </>}
    </div>)}
  </>;
}
