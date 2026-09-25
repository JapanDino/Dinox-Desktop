// Dev-only promotional compositions. All UI panels are production components;
// OS calls and content come from the synthetic personal-preview harness.
import {useState} from 'react';
import {Bell, CalendarDays, SlidersHorizontal, Pin, Wifi, Bluetooth, ArrowUpRight, Check, ShieldCheck, Moon} from 'lucide-react';
import Dock from '../src/Dock';
import {CalendarPanel} from '../src/calendar/CalendarPanel';
import {useCalendar} from '../src/calendar/useCalendar';
import {NotificationCard} from '../src/notifications/NotificationPanel';
import {notificationDefaults} from '../src/notifications/model';
import {WifiPanel} from '../src/system/WifiPanel';
import {BluetoothPanel} from '../src/system/BluetoothPanel';
import {DockContentSettings} from '../src/dock/DockContentSettings';
import {DockDesignPreview} from '../src/components/DockDesignSettings';
import {dockDefaults,bloomDockDesign,dockPresets} from '../src/dockDesign';
import {useBloomAppearance} from '../src/appearance/BloomAppearance';
import './promo.css';

const names:Record<string,string>={cover:'Твоё пространство',calendar:'Календарь',dock:'Панель задач',notices:'Уведомления',connections:'Подключения',appearance:'Оформление'};
const noop=()=>{};
const notices=[
 {id:1,app_id:'TelegramDesktop',app_name:'Telegram',title:'Аня Смирнова',body:'Нашла отличный маршрут на выходные. Пойдём гулять? 🌿',created:+new Date('2026-09-23T10:39:00+03:00')},
 {id:2,app_id:'TelegramDesktop',app_name:'Telegram',title:'Дизайн-команда',body:'Обновили макеты. Всё готово к завтрашней встрече.',created:+new Date('2026-09-23T10:37:00+03:00')},
];
function Calendar(){
 const [date,setDate]=useState(new Date('2026-09-23T10:40:00+03:00'));
 const model=useCalendar(+date-45*86400000,+date+50*86400000,false);
 const [pinned,setPinned]=useState(false);
 return <CalendarPanel model={model} date={date} onDate={setDate} pinned={pinned} onPinned={()=>setPinned(!pinned)}/>;
}
function Brand(){return <div className="promo-brand"><img src="/dinox.svg"/><span>dinox</span><small>Desktop</small></div>}
function Links(){return <span className="promo-repo">github.com/JapanDino/Dinox-Desktop <ArrowUpRight size={17}/></span>}
function DockStage(){return <div className="promo-dock"><Dock/></div>}
export function Promo(){
 useBloomAppearance();
 const shot=new URLSearchParams(location.search).get('promo')||'cover';
 return <main className={`promo-artboard shot-${shot}`} data-shot={shot}>
  <div className="promo-orbit" aria-hidden="true"/>
  <header className="promo-header"><Brand/><div className="promo-edition">Windows 11 <span/> {names[shot]}</div></header>
  {shot==='cover'&&<>
   <div className="promo-cover-copy"><h1>Твой Windows.<br/><em>Твой ритм.</em></h1><p>Календарь, приложения и уведомления.<br/>Одно спокойное пространство.</p></div>
   <div className="cover-calendar panel-frame"><div className="panel-context"><CalendarDays size={17}/><span>Среда, 23 сентября</span><strong>10:40</strong></div><div className="calendar-inner"><Calendar/></div></div>
   <div className="cover-message"><NotificationCard notice={notices[0]} options={notificationDefaults}/></div>
   <DockStage/>
  </>}
  {shot==='calendar'&&<>
   <div className="promo-title"><h1>Вся неделя.<br/><em>В одном взгляде.</em></h1><p>Работа, учёба и время для себя.<br/>События из разных календарей — рядом.</p></div>
   <div className="calendar-feature panel-frame"><div className="calendar-inner"><Calendar/></div></div>
   <div className="calendar-notes"><div className="provider-row"><span>Google Календарь</span><span>Яндекс Календарь</span><span>ICS</span></div><p>Подписки для просмотра событий · обновление каждые 10 минут</p></div>
   <div className="calendar-margin"><span>Месяц</span><b>Неделя</b><span>Список</span><i/><small>Планы видны.<br/>Голова свободна.</small></div>
  </>}
  {shot==='dock'&&<>
   <div className="promo-title"><h1>Только нужное.<br/><em>В твоём порядке.</em></h1><p>Закрепляй приложения, меняй их порядок<br/>и переноси доступные ярлыки из Windows.</p></div>
   <div className="dock-settings-frame panel-frame"><DockContentSettings/></div>
   <div className="dock-features"><div><Pin size={24}/><span>Свои закрепления</span></div><div><SlidersHorizontal size={24}/><span>Размер и расположение</span></div><div><Check size={24}/><span>Индикаторы открытых окон</span></div></div>
   <DockStage/>
  </>}
  {shot==='notices'&&<>
   <div className="promo-title"><h1>На связи.<br/><em>Без лишнего шума.</em></h1><p>Сообщения в стиле Dinox.<br/>Ты решаешь, что и когда показывать.</p></div>
   <div className="notice-feature panel-frame"><div className="notice-demo-title"><Bell size={19}/><strong>Уведомления</strong><span>2</span></div><div className="notice-scale">{notices.map(n=><NotificationCard key={n.id} notice={n} options={notificationDefaults} onDismiss={noop}/>)}</div><div className="notice-bottom"><Check size={15}/> Всё важное — перед глазами</div></div>
   <div className="privacy-example"><div className="privacy-caption"><ShieldCheck size={19}/> Когда хочется приватности</div><NotificationCard notice={notices[0]} options={{...notificationDefaults,privacy:'hidden'}}/></div>
   <div className="notice-features"><span><Moon size={22}/> Тихие часы</span><span><ShieldCheck size={22}/> Скрытие текста</span><span><SlidersHorizontal size={22}/> Включается по желанию</span></div>
  </>}
  {shot==='connections'&&<>
   <div className="promo-title"><h1>Подключения.<br/><em>В знакомом стиле.</em></h1><p>Сети Wi-Fi и Bluetooth-устройства<br/>в аккуратных панелях Dinox.</p></div>
   <div className="connections-stage"><div className="connection-unit"><div className="connection-label"><Wifi size={20}/> Твоя сеть</div><div className="system-panel promo-system"><WifiPanel onBack={noop} onClose={noop} onWindows={async()=>{}}/></div></div><div className="connection-unit"><div className="connection-label"><Bluetooth size={20}/> Твои устройства</div><div className="system-panel promo-system"><BluetoothPanel onBack={noop} onClose={noop} onWindows={async()=>{}}/></div></div></div>
  </>}
  {shot==='appearance'&&<>
   <div className="promo-title"><h1>Один Dinox.<br/><em>Твой характер.</em></h1><p>От лаконичного чёрного до светлой темы.<br/>Настрой форму, интервалы и акценты.</p></div>
   <div className="appearance-showcase">
    <div className="appearance-sample theme-original"><div className="sample-caption"><span>Единый стиль Dinox</span><small>Чёрный. Белый. Ничего лишнего.</small></div><DockDesignPreview design={bloomDockDesign({...dockDefaults,size:54,gap:16,padding:15})}/></div>
    <div className="appearance-sample theme-graphite"><div className="sample-caption"><span>Графит</span><small>Мягкие углы и точечные индикаторы</small></div><DockDesignPreview design={{...dockDefaults,...dockPresets.graphite,size:48,gap:18,padding:14}}/></div>
    <div className="appearance-sample theme-light"><div className="sample-caption"><span>Светлая тема</span><small>Светлая поверхность. Лиловый акцент.</small></div><DockDesignPreview design={{...dockDefaults,...dockPresets.light,size:50,gap:17,padding:15}}/></div>
   </div>
   <div className="appearance-footnote">Отдельные темы доступны при отключении «Единого стиля Dinox».</div>
  </>}
  <footer className="promo-footer"><span>Dinox Desktop · Демо интерфейса{['cover','calendar','notices','connections'].includes(shot)?' · Вымышленные данные':''}</span><Links/></footer>
 </main>
}
