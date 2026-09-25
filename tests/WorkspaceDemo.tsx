import {LayoutEditor} from '../src/settings/LayoutEditor';
import {Launcher} from '../src/launcher/Launcher';
import {MixerPanel} from '../src/system/MixerPanel';
import {useEffect,useState} from 'react';
import {Bell,PanelBottom,CalendarDays,ArrowUpRight,Send,Monitor} from 'lucide-react';
import Dock from '../src/Dock';
import {DockContentSettings} from '../src/dock/DockContentSettings';
import {DockDesignSettings} from '../src/components/DockDesignSettings';
import {NotificationSettings} from '../src/notifications/NotificationSettings';
import {NotificationPanel} from '../src/notifications/NotificationPanel';
import {useNotifications} from '../src/notifications/useNotifications';
import {useBloomAppearance} from '../src/appearance/BloomAppearance';
import {CalendarPanel} from '../src/calendar/CalendarPanel';
import {useCalendar} from '../src/calendar/useCalendar';
import {CalendarSettings} from '../src/calendar/CalendarSettings';
import {PerformanceOptions} from '../src/components/PerformanceOptions';
import {useEcoMode} from '../src/components/PersonalOptions';
import {tr} from '../src/i18n/core';
import './workspace.css';
export function WorkspaceDemo({send}:{send:()=>void}){
 useBloomAppearance();const notifications=useNotifications();const [page,setPage]=useState('dock'),[date,setDate]=useState(new Date()),[pin,setPin]=useState(false);
 const [action,setAction]=useState('');
 useEffect(()=>{const change=(e:Event)=>{setPage((e as CustomEvent).detail);window.scrollTo({top:0});};const show=(e:Event)=>setAction((e as CustomEvent).detail);window.addEventListener('bloom-demo-page',change);window.addEventListener('bloom-demo-action',show);return()=>{window.removeEventListener('bloom-demo-page',change);window.removeEventListener('bloom-demo-action',show);};},[]);
 useEffect(()=>{if(action){const timer=setTimeout(()=>setAction(''),3500);return()=>clearTimeout(timer);}},[action]);
 const eco=useEcoMode();
 const calendar=useCalendar(+date-45*86400000,+date+50*86400000,eco);
 return <div className="workspace-demo"><header className="demo-header"><a href="?workspace&notifications-allowed" className="demo-wordmark">dinox<span>DESKTOP / 4</span></a><span className="demo-browser-label">{tr('Браузерная демоверсия · Windows не изменяется')}</span><a href="?settings&notifications-allowed" className="demo-settings-link">{tr('Все настройки')}<ArrowUpRight size={15}/></a></header>
  <main className="demo-main"><aside className="demo-intro"><span className="demo-eyebrow">{tr('Твоё пространство')}</span><h1>{tr('Меньше шума.')}<br/><span>{tr('Больше своего.')}</span></h1><p>{tr('Приложения под рукой, спокойные уведомления и единый стиль с календарём.')}</p><nav aria-label={tr('Разделы демоверсии')}>{[[Monitor,'layout','Рабочий стол'],[Monitor,'search','Поиск'],[Monitor,'mixer','Звук'],[PanelBottom,'dock','Мой док'],[Bell,'notices','Уведомления'],[CalendarDays,'calendar','Календарь'],[CalendarDays,'connections','Подключения'],[Monitor,'performance','Производительность']] .map(([Icon,id,title]:any)=><button key={id} aria-pressed={page===id} onClick={()=>setPage(id)}><Icon size={18}/>{tr(title)}</button>)}</nav><div className="demo-test"><Monitor size={18}/><p>{tr('Все устройства и сообщения здесь демонстрационные. Нажатия не управляют компьютером.')}</p><button disabled={!notifications.options.enabled} onClick={send}><Send size={16}/>{tr('Тестовое сообщение Telegram')}</button><small>{tr('Проверяет карточку, счётчик и внимание значка одним событием.')}</small></div></aside>
  <section className={`demo-panel ${page==='calendar'?'demo-calendar':''}`} aria-label={tr('Настройка Dinox')}>{page==='search'?<div style={{height:530}}><Launcher onCopy={async text=>{if(new URLSearchParams(location.search).has('copy-error'))throw new Error('Clipboard blocked');document.documentElement.dataset.copiedCalculation=text;}} onClose={()=>setPage('dock')}/></div>:page==='layout'?<LayoutEditor/>:page==='mixer'?<MixerPanel onClose={()=>setPage('dock')}/>:page==='dock'?<><DockContentSettings/><details className="demo-appearance"><summary>{tr('Размер, отступы и внешний вид')}</summary><DockDesignSettings/></details></>:page==='notices'?<NotificationSettings/>:page==='connections'?<CalendarSettings/>:page==='performance'?<PerformanceOptions/>:<CalendarPanel eco={eco} model={calendar} date={date} onDate={setDate} pinned={pin} onPinned={()=>setPin(!pin)}/>}</section></main>
  {notifications.visible&&<aside className="demo-notice-overlay"><NotificationPanel model={notifications}/></aside>}
  {action&&<div className="demo-action-status" role="status">{tr('Демонстрация открытия: {0}',action)}</div>}
  <div className="demo-dock-layer"><Dock/></div>
 </div>;
}
