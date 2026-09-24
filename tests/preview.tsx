import {WorkspaceDemo} from './WorkspaceDemo';
import packageInfo from '../package.json';
// Dev-only fixture harness; not included in production entrypoints.
import {useState} from 'react';
import Dock from '../src/Dock';
import {useBloomAppearance} from '../src/appearance/BloomAppearance';
import {SystemSettings} from '../src/system/SystemSettings';
import {DockDesignSettings} from '../src/components/DockDesignSettings';
import {NotificationSettings} from '../src/notifications/NotificationSettings';
import {NotificationPanel} from '../src/notifications/NotificationPanel';
import {useNotifications} from '../src/notifications/useNotifications';
import {sampleNotice} from '../src/notifications/model';
import {createRoot} from 'react-dom/client';
import {CalendarPanel,UpcomingEvent,ReminderCard} from '../src/calendar/CalendarPanel';
import {CalendarSettings} from '../src/calendar/CalendarSettings';
import {PersonalSettings} from '../src/components/PersonalFeatures';
import {useCalendar,useReminders} from '../src/calendar/useCalendar';
import {dayStart,weekStart,addDays,type CalendarSource} from '../src/calendar/model';
import '../src/App.css';
import '../src/Settings.css';
function previewRoot(){return (window as any).__BLOOM_PREVIEW_ROOT__??=((window as any).__BLOOM_PREVIEW_ROOT__=createRoot(document.getElementById('root')!));}
let nextId=1;
const callbacks=new Map<number,Function>(),listeners=new Map<number,{event:string;handler:number}>();
const settings:Record<string,string>={'bloom-calendar-view':'week','bloom-language':localStorage.getItem('bloom-language')||'ru',...(JSON.parse(localStorage.getItem('dinox-v4-demo-settings')||'{}'))};
if(new URLSearchParams(location.search).has('workspace')){
 settings['bloom-notifications']??=JSON.stringify({enabled:true,windowsEnabled:true});
 settings['bloom-dock-content']??=JSON.stringify({mode:'personal',showRunning:true});
}
const demoIcon=(path:string)=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#202320"/><g fill="none" stroke="#eeeeee" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</g></svg>`);
const demoApps=[
 {name:'Проводник',path:'C:/Windows/explorer.exe',icon:demoIcon('<path d="M5 10h9l3 3h10v13H5z"/><path d="M5 10V7h8l3 3h11v3"/>')},
 {name:'Telegram',path:'C:/Apps/Telegram.exe',icon:demoIcon('<path d="m5 15 22-9-5 21-7-7-4 3v-6l11-8-13 8z"/>')},
 {name:'Браузер',path:'C:/Apps/browser.exe',icon:demoIcon('<circle cx="16" cy="16" r="11"/><path d="M5 16h22M16 5c-8 6-8 16 0 22 8-6 8-16 0-22z"/>')},
 {name:'Заметки',path:'C:/Apps/notes.exe',icon:demoIcon('<rect x="7" y="5" width="18" height="23" rx="3"/><path d="M11 12h10m-10 5h10m-10 5h6"/>')},
 {name:'Музыка',path:'C:/Apps/music.exe',icon:demoIcon('<path d="M13 23V9l13-3v14M13 13l13-3"/><ellipse cx="9" cy="24" rx="4" ry="3"/><ellipse cx="22" cy="21" rx="4" ry="3"/>')},
 {name:'Редактор',path:'C:/Apps/editor.exe',icon:demoIcon('<path d="m12 10-7 6 7 6m8-12 7 6-7 6m-3-15-3 18"/>')},
].map((a,i)=>({...a,is_running:i<3,hwnd:i<3?5001+i:null,executable:a.path}));
let demoNotices:any[]=[];
const demoSend=()=>{demoNotices=[{id:++nextId,app_id:'TelegramDesktop',app_name:'Telegram',title:'Команда проекта',body:'Макет готов. Посмотри обновлённый календарь — обсудим вечером.',created:Date.now()},...demoNotices].slice(0,50);emit('bloom-notifications-changed',null);};
const demoPins=(personal:boolean)=>{const stored=localStorage.getItem('dinox-v4-demo-pins-'+personal);return stored?JSON.parse(stored):demoApps.slice(0,personal?4:2);};
const settingsChannel=new BroadcastChannel('dinox-v4-preview-settings');
settingsChannel.onmessage=({data})=>{settings[data.key]=data.value;emit('settings-changed',data);};
if(new URLSearchParams(location.search).has('legacy'))settings['bloom-dock-design']=JSON.stringify({background:'#403060',accent:'#eab0fa',opacity:65});
const now=dayStart(new Date()),week=weekStart(now);
const stamp=(day:number,hour:number)=>{const d=addDays(week,day);d.setHours(hour,0,0,0);return d.toISOString().replace(/[-:]/g,'').replace('.000','');};
const event=(uid:string,day:number,start:number,end:number,title:string,extra='')=>`BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART:${stamp(day,start)}\r\nDTEND:${stamp(day,end)}\r\nSUMMARY:${title}\r\n${extra}\r\nEND:VEVENT`;
const wrap=(body:string)=>`BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR`;
const fixtures:CalendarSource[]=[
 {id:'work',name:'Работа',color:'#b7a6ff',enabled:true,checked:Date.now()/1000,ics:wrap([event('w1',0,10,11,'Планирование недели'),event('w2',1,11,12,'Разбор проекта'),event('w3',2,10,11,'Команда · еженедельная встреча','LOCATION:Google Meet\r\nDESCRIPTION:Обсудить задачи и план релиза. https://meet.google.com/abc-defg-hij\r\nURL:https://calendar.google.com/'),event('w4',3,14,16,'Работа над проектом'),event('w5',4,12,13,'Итоги недели')].join('\r\n'))},
 {id:'study',name:'Учёба',color:'#92bdff',enabled:true,checked:Date.now()/1000,ics:wrap([event('s1',0,13,15,'Машинное обучение'),event('s2',2,12,14,'Подготовка к семинару'),event('s3',3,10,12,'Практика'),event('s4',4,15,16,'Консультация')].join('\r\n'))},
 {id:'personal',name:'Личное',color:'#8dd6b0',enabled:true,checked:Date.now()/1000,ics:wrap([event('p1',1,16,17,'Тренировка'),event('p2',2,10,12,'Забрать заказ'),event('p3',4,18,20,'Встреча с друзьями'),event('p4',5,11,13,'Прогулка')].join('\r\n'))},
];
let sources=fixtures.map(s=>({...s})),offline=false;
let systemStatus={volume:42 as number|null,muted:false,brightness:65 as number|null,battery:76 as number|null,charging:false,plugged_in:false,language:'RU'};
let bluetoothEnabled=true;
let wifiConnected='demo-home';
let wifiEnabled=true;
function emit(event:string,payload:unknown){for(const x of listeners.values())if(x.event===event)callbacks.get(x.handler)?.({event,payload});}
(window as any).__TAURI_INTERNALS__={transformCallback:(fn:Function)=>{const id=nextId++;callbacks.set(id,fn);return id;},invoke:async(command:string,args:any)=>{
 if(command==='keyboard_layout_snapshot')return {target:new URLSearchParams(location.search).has('layout-no-target')?null:'demo-target',target_name:'Untitled — Notepad',layouts:[{id:'ru',label:'RU',name:'Русский',active:systemStatus.language==='RU'},{id:'en',label:'EN',name:'English (US)',active:systemStatus.language==='EN'}]};
 if(command==='keyboard_layout_select'){if(new URLSearchParams(location.search).has('layout-error'))throw 'Приложение не подтвердило смену раскладки. Перейдите в него и попробуйте снова.';systemStatus.language=args.id==='ru'?'RU':'EN';return;}
 if(command==='wifi_snapshot'){
   const q=new URLSearchParams(location.search);
   if(q.has('wifi-error'))throw 'Список сетей Wi-Fi недоступен';
   const blocked=q.has('wifi-denied'),available=!q.has('wifi-missing');
   return {available,enabled:available&&wifiEnabled,controllable:available,warning:blocked?'Windows ограничила доступ к сетям Wi-Fi. Проверьте разрешение на местоположение в параметрах Windows.':null,networks:!available||!wifiEnabled||blocked||q.has('wifi-empty')?[]:[{id:'demo-home',adapter:'Demo adapter',name:'Home network',signal:94,secure:true,saved:true,personal:true,connected:wifiEnabled&&wifiConnected==='demo-home',connectable:true},{id:'demo-office',adapter:'Demo adapter',name:'Studio network with a long display name',signal:70,secure:true,saved:true,personal:true,connected:wifiEnabled&&wifiConnected==='demo-office',connectable:true},{id:'demo-guest',adapter:'Demo adapter',name:'Guest Wi-Fi',signal:35,secure:true,saved:false,personal:true,connected:wifiEnabled&&wifiConnected==='demo-guest',connectable:true}]};
 }
 if(command==='wifi_set_enabled'){wifiEnabled=args.enabled;return;}
 if(command==='wifi_disconnect'){wifiConnected='';return;}
 if(command==='wifi_connect'){document.documentElement.dataset.wifiConnect=args.id;if(new URLSearchParams(location.search).has('wifi-connect-error'))throw 'Windows не может подключиться к этой сети';wifiConnected=args.id;return;}
 if(command==='plugin:event|listen'){const id=nextId++;listeners.set(id,args);return id;}
 if(command==='plugin:event|emit'||command==='plugin:event|emit_to'){emit(args.event,args.payload);return;}
 if(command==='notification_access_status')return new URLSearchParams(location.search).has('notifications-allowed')?'allowed':new URLSearchParams(location.search).has('notifications-denied')?'denied':'package_required';
 if(command==='bluetooth_snapshot'){
   const q=new URLSearchParams(location.search);
   if(q.has('bluetooth-error'))throw 'Не удалось прочитать состояние Bluetooth';
   const available=!q.has('bluetooth-missing');
   return {available,enabled:available&&bluetoothEnabled,controllable:available,warning:null,devices:q.has('bluetooth-empty')||!available?[]:[{id:'demo-headphones',name:'Studio Headphones',connected:bluetoothEnabled,low_energy:false},{id:'demo-mouse',name:'Arc Mouse',connected:false,low_energy:true},{id:'demo-speaker',name:'Living room speaker',connected:false,low_energy:false}]};
 }
 if(command==='bluetooth_set_enabled'){
   document.documentElement.dataset.bluetoothTarget=String(args.enabled);
   if(new URLSearchParams(location.search).has('bluetooth-denied'))throw 'Windows не разрешила менять Bluetooth. Откройте панель Windows.';
   bluetoothEnabled=args.enabled;return;
 }
 if(command==='system_controls_status')return {...systemStatus};
 if(command==='set_menu_open'){document.documentElement.dataset.menuHitRect=JSON.stringify(args);return;}
 if(command==='system_control_action'){
   document.documentElement.dataset.systemAction=args.action;
   if(new URLSearchParams(location.search).has('action-error'))throw 'Тест: Windows не открыла панель.';
   if(args.action==='layout')systemStatus.language=systemStatus.language==='RU'?'EN':'RU';
   if(args.action==='mute'){systemStatus.muted=!systemStatus.muted;emit('volume-change',{volume:(systemStatus.volume??0)/100,is_muted:systemStatus.muted});}
   return;
 }
 if(command==='set_volume'){systemStatus.volume=Math.round(args.volume*100);document.documentElement.dataset.systemVolume=String(args.volume);emit('volume-change',{volume:args.volume,is_muted:systemStatus.muted});return;}
 if(command==='set_brightness'){systemStatus.brightness=args.brightness;document.documentElement.dataset.systemBrightness=String(args.brightness);emit('brightness-change',{brightness:args.brightness});return;}
 if(command==='notification_request_access')return 'package_required';
 if(command==='notification_snapshot'){if(new URLSearchParams(location.search).has('notification-error'))throw 'Демонстрационная ошибка доступа Windows';return demoNotices;}
 if(command==='open_bloom_notifications'){emit('bloom-open-notifications',null);return;}
 if(command==='plugin:event|unlisten'){listeners.delete(args.eventId);return;}
 if(command==='load_pinned_apps'&&new URLSearchParams(location.search).has('stress'))return Array.from({length:30},(_,i)=>({name:`Приложение ${i+1}`,path:`stress-${i}`,icon:null,is_running:false,hwnd:0}));
 if((command==='load_pinned_apps'||command==='load_personal_pins')&&new URLSearchParams(location.search).has('pins-load-error'))throw 'Не удалось загрузить закрепления';
 if(command==='load_pinned_apps'||command==='load_personal_pins')return demoPins(command==='load_personal_pins');
 if(command==='windows_taskbar_pins')return demoApps.slice(0,4);
 if(command==='save_pinned_apps'||command==='save_personal_pins'){
   if(new URLSearchParams(location.search).has('save-error'))throw 'Не удалось сохранить закрепления';
   const personal=command==='save_personal_pins';localStorage.setItem('dinox-v4-demo-pins-'+personal,JSON.stringify(args.apps));emit('dock-pins-changed',personal?'personal':'classic');return;
 }
 if(command==='get_installed_apps')return demoApps;
 if(command==='open_app'||command==='focus_window'||command==='show_start_menu'){document.documentElement.dataset.demoLaunch=JSON.stringify(args||command);const name=demoApps.find(a=>a.hwnd===args?.hwnd||a.path===args?.appName)?.name||'Windows';window.dispatchEvent(new CustomEvent('bloom-demo-action',{detail:name}));return;}
 if(command==='open_notification_settings'||command==='open_dock_settings'||command==='open_settings_window'){window.dispatchEvent(new CustomEvent('bloom-demo-page',{detail:command==='open_notification_settings'?'notices':'dock'}));return;}
 if(command==='open_notification_center'){window.dispatchEvent(new CustomEvent('bloom-demo-action',{detail:'Windows'}));return;}


 if(command==='get_active_windows')return demoApps.slice(0,3);
 if(command==='get_custom_icons')return {};
 if(command==='get_app_icon')return demoApps.find(a=>a.path===args.path)?.icon??null;
 if(command==='plugin:window|is_visible')return true;
 if(command==='plugin:autostart|is_enabled')return false;
 if(command==='check_for_updates'){
  const query=new URLSearchParams(location.search);
  if(query.has('update-error'))throw 'Update server unavailable';
  const nextVersion=packageInfo.version.replace(/\d+$/,part=>String(Number(part)+1));
  return query.has('update-available')?{available:true,version:nextVersion,body:'Demo signed release'}:{available:false};
 }
 if(command==='install_update'){
  emit('auto-update-status',{status:'downloading',progress:35});
  await new Promise(resolve=>setTimeout(resolve,350));
  emit('auto-update-status',{status:'error'});
  throw 'Demo installation failure: no installer runs in the browser';
 }
 if(command==='update_dock_rect'){document.documentElement.dataset.dockHitRect=JSON.stringify(args.rect);return;}
 if(command==='shell_status')return {recovered:false,replacing:false};
 if(command==='load_settings')return settings;
 if(command==='plugin:app|version')return packageInfo.version;
 if(command==='get_update_state')return {available:false};
 if(command==='get_network_speed')return [0,0];
 if(command==='get_volume')return .5;
 if(command==='get_brightness')return 50;
 if(command.startsWith('get_'))return 0;
 if(command==='save_setting'){if(new URLSearchParams(location.search).has('save-error'))throw 'Не удалось сохранить настройку.';document.documentElement.dataset.savedSetting=JSON.stringify(args);settings[args.key]=args.value;localStorage.setItem('dinox-v4-demo-settings',JSON.stringify(settings));emit('settings-changed',args);settingsChannel.postMessage(args);return;}
 if(command==='calendar_list')return sources;
 if(command==='calendar_refresh'){if(offline)throw 'Нет подключения к интернету. Сохранённые события доступны.';return {...sources.find(s=>s.id===args.id)!,checked:Date.now()/1000};}
 if(command==='calendar_remove'){sources=sources.filter(s=>s.id!==args.id);emit('calendars-changed',null);return;}
 if(command==='calendar_save'){if(args.url&&!/^https:\/\//.test(args.url))throw 'Введите HTTPS-ссылку на календарь ICS';const old=sources.find(s=>s.id===args.id);const s={...(old||fixtures[0]),id:args.id||`test-${nextId++}`,name:args.name,color:args.color,enabled:args.enabled};sources=old?sources.map(x=>x.id===s.id?s:x):[...sources,s];emit('calendars-changed',null);return s;}
 if(command==='personal_power_state')return settings['bloom-personal-eco']==='on';
 if(command==='open_calendar_settings'){window.dispatchEvent(new CustomEvent('bloom-demo-page',{detail:'connections'}));document.getElementById('show-settings')?.click();return;}
 if(command==='calendar_open_link'){const output=document.getElementById('test-output');if(output)output.textContent=`Открыть: ${args.url}`;window.dispatchEvent(new CustomEvent('bloom-demo-action',{detail:args.url}));return;}
}};
(window as any).__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
function Preview(){
 useBloomAppearance();
 const [date,setDate]=useState(now),[pinned,setPinned]=useState(false),[page,setPage]=useState('calendar'),[light,setLight]=useState(false);
 const model=useCalendar(+date-45*86400000,+date+50*86400000,false),reminder=useReminders(model.events,10);
 return <div style={{minHeight:'100vh',background:light?'#d5d8df':'#24262f',color:light?'#1c2028':'#f4f5f7',fontFamily:'Inter,Segoe UI',padding:'0 12px 30px',boxSizing:'border-box','--bloom-text':light?'#20232b':'#f4f5f7','--bloom-text-secondary':light?'#686d77':'#a1a5ae','--bloom-bg-expanded':light?'#f5f6f9':'#141518'} as any}>
 <div style={{maxWidth:820,margin:'0 auto',height:650,display:page==='calendar'?'flex':'none',flexDirection:'column',background:light?'#f5f6f9':'#000000',borderRadius:'0 0 28px 28px',boxShadow:'0 24px 90px #0004'}}><div style={{height:36,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12}}>◌ &nbsp; {new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})} &nbsp; ◌</div><CalendarPanel model={model} date={date} onDate={setDate} pinned={pinned} onPinned={()=>setPinned(!pinned)}/></div>
 {page==='settings'&&<div style={{maxWidth:560,margin:'20px auto',padding:20,borderRadius:18,background:light?'#f5f6f9':'#1b1d23'}}><CalendarSettings/><PersonalSettings/></div>}
 <div style={{maxWidth:820,margin:'20px auto',display:'flex',gap:8,flexWrap:'wrap',fontSize:11}}><button onClick={()=>setPage('calendar')}>Показать календарь</button><button id="show-settings" onClick={()=>setPage('settings')}>Показать настройки</button><button onClick={()=>setLight(!light)}>Светлая / тёмная</button><button onClick={()=>{sources=[];emit('calendars-changed',null);}}>Пустой календарь</button><button onClick={()=>{sources=fixtures.map(s=>({...s}));emit('calendars-changed',null);}}>Демо-события</button><button onClick={()=>{offline=!offline;void model.refresh();}}>Ошибка сети</button><button onClick={()=>{const a=new Date(Date.now()+60000).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');const b=new Date(Date.now()+3600000).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');sources=[{...fixtures[0],ics:wrap(`BEGIN:VEVENT\r\nUID:reminder-demo\r\nDTSTART:${a}\r\nDTEND:${b}\r\nSUMMARY:Проверка напоминания\r\nEND:VEVENT`)}];emit('calendars-changed',null);}}>Тест напоминания</button></div>
 <div style={{maxWidth:360,margin:'20px auto',padding:10,borderRadius:18,background:light?'#f5f6f9':'#000000'}}><UpcomingEvent events={model.events} onOpen={()=>setPage('calendar')}/><ReminderCard reminder={reminder}/></div><p id="test-output" style={{textAlign:'center',fontSize:11}}>Стенд с демонстрационными данными · не подключён к Google</p></div>;
}
function DesignPreview(){
 useBloomAppearance();
 const [page,setPage]=useState('dock');const notices=useNotifications();
 return <div style={{minHeight:'100vh',padding:'24px 24px 150px',background:'radial-gradient(ellipse at 70% 0,#414453,#222630 75%)',color:'#f3f4f7',boxSizing:'border-box',fontFamily:'Segoe UI', '--bloom-bg-expanded':'#191c24','--bloom-text':'#f3f4f7','--bloom-text-secondary':'#a5aabb'} as any}>
 <header style={{maxWidth:480,margin:'0 auto 20px',display:'flex',gap:10,alignItems:'center'}}><strong>Bloom Personal</strong><span style={{fontSize:11,opacity:.5}}>Визуальный стенд · демоданные</span></header>
 <nav style={{maxWidth:480,margin:'0 auto 16px',display:'flex',gap:10}}><button onClick={()=>setPage('dock')}>Дизайн дока</button><button onClick={()=>setPage('notifications')}>Уведомления</button></nav>
 <main style={{maxWidth:480,margin:'auto',padding:20,borderRadius:22,background:'#000000',boxShadow:'0 20px 60px #0004'}}>{page==='dock'?<><SystemSettings/><DockDesignSettings/></>:<NotificationSettings/>}</main>
 {notices.visible&&<aside style={{position:'fixed',right:16,top:16,width:400,height:460,background:'#000000',borderRadius:22,zIndex:900,display:'flex',flexDirection:'column'}}><NotificationPanel model={notices}/></aside>}<div className="fixture-dock"><Dock/></div><style>{`.fixture-dock{position:fixed;inset:0;pointer-events:none}.fixture-dock .dock-container{pointer-events:none}.fixture-dock .dock{pointer-events:auto}`}</style></div>
}
if(new URLSearchParams(location.search).has('no-hardware'))systemStatus={...systemStatus,volume:null,brightness:null,battery:null,plugged_in:true};
if(new URLSearchParams(location.search).has('workspace')){
 (window as any).__TAURI_INTERNALS__.metadata={currentWindow:{label:'main'},currentWebview:{label:'main'}};previewRoot().render(<WorkspaceDemo send={demoSend}/>);
} else if(new URLSearchParams(location.search).has('design')) {
 (window as any).__TAURI_INTERNALS__.metadata={currentWindow:{label:'main'},currentWebview:{label:'main'}};
 previewRoot().render(<DesignPreview/>);
} else if(new URLSearchParams(location.search).has('settings')) {
 (window as any).__TAURI_INTERNALS__.metadata={currentWindow:{label:'settings'},currentWebview:{label:'settings'}};
 import('../src/Settings').then(()=>{});
} else if(new URLSearchParams(location.search).has('dock')) {
 (window as any).__TAURI_INTERNALS__.metadata={currentWindow:{label:'dock'},currentWebview:{label:'dock'}};
 import('../src/Dock').then(({default:Dock})=>previewRoot().render(<><button style={{position:'fixed',top:30,left:30,zIndex:1000}} onClick={()=>emit('dock-attention',5001)}>Тест внимания</button><Dock/></>));
} else if(new URLSearchParams(location.search).has('app')) {
 (window as any).__TAURI_INTERNALS__.metadata={currentWindow:{label:'main'},currentWebview:{label:'main'}};
 import('../src/App').then(({default:App})=>previewRoot().render(<><button style={{position:'fixed',left:20,top:100,zIndex:1000}} onClick={()=>{settings['bloom-notifications']=JSON.stringify({enabled:true});emit('settings-changed',{key:'bloom-notifications',value:settings['bloom-notifications']});setTimeout(()=>emit('bloom-preview-notification',{...sampleNotice,created:Date.now()}),100);}}>Демо-карточка</button><App/></>));
 document.body.style.background='#292c34';
} else previewRoot().render(<Preview/>);
document.body.style.cssText='overflow:auto;margin:0';
document.documentElement.style.overflow='auto';
document.getElementById('root')!.style.cssText='display:block;width:100%;height:auto;min-height:100vh';

if(new URLSearchParams(location.search).has('app'))document.body.style.background='#292c34';

if(new URLSearchParams(location.search).has("settings")){document.body.style.cssText="overflow:hidden;margin:0;background:#222";document.documentElement.style.overflow="hidden";document.getElementById("root")!.style.cssText="display:flex;width:100vw;height:100vh";}

if(new URLSearchParams(location.search).has('dock'))document.body.style.background='#292c34';

(window as any).previewMedia=(playing=true,title='Test track')=>emit('media-update',{title,artist:'Demo artist',is_playing:playing,has_media:true,position_ms:30000,duration_ms:180000,album_art:null});

(window as any).previewEmit=emit;
(window as any).previewSettings=settings;

(window as any).previewSend=demoSend;
(window as any).previewNotices=()=>demoNotices;
