import {Children,isValidElement,useEffect, useRef, useState, type CSSProperties,type ReactNode,type ReactElement} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {CalendarDays, ChevronLeft, ChevronRight, X, SlidersHorizontal, RefreshCw, Play, Pause, RotateCcw, Clock3, MapPin} from 'lucide-react';
import {useBloomAppearance} from '../appearance/BloomAppearance';
import {usePersonalSetting} from '../components/PersonalFeatures';
import {useCalendar} from '../calendar/useCalendar';
import {addDays, dayStart, weekStart, sameDay, onDay, eventTitle, type CalendarEvent} from '../calendar/model';
import {eventTime} from '../calendar/eventLabels';
import {WeekTimeline} from '../calendar/WeekTimeline';
import {locale} from '../i18n/core';
import {tx} from '../desktopText';
import {shortcutLabel} from '../launcher/shortcut';
import {WidgetSettings} from './WidgetSettings';
import {TasksWidget,NoteWidget,ProjectsWidget,MusicWidget} from './PersonalWidgets';
import {readWidgetLayout} from './personalModel';
import {newFocus, readFocus, secondsLeft, toggleFocus, shiftMonth, type FocusState} from './model';
import './widgets.css';

function WidgetGrid({children,order,style,week}:{children:ReactNode;order:string[];style:CSSProperties;week:boolean}){
  const cards:ReactElement[]=[];
  Children.forEach(children,child=>{if(isValidElement(child))cards.push(child);});
  cards.sort((a,b)=>order.indexOf(String(a.key))-order.indexOf(String(b.key)));
  // Keep the DOM and tab order consistent with the visible arrangement.
  return <div style={style} className={'wb-grid wb-personal-grid'+(week?' wb-week-expanded':'')}>{cards}</div>;
}

