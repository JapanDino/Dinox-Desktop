import {tr,trError} from '../i18n/core';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Wifi, Volume2, VolumeX, Battery, BatteryCharging, ChevronUp, SlidersHorizontal, Bluetooth, Sun, Keyboard, Settings2, Shield, Monitor, ArrowUpRight, ChevronRight, X, PlugZap, Bell } from 'lucide-react';
import { dockVariables, type DockDesign } from '../dockDesign';
import { panelPosition, systemStripWidth, type SystemOptions, type SystemStatus } from './model';
import './system.css';
import { BatteryGlyph } from './BatteryGlyph';
import { BluetoothPanel } from './BluetoothPanel';
import { WifiPanel } from './WifiPanel';
import { LanguagePanel } from './LanguagePanel';
import { TrayPanel } from './TrayPanel';
import { MixerPanel } from './MixerPanel';
interface Props {
    options: SystemOptions;
    design: DockDesign;
    open: boolean;
    onOpen: (open: boolean) => void;
    panelRef: RefObject<HTMLDivElement | null>;
    eco: boolean;
}
export function SystemControls({ options: o, design, open, onOpen, panelRef, eco }: Props) {
    const anchor = useRef<HTMLButtonElement>(null);
    const [page,setPage]=useState<'quick'|'wifi'|'bluetooth'|'language'|'tray'|'mixer'>('quick');
    const [actionPending,setActionPending]=useState<string|null>(null);
    const actionBusy=useRef(false);
    const bluetoothOpen=page==='bluetooth',wifiOpen=page==='wifi';
    const setWifiOpen=(value:boolean)=>setPage(value?'wifi':'quick');
    const setBluetoothOpen=(value:boolean)=>setPage(value?'bluetooth':'quick');
    useEffect(()=>{if(!open)setPage('quick');},[open]);
    const openLanguage=()=>{setError('');setPage('language');onOpen(true);};
    const openTray=()=>{setError('');setPage('tray');onOpen(true);};
    const [status, setStatus] = useState<SystemStatus | null>(null), [error, setError] = useState('');
    const [volume, setVolume] = useState(0), [brightness, setBrightness] = useState(0);
    const changing = useRef({ volume: false, brightness: false });
    const [position, setPosition] = useState({ width: 370, left: 12, bottom: 90, maxHeight: 480 });
    const busy = useRef(false), mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const refresh = async () => {
        if (busy.current)
            return;
        busy.current = true;
        try {
            const value = await invoke<SystemStatus>('system_controls_status');
            if (!mounted.current)
                return;
            setStatus(value);
            if (!changing.current.volume)
                setVolume(value.volume ?? 0);
            if (!changing.current.brightness)
                setBrightness(value.brightness ?? 0);
        }
        catch {
            if (mounted.current)
                setError(tr("Не удалось прочитать состояние системы. Кнопки Windows остаются доступны."));
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
        }>('volume-change', ({ payload }) => { if (!changing.current.volume)
            setVolume(Math.round(payload.volume * 100)); setStatus(s => s ? { ...s, volume: Math.round(payload.volume * 100), muted: payload.is_muted } : s); });
        const stopBrightness = listen<{
            brightness: number;
        }>('brightness-change', ({ payload }) => { if (!changing.current.brightness)
            setBrightness(payload.brightness); });
        return () => { clearInterval(timer); void stopVolume.then(f => f()); void stopBrightness.then(f => f()); };
    }, [o.enabled, eco, open]);
    useLayoutEffect(() => {
        if (!open)
            return;
        const place = () => { const rect = anchor.current?.getBoundingClientRect(); const dock = anchor.current?.closest('.dock')?.getBoundingClientRect(); if (rect)
            setPosition(panelPosition({ right: rect.right, top: dock?.top ?? rect.top }, { width: window.innerWidth, height: window.innerHeight })); };
        place();
        window.addEventListener('resize', place);
        return () => window.removeEventListener('resize', place);
    }, [open]);
    useLayoutEffect(() => { if (open)
        window.dispatchEvent(new Event('system-panel-bounds')); }, [position, open, error, status?.brightness]);
    useEffect(() => { if (!open)
        return; const close = (event: KeyboardEvent) => { if (event.key === 'Escape') {
        event.stopPropagation();
        if(page!=='quick'){setPage('quick');return;}
        onOpen(false);
        anchor.current?.focus();
    } }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [open, onOpen, page]);
    useEffect(()=>{if(!open)return;const trap=(event:KeyboardEvent)=>{if(event.key!=='Tab')return;const nodes=Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')??[]).filter(n=>n.getClientRects().length>0);if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(!panelRef.current?.contains(document.activeElement)){event.preventDefault();(event.shiftKey?last:first).focus();}else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}};window.addEventListener('keydown',trap);return()=>window.removeEventListener('keydown',trap);},[open,panelRef]);
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
    const commit = async (kind: 'volume' | 'brightness', value: number) => {
        changing.current[kind] = false;
        setError('');
        try {
            await invoke(kind === 'volume' ? 'set_volume' : 'set_brightness', kind === 'volume' ? { volume: Math.max(0, Math.min(100, value)) / 100 } : { brightness: Math.round(Math.max(0, Math.min(100, value))) });
        }
        catch {
            setError(tr("Windows не применила значение. Открой настройки устройства."));
        }
    };
    const BatteryIcon = status?.charging ? BatteryCharging : status?.battery == null ? PlugZap : Battery;
    const VolumeIcon = status?.muted || volume === 0 ? VolumeX : Volume2;
    const batteryText = status?.battery == null ? tr("Питание") : `${status.battery}%`;
    const portalStyle = { ...dockVariables(design), '--system-surface': design.background, ...position } as CSSProperties;
    if (!o.enabled)
        return null;
    return <>
    <div className="system-strip" style={{ width: systemStripWidth(o) }} onClick={e => e.stopPropagation()} onContextMenu={e => e.stopPropagation()}>
      {o.layout && <button className="system-language" aria-label={tr("Раскладка {0}: переключить язык", status?.language ?? '…')} title={tr("Выбрать раскладку")} aria-expanded={open&&page==='language'} onClick={openLanguage}>{status?.language ?? '…'}</button>}
      <button className="system-quick" ref={anchor} aria-label={tr("Быстрые настройки")} aria-expanded={open} aria-controls="bloom-system-panel" onClick={() => onOpen(!open)} title={tr("Wi-Fi, звук, яркость и питание")}>
        {o.compact || (!o.wifi && !o.volume && !o.battery) ? <SlidersHorizontal size={18}/> : <>{o.wifi && <Wifi size={17}/>} {o.volume && <VolumeIcon size={17}/>} {o.battery && <span className="system-battery">{status?.battery != null ? <BatteryGlyph level={status.battery} charging={status.charging}/> : <PlugZap size={17}/>} {o.percent && status?.battery != null && <small>{status.battery}%</small>}</span>}</>}
      </button>
      {o.tray && <button className="system-tray" aria-label={tr("Скрытые значки приложений")} title={tr("Скрытые значки приложений Windows")} aria-expanded={open&&page==='tray'} onClick={openTray}><ChevronUp size={17}/></button>}
    </div>
    {open && createPortal(<div id="bloom-system-panel" ref={panelRef} role="dialog" aria-label={page==='mixer'?tr('Микшер приложений'):page==='tray'?tr('Скрытые значки'):page==='language'?tr('Раскладка клавиатуры'):wifiOpen?'Wi-Fi':bluetoothOpen?"Bluetooth":tr("Быстрые настройки")} className="system-panel" style={portalStyle} onClick={e => e.stopPropagation()} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}>
      {error && <p className="system-error" role="alert">{trError(error)}</p>}
      {page==='mixer'?<MixerPanel onBack={()=>setPage('quick')} onClose={()=>onOpen(false)}/>:page==='tray'?<TrayPanel onBack={()=>setPage('quick')} onClose={()=>onOpen(false)} busy={actionPending==='tray'} onWindows={()=>void action('tray')}/>:page==='language'?<LanguagePanel onBack={()=>setPage('quick')} onClose={()=>onOpen(false)} onChanged={()=>void refresh()}/>:wifiOpen?<WifiPanel onBack={()=>setWifiOpen(false)} onClose={()=>onOpen(false)} onWindows={action}/>:bluetoothOpen?<BluetoothPanel onBack={()=>setBluetoothOpen(false)} onClose={()=>onOpen(false)} onWindows={action}/>:<>
      <header><div><strong>{tr("Быстрые настройки")}</strong><span>{tr("Система под рукой")}</span></div><button aria-label={tr("Закрыть быстрые настройки")} onClick={() => onOpen(false)}><X size={17}/></button></header>
      <div className="system-connections"><button onClick={() => {setError('');setWifiOpen(true);}}><Wifi /><span>Wi-Fi<small>{tr("Выбор сети")}</small></span><ChevronRight size={14}/></button><button onClick={() => {setError('');setBluetoothOpen(true);}}><Bluetooth /><span>Bluetooth<small>{tr("Устройства")}</small></span><ChevronRight size={14}/></button></div>
      <div className="system-slider"><div><button aria-label={status?.muted ? tr("Включить звук") : tr("Выключить звук")} disabled={status?.volume == null} onClick={() => void action('mute')}><VolumeIcon size={19}/></button><label htmlFor="system-volume">{tr("Громкость")}</label><output>{status?.volume == null ? '—' : `${volume}%`}</output></div><input id="system-volume" aria-label={tr("Громкость системы")} type="range" min="0" max="100" disabled={status?.volume == null} value={volume} onChange={e => { changing.current.volume = true; setVolume(Number(e.target.value)); }} onPointerUp={e => void commit('volume', Number(e.currentTarget.value))} onKeyUp={e => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key))
            void commit('volume', Number(e.currentTarget.value)); }} onBlur={e => { if (changing.current.volume)
            void commit('volume', Number(e.currentTarget.value)); }}/>
        <div className="system-links"><button onClick={() => setPage('mixer')}><SlidersHorizontal size={13}/>{tr("Микшер приложений")}</button><button onClick={() => void action('sound')}>{tr("Выход и микрофон")}<ArrowUpRight size={12}/></button></div>
      </div>
      <div className="system-slider"><div><Sun size={19}/><label htmlFor="system-brightness">{tr("Яркость")}</label><output>{status?.brightness == null ? '—' : `${brightness}%`}</output></div><input id="system-brightness" aria-label={tr("Яркость экрана")} type="range" min="0" max="100" disabled={status?.brightness == null} value={brightness} onChange={e => { changing.current.brightness = true; setBrightness(Number(e.target.value)); }} onPointerUp={e => void commit('brightness', Number(e.currentTarget.value))} onKeyUp={e => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key))
            void commit('brightness', Number(e.currentTarget.value)); }} onBlur={e => { if (changing.current.brightness)
            void commit('brightness', Number(e.currentTarget.value)); }}/>
        <div className="system-links"><span>{status?.brightness == null ? tr("Регулятор экрана недоступен") : tr("Встроенный экран")}</span><button onClick={() => void action('display')}>{tr("Параметры дисплея")}<ArrowUpRight size={12}/></button></div>
      </div>
      <div className="system-info-row"><button onClick={() => void action('battery')}><BatteryIcon size={20}/><span>{batteryText}<small>{status?.charging ? tr("Заряжается") : status?.plugged_in ? tr("От сети") : status?.battery != null ? tr("От батареи") : tr("Параметры питания")}</small></span><ArrowUpRight size={12}/></button><button onClick={openLanguage} title={tr("Выбрать раскладку")}><Keyboard size={20}/><span>{status?.language ?? tr("Раскладка")}<small>{tr("Сменить язык")}</small></span><ChevronRight size={12}/></button></div>
      <div className="system-shortcuts"><button onClick={openTray}><ChevronUp size={16}/>{tr("Скрытые значки")}</button><button onClick={() => void action('quick-settings')}><SlidersHorizontal size={15}/>{tr("Панель Windows")}<ArrowUpRight size={12}/></button><button onClick={() => void action('notifications')}><Bell size={15}/>{tr("Центр уведомлений")}<ArrowUpRight size={12}/></button><button onClick={() => void action('vpn')}><Shield size={15}/>VPN<ArrowUpRight size={12}/></button></div>
      <footer><button onClick={() => { setError(''); void invoke('open_dock_settings').then(() => onOpen(false)).catch(() => setError(tr('Не удалось открыть настройки Dinox'))); }}><Settings2 size={14}/>{tr("Настроить Dinox")}</button><button onClick={() => void action('restore-taskbar')} title={tr("Отключить док Dinox и вернуть панель задач Windows")}><Monitor size={14}/>{tr("Вернуть таскбар")}</button></footer>
      </>}
    </div>, document.body)}
  </>;
}
