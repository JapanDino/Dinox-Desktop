import {useEffect,useState,type CSSProperties} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {tx} from '../desktopText';
import {eventTitle,layoutWeekBanners,weekStart,type CalendarEvent} from './model';
import {eventTime} from './eventLabels';

export function WeekBanners({events,date,onSelect}:{events:CalendarEvent[];date:Date;onSelect:(event:CalendarEvent)=>void}) {
    const [expanded,setExpanded] = useState(false);
    const week = +weekStart(date);
    useEffect(() => setExpanded(false), [week]);
    const banners = layoutWeekBanners(events,date);
    const hidden = banners.filter(item => item.lane >= 3).length;
    const visible = banners.filter(item => expanded || item.lane < 3);
    const rows = Math.max(1,...visible.map(item => item.lane + 1));
    return <div className="cal-span-section" role="region" aria-label={tx('События на весь день и несколько дней','All-day and multi-day events')}>
      <div className="cal-span-grid" style={{gridTemplateRows:`repeat(${rows}, minmax(30px, auto))`}}>
        <span className="cal-span-label" style={{gridRow:`1 / span ${rows}`}}>{tx('Весь день и дольше','All day & longer')}</span>
        {visible.map(({event,first,span,lane,continuesBefore,continuesAfter}) => <button
          key={event.id} className={`cal-span-event${continuesBefore?' continues-before':''}${continuesAfter?' continues-after':''}`}
          style={{gridColumn:`${first+2} / span ${span}`,gridRow:lane+1,'--event-color':event.color} as CSSProperties}
          onClick={() => onSelect(event)} title={`${eventTitle(event)} · ${eventTime(event)}`}
          aria-label={`${eventTitle(event)} · ${eventTime(event)}`}>
          {continuesBefore && <ChevronLeft size={12} aria-hidden="true"/>}
          <span>{eventTitle(event)}</span>
          {continuesAfter && <ChevronRight size={12} aria-hidden="true"/>}
        </button>)}
      </div>
      {!!hidden && <button className="cal-span-toggle" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
        {expanded ? tx('Свернуть','Show fewer') : tx(`Ещё событий: ${hidden}`,`Show ${hidden} more events`)}
      </button>}
    </div>;
}