function FocusWidget() {
  const [state,setState] = useState(()=>{try{return readFocus(localStorage.getItem('dinox-widget-focus-state'));}catch{return newFocus();}});
  const [now,setNow] = useState(Date.now()), [error,setError] = useState(false);
  const remaining = secondsLeft(state,now), running = state.deadline !== null && remaining > 0;
  useEffect(()=>{if(!running)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[running]);
  const change=(next:FocusState)=>{setState(next);setNow(Date.now());try{localStorage.setItem('dinox-widget-focus-state',JSON.stringify(next));setError(false);}catch{setError(true);}};
  return <article className="wb-card wb-focus"><header><h2><Clock3 size={17}/>{tx('Фокус','Focus')}</h2><span>{remaining===0?tx('Готово','Complete'):running?tx('Идёт сессия','In progress'):tx('В своём темпе','At your pace')}</span></header>
    <input className="wb-task" aria-label={tx('Задача для фокуса','Focus task')} placeholder={tx('На чём сосредоточимся?','What will you focus on?')} maxLength={160} value={state.task} onChange={e=>change({...state,task:e.target.value})}/>
    <div className="wb-countdown" role="timer" aria-label={tx('Осталось времени','Time remaining')}>{String(Math.floor(remaining/60)).padStart(2,'0')}<span>:</span>{String(remaining%60).padStart(2,'0')}</div>
    <div className="wb-progress" role="progressbar" aria-label={tx('Прогресс фокуса','Focus progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((1-remaining/state.duration)*100)}><i style={{width:`${(1-remaining/state.duration)*100}%`}}/></div>
    <div className="wb-presets">{[15,25,50].map(minutes=><button key={minutes} disabled={running} aria-pressed={state.duration===minutes*60} onClick={()=>change({...newFocus(minutes),task:state.task})}>{minutes} {tx('мин','min')}</button>)}</div>
    <div className="wb-focus-actions"><button className="wb-primary" onClick={()=>change(toggleFocus(state,Date.now()))}>{running?<Pause size={15}/>:<Play size={15}/>} {running?tx('Пауза','Pause'):remaining===0?tx('Ещё раз','Start again'):remaining<state.duration?tx('Продолжить','Resume'):tx('Начать','Start')}</button><button aria-label={tx('Сбросить таймер','Reset timer')} onClick={()=>change({...newFocus(state.duration/60),task:state.task})}><RotateCcw size={16}/></button></div>
    <p className="wb-hint">{tx('Отсчёт сохраняется, когда панель скрыта. Без звукового сигнала.','Countdown is preserved while hidden. No sound alert.')}</p>
    {error&&<p role="alert">{tx('Не удалось сохранить таймер. Не закрывайте приложение.','Could not save the timer. Keep the app open.')}</p>}
  </article>;
}

export function WidgetBoard({onClose}: {onClose:()=>void}) {
  useBloomAppearance();
  const [now,setNow] = useState(Date.now()), [date,setDate] = useState(()=>new Date()), [view,setView] = useState<'month'|'week'>('month');
  const [scrollReset,setScrollReset]=useState(0);
  const [settings,setSettings] = useState(false), [selected,setSelected] = useState<CalendarEvent|null>(null),[actionError,setActionError]=useState('');
  const [todayOn] = usePersonalSetting('dinox-widget-today','true'), [calendarOn] = usePersonalSetting('dinox-widget-calendar','true'), [focusOn] = usePersonalSetting('dinox-widget-focus','true');
  const [tasksOn]=usePersonalSetting('dinox-widget-tasks','true'),[noteOn]=usePersonalSetting('dinox-widget-note','true'),[projectsOn]=usePersonalSetting('dinox-widget-projects','true'),[musicOn]=usePersonalSetting('dinox-widget-music','true');
  const [shortcut] = usePersonalSetting('dinox-widgets-shortcut','custom:3:87');
  const [backdrop] = usePersonalSetting('dinox-widgets-backdrop','70');
  const [layoutRaw]=usePersonalSetting('dinox-widgets-layout','{}');
  const layout=readWidgetLayout(layoutRaw);
  const layoutStyle=Object.fromEntries(layout.order.flatMap((id,index)=>[[`--wb-order-${id}`,index],[`--wb-span-${id}`,layout.wide.includes(id)?2:1]])) as CSSProperties;
  const backdropOpacity = ['45','70','90','100'].includes(backdrop) ? Number(backdrop)/100 : .7;
  const detail=useRef<HTMLElement>(null), detailTrigger=useRef<HTMLElement|null>(null);
  const grid = useRef<HTMLDivElement>(null), wheelAt=useRef(0), wheelSum=useRef(0), closeButton=useRef<HTMLButtonElement>(null);
  const first = weekStart(new Date(date.getFullYear(),date.getMonth(),1));
  const from=Math.min(+first,+dayStart(now)), to=Math.max(+addDays(first,42),+addDays(dayStart(now),7));
  // The island owns periodic feed refresh. This view reads the shared cache and
  // listens for updates, without creating another polling loop for each widget.
  const model=useCalendar(from,to,false,true);
  useEffect(()=>{closeButton.current?.focus();const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{
    const element=grid.current;if(!element)return;
    const wheel=(event:WheelEvent)=>{if(event.ctrlKey||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;event.preventDefault();wheelSum.current+=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?400:1);if(Math.abs(wheelSum.current)<50||Date.now()-wheelAt.current<250)return;const direction=Math.sign(wheelSum.current);wheelSum.current=0;wheelAt.current=Date.now();setDate(old=>view==='month'?shiftMonth(old,direction):addDays(old,direction*7));};
    element.addEventListener('wheel',wheel,{passive:false});return()=>element.removeEventListener('wheel',wheel);
  },[view,calendarOn,settings]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(selected)setSelected(null);else if(settings)setSettings(false);else onClose();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[selected,settings,onClose]);
  useEffect(()=>{if(!selected)return;const previous=detailTrigger.current;const button=detail.current?.querySelector<HTMLButtonElement>('button');button?.focus();const trap=(e:KeyboardEvent)=>{if(e.key==='Tab'){e.preventDefault();button?.focus();}};window.addEventListener('keydown',trap);return()=>{window.removeEventListener('keydown',trap);previous?.focus();};},[selected]);
  const events=model.events.filter(e=>onDay(e,date)),today=model.events.filter(e=>onDay(e,new Date(now)));
  const days=Array.from({length:view==='month'?42:7},(_,i)=>addDays(view==='month'?first:weekStart(date),i));
  const openSettings=()=>{setActionError('');void invoke('open_calendar_settings').then(onClose).catch(()=>setActionError(tx('Не удалось открыть настройки календаря','Could not open calendar settings')));};
  const row=(event:CalendarEvent)=><button className="wb-event" key={event.id} onClick={e=>{detailTrigger.current=e.currentTarget;setSelected(event);}}><i style={{background:event.color}}/><span><strong>{eventTitle(event)}</strong><small>{eventTime(event)}</small></span></button>;
  const empty=()=> <div className="wb-empty"><CalendarDays size={23}/><p>{model.sources.some(s=>s.enabled)?tx('На этот день планов нет','Nothing scheduled for this day'):tx('Подключите календарь, чтобы видеть свои события','Connect a calendar to see your events')}</p>{!model.sources.some(s=>s.enabled)&&<button onClick={openSettings}>{tx('Подключить календарь','Connect calendar')}</button>}</div>;
  return <main className="widget-board" style={{'--wb-backdrop-opacity':backdropOpacity} as CSSProperties} aria-label={tx('Виджеты Dinox','Dinox widgets')}>
    <header className="wb-top"><div><span className="wb-brand">dinox</span><h1>{tx('Мой день','My day')}</h1><p>{new Date(now).toLocaleDateString(locale(),{weekday:'long',day:'numeric',month:'long'})}</p></div><div className="wb-tools">
      <span className="wb-key">{shortcutLabel(shortcut)||'Esc'}</span><button aria-label={tx('Настроить виджеты','Customize widgets')} aria-pressed={settings} onClick={()=>setSettings(v=>!v)}><SlidersHorizontal size={18}/></button><button ref={closeButton} aria-label={tx('Закрыть виджеты','Close widgets')} onClick={onClose}><X size={20}/></button>
    </div></header>
    <div className="wb-scroll">
      {settings?<div className="wb-preferences"><button className="wb-back" onClick={()=>setSettings(false)}><ChevronLeft size={16}/>{tx('К виджетам','Back to widgets')}</button><WidgetSettings/></div>:<>
      <WidgetGrid order={layout.order} style={layoutStyle} week={view==='week'}>
        {tasksOn!=='false'&&<TasksWidget key="tasks" calendarTasks={model.tasks} calendarSources={model.sources} refreshCalendar={()=>void model.load()}/>}
        {noteOn!=='false'&&<NoteWidget key="note"/>}
        {projectsOn!=='false'&&<ProjectsWidget key="projects"/>}
        {musicOn!=='false'&&<MusicWidget key="music"/>}
        {todayOn!=='false'&&<article key="today" className="wb-card wb-today"><header><h2><CalendarDays size={17}/>{tx('Сегодня','Today')}</h2><span>{today.length}</span></header><div className="wb-today-events">{today.length?today.map(row):empty()}</div></article>}
        {calendarOn!=='false'&&<article key="calendar" className="wb-card wb-calendar"><header><h2>{date.toLocaleDateString(locale(),{month:'long',year:'numeric'})}</h2><div className="wb-nav"><button aria-label={tx('Предыдущий период','Previous period')} onClick={()=>setDate(view==='month'?shiftMonth(date,-1):addDays(date,-7))}><ChevronLeft size={18}/></button><button onClick={()=>{setDate(new Date());setScrollReset(n=>n+1);}}>{tx('Сегодня','Today')}</button><button aria-label={tx('Следующий период','Next period')} onClick={()=>setDate(view==='month'?shiftMonth(date,1):addDays(date,7))}><ChevronRight size={18}/></button></div></header>
          <div className="wb-calendar-controls"><div className="wb-segments">{(['month','week'] as const).map(v=><button key={v} aria-pressed={view===v} onClick={()=>setView(v)}>{v==='month'?tx('Месяц','Month'):tx('Неделя','Week')}</button>)}</div><span>{view==='month'?tx('Колесо — смена месяца','Scroll to change month'):tx('Линия отмечает текущее время','The line marks the current time')}</span></div>
          {view==='week'?<div className="wb-timeline">{!model.sources.some(s=>s.enabled)?empty():<WeekTimeline events={model.events} date={date} reset={scrollReset} onSelect={event=>{detailTrigger.current=document.activeElement as HTMLElement;setSelected(event);}} onDay={day=>{setDate(day);setView('month');}}/>}</div>:<>
          <div className="wb-month" ref={grid} aria-label={tx('Дни календаря','Calendar days')}>{Array.from({length:7},(_,i)=><span key={i}>{addDays(weekStart(date),i).toLocaleDateString(locale(),{weekday:'short'})}</span>)}{days.map(day=><button key={+day} className={`${sameDay(day,now)?'today ':''}${sameDay(day,date)?'selected ':''}${day.getMonth()!==date.getMonth()?'outside':''}`} aria-label={day.toLocaleDateString(locale(),{day:'numeric',month:'long',year:'numeric'})} aria-pressed={sameDay(day,date)} onClick={()=>setDate(day)}><span>{day.getDate()}</span><div>{[...new Set(model.events.filter(e=>onDay(e,day)).map(e=>e.color))].slice(0,3).map(color=><i key={color} style={{background:color}}/>)}</div></button>)}</div>
          <div className="wb-day"><h3>{date.toLocaleDateString(locale(),{weekday:'long',day:'numeric',month:'long'})}</h3>{events.length?events.map(row):empty()}</div>
          </>}
        </article>}
        {focusOn!=='false'&&<FocusWidget key="focus"/>}
      </WidgetGrid>
      {[todayOn,calendarOn,focusOn,tasksOn,noteOn,projectsOn,musicOn].every(v=>v==='false')&&<div className="wb-empty"><p>{tx('Выберите виджеты для своей панели','Choose widgets for your board')}</p><button onClick={()=>setSettings(true)}>{tx('Добавить виджеты','Add widgets')}</button></div>}
      </>}
      {actionError&&<p role="alert" className="wb-error">{actionError}</p>}
    </div>
    <footer className="wb-footer"><span>{Object.keys(model.errors).length?tx('Не удалось обновить календарь. Показаны сохранённые данные.','Calendar could not update. Showing cached data.'):model.sources.some(s=>s.enabled)?tx('Календари подключены к Dinox','Using your Dinox calendars'):tx('Google · Яндекс · подписки ICS','Google · Yandex · ICS subscriptions')}<small>{tx('Esc — закрыть · настройки и таймер сохраняются','Esc to close · settings and timer are saved')}</small></span><button aria-label={tx('Обновить календарь','Refresh calendar')} disabled={model.busy||!model.sources.some(s=>s.enabled)} onClick={()=>void model.refresh()}><RefreshCw size={17}/></button></footer>
    {selected&&<div className="wb-detail-backdrop" onClick={()=>setSelected(null)}><article ref={detail} role="dialog" aria-modal="true" aria-label={eventTitle(selected)} className="wb-detail" onClick={e=>e.stopPropagation()}><button autoFocus className="wb-detail-close" aria-label={tx('Закрыть событие','Close event')} onClick={()=>setSelected(null)}><X size={18}/></button><small style={{color:selected.color}}>{selected.sourceName}</small><h2>{eventTitle(selected)}</h2><p>{eventTime(selected)}</p>{selected.location&&<p><MapPin size={14}/>{selected.location}</p>}{selected.description&&<div>{selected.description}</div>}</article></div>}
  </main>;
}
