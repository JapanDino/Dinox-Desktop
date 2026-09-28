import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type MutableRefObject} from 'react';
import {addDays,weekStart,sameDay,layoutDay,eventTitle,type CalendarEvent} from './model';
import {WeekBanners} from './WeekBanners';
import {eventTime} from './eventLabels';
import {containsNow,timeOffset,openingScroll} from './timeline';
import {locale,tr} from '../i18n/core';
import {tx} from '../desktopText';
import './calendar.css';

export type TimelinePosition={key:string;top:number;left:number};
export function WeekTimeline({events,date,hourHeight=52,onSelect,onDay,reset=0,position}: {
  events:CalendarEvent[];date:Date;hourHeight?:number;onSelect:(event:CalendarEvent)=>void;
  onDay:(date:Date)=>void;reset?:number;position?:MutableRefObject<TimelinePosition|null>;
}) {
  const [now,setNow]=useState(Date.now);
  const frame=useRef<HTMLDivElement>(null),scroller=useRef<HTMLDivElement>(null),ownPosition=useRef<TimelinePosition|null>(null);
  const saved=position??ownPosition;
  const week=weekStart(date),key=`${+week}/${hourHeight}/${reset}`;
  const days=Array.from({length:7},(_,i)=>addDays(week,i));
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>;
    const tick=()=>{clearTimeout(timer);setNow(Date.now());timer=setTimeout(tick,60000-Date.now()%60000+20);};
    tick();window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);
    return()=>{clearTimeout(timer);window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',tick);};
  },[]);
  useLayoutEffect(()=>{
    const area=scroller.current,outer=frame.current;if(!area||!outer)return;
    const place=()=>{
      if(!area.clientHeight||!outer.clientWidth)return;
      const previous=saved.current?.key===key?saved.current:null;
      area.scrollTop=previous?.top??openingScroll(date,Date.now(),hourHeight,area.clientHeight);
      if(previous)outer.scrollLeft=previous.left;
      else if(containsNow(date,Date.now())){
        const column=outer.querySelector<HTMLElement>('.cal-day-column.today');
        if(column)outer.scrollLeft=Math.max(0,column.offsetLeft-(outer.clientWidth-column.offsetWidth)/2);
      }
      saved.current={key,top:area.scrollTop,left:outer.scrollLeft};
    };
    place();const raf=requestAnimationFrame(place),observer=new ResizeObserver(place);observer.observe(area);
    return()=>{cancelAnimationFrame(raf);observer.disconnect();};
  },[key,saved]);
  const remember=()=>{if(scroller.current&&frame.current)saved.current={key,top:scroller.current.scrollTop,left:frame.current.scrollLeft};};
  const current=containsNow(date,now),offset=timeOffset(now,hourHeight);
  const clock=new Date(now).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit',hour12:false});
  return <div className="cal-week-frame" ref={frame} tabIndex={0} role="region" aria-label={tr('Неделя: горизонтальная прокрутка')} onScroll={remember}>
    <div className="cal-week-head"><span/>{days.map(day=><button key={+day} className={sameDay(day,now)?'today':''} onClick={()=>onDay(day)}><span>{day.toLocaleDateString(locale(),{weekday:'short'})}</span><strong>{day.getDate()}</strong></button>)}</div>
    <WeekBanners events={events} date={date} onSelect={onSelect}/>
    <div className="cal-week-scroll" ref={scroller} onScroll={remember}><div className="cal-week-body" style={{height:24*hourHeight}}>
      <div className="cal-hours">{Array.from({length:24},(_,hour)=><span key={hour} style={{top:hour*hourHeight}}>{String(hour).padStart(2,'0')}:00</span>)}</div>
      {days.map(day=><div className={`cal-day-column ${sameDay(day,now)?'today':''}`} key={+day} style={{backgroundSize:`100% ${hourHeight}px`}}>
        {layoutDay(events,day).map(({event,column,columns,top,height})=><button className="cal-time-event" key={event.id} onClick={()=>onSelect(event)} style={{top:top*hourHeight/60,height:Math.max(22,height*hourHeight/60),left:`calc(${column/columns*100}% + 2px)`,width:`calc(${100/columns}% - 4px)`,'--event-color':event.color} as CSSProperties} title={`${eventTitle(event)} · ${eventTime(event)}`}><strong>{eventTitle(event)}</strong><span>{eventTime(event)}</span></button>)}
        {sameDay(day,now)&&<div className="cal-now" style={{top:offset}}/>}
      </div>)}
      {current&&<div className="cal-now-track" style={{top:offset}} aria-label={tx(`Сейчас ${clock}`,`Current time ${clock}`)}><span>{clock}</span></div>}
    </div></div>
  </div>;
}
