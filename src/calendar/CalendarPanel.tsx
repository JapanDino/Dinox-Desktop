import {tr,trError,locale} from '../i18n/core';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CalendarDays, ChevronLeft, ChevronRight, Pin, PinOff, RefreshCw, Settings2, X, Video, ExternalLink, Clock3, MapPin, WifiOff } from 'lucide-react';
import { usePersonalSetting } from '../components/PersonalFeatures';
import { addDays, dayStart, weekStart, onDay, sameDay, layoutDay, isBannerEvent, eventTitle, type CalendarEvent } from './model';
import type { useCalendar, useReminders } from './useCalendar';
import './calendar.css';
import {searchEvents} from './subscriptions';
import { wheelStep } from '../personalLogic';
import {WeekBanners} from './WeekBanners';
import {eventTime} from './eventLabels';
export {eventTime} from './eventLabels';
type Model = ReturnType<typeof useCalendar>;
const time = (n: number) => new Date(n).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
export function openCalendarSettings() { void invoke('open_calendar_settings'); }
function openLink(url: string) { return invoke('calendar_open_link', { url }); }
export function CalendarPanel({ model, date, onDate, pinned, onPinned, timer, eco = false }: {
    model: Model;
    date: Date;
    onDate: (d: Date) => void;
    pinned: boolean;
    onPinned: () => void;
    timer?: ReactNode;
    eco?: boolean;
}) {
    const [savedView, saveView] = usePersonalSetting('bloom-calendar-view', 'week');
    const view = ['month', 'week', 'agenda'].includes(savedView) ? savedView : 'week';
    const [density] = usePersonalSetting('bloom-calendar-density', 'comfortable'), [accent] = usePersonalSetting('bloom-calendar-accent', '#b7a6ff');
    const [selected, setSelected] = useState<CalendarEvent | null>(null), [error, setError] = useState(''), [now, setNow] = useState(Date.now());
    const [query, setQuery] = useState('');
    const matches = searchEvents(model.events, query);
    const scroller = useRef<HTMLDivElement>(null);
    const scrollPosition = useRef<{key: string; top: number} | null>(null);
    const monthWheel = useRef({ total: 0, last: 0, previous: 0 });
    const monthGrid = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const grid = monthGrid.current;
        if (view !== 'month' || !grid || query.trim()) return;
        // React wheel listeners are passive: a native listener must cancel scrolling
        // so changing the month never also moves the surrounding panel.
        const onWheel = (event: WheelEvent) => {
            if (event.ctrlKey || !event.deltaY) return;
            event.preventDefault();
            event.stopPropagation();
            const result = wheelStep(monthWheel.current, event.deltaY, event.deltaMode, performance.now());
            monthWheel.current = result.state;
            if (result.step) onDate(new Date(date.getFullYear(), date.getMonth() + result.step, 1));
        };
        grid.addEventListener('wheel', onWheel, {passive: false});
        return () => grid.removeEventListener('wheel', onWheel);
    }, [view, !!query.trim(), +date, onDate]);
    useEffect(() => { monthWheel.current = {total: 0, last: 0, previous: 0}; }, [view]);
    const hourHeight = density === 'compact' ? 40 : 52;
    const scrollKey = `${+date}/${hourHeight}`;
    useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
    useEffect(() => { if (view === 'week' && scroller.current)
        scroller.current.scrollTop = scrollPosition.current?.key === scrollKey
            ? scrollPosition.current.top
            : (sameDay(date, now) ? Math.max(0, new Date().getHours() - 1) : 8) * hourHeight;
    }, [view, +date, hourHeight, !!query.trim(), model.sources.length]);
    useEffect(() => { if (selected) {
        const latest = model.events.find(e => e.id === selected.id);
        setSelected(latest || null);
    } }, [model.events]);
    const week = weekStart(date), days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
    const navigate = (direction: number) => onDate(view === 'month' ? new Date(date.getFullYear(), date.getMonth() + direction, 1) : addDays(date, direction * 7));
    const periodStart = view === 'agenda' ? date : week;
    const title = view === 'month' ? date.toLocaleDateString(locale(), { month: 'long', year: 'numeric' }) : new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', year: 'numeric' }).formatRange(periodStart, addDays(periodStart, 6));
    const knownErrors = Object.values(model.errors), last = model.sources.filter(s => s.enabled).map(s => s.checked).filter(Boolean);
    const style = { '--cal-accent': /^#[0-9a-f]{6}$/i.test(accent) ? accent : '#b7a6ff' } as CSSProperties;
    const row = (event: CalendarEvent) => <button className="cal-agenda-event" key={event.id} onClick={() => setSelected(event)}><span className="cal-event-stripe" style={{ background: event.color }}/><span className="cal-event-time">{eventTime(event)}</span><span className="cal-event-title">{eventTitle(event)}<small>{event.sourceName}{event.location ? ` · ${event.location}` : ''}</small></span>{event.meeting && <Video size={14}/>}</button>;
    return <section className={`bloom-calendar ${density}`} style={style} onWheel={e => e.stopPropagation()} onClick={e => e.stopPropagation()} aria-label={tr("Расписание")}>
    <header className="cal-toolbar"><div className="cal-period"><span className="cal-eyebrow">{tr("Расписание")}</span><strong>{title}</strong></div><div className="cal-navigation"><button className="cal-text-button" onClick={() => onDate(dayStart(new Date()))}>{tr("Сегодня")}</button><button className="cal-icon-button" aria-label={tr("Предыдущий период")} onClick={() => navigate(-1)}><ChevronLeft size={16}/></button><button className="cal-icon-button" aria-label={tr("Следующий период")} onClick={() => navigate(1)}><ChevronRight size={16}/></button></div><div className="cal-view-tabs" role="tablist" aria-label={tr("Вид календаря")}>{[['month', tr("Месяц")], ['week', tr("Неделя")], ['agenda', tr("Список")]].map(([id, label]) => <button key={id} role="tab" aria-selected={view === id} onClick={() => saveView(id).catch(e => setError(String(e)))}>{tr(label)}</button>)}</div><button className={`cal-icon-button ${pinned ? 'selected' : ''}`} aria-label={pinned ? tr("Открепить календарь") : tr("Закрепить календарь")} aria-pressed={pinned} onClick={onPinned}>{pinned ? <PinOff size={15}/> : <Pin size={15}/>}</button></header>
    <div className="cal-filters">{model.sources.map(s => <button key={s.id} aria-pressed={s.enabled} className={!s.enabled ? 'muted' : ''} onClick={() => invoke('calendar_save', { id: s.id, name: s.name, color: s.color, enabled: !s.enabled, url: null }).catch(e => setError(String(e)))}><span className="cal-dot" style={{ background: s.color }}/>{s.name}</button>)}{!model.sources.length && <span>{tr("Подключи календарь, чтобы видеть события")}</span>}</div>
    <div className="cal-search"><input type="search" aria-label={tr('Поиск по загруженным событиям')} placeholder={tr('Найти событие, место или календарь')} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setQuery(''); }}/>{query && <button className="cal-icon-button" aria-label={tr('Очистить поиск')} onClick={() => setQuery('')}><X size={14}/></button>}</div>
    {(error || knownErrors.length > 0) && <div role="alert" className="cal-error cal-inline-error"><WifiOff size={14}/><span>{trError(error || knownErrors[0])}</span><button aria-label={tr("Закрыть сообщение")} className="cal-icon-button" onClick={() => setError('')} disabled={!error}><X size={13}/></button></div>}
    {query.trim() ? <div className="cal-agenda-list" aria-live="polite"><p className="cal-empty-day">{tr('Поиск только по загруженному периоду: {0} — {1}', new Date(model.range.from).toLocaleDateString(locale()), new Date(model.range.to).toLocaleDateString(locale()))}</p>{matches.slice(0, 100).map(e => <div key={e.id}><h4>{new Date(e.start).toLocaleDateString(locale(), {day:'numeric', month:'long'})}</h4>{row(e)}</div>)}{!matches.length && <p className="cal-empty-day">{tr('Ничего не найдено. Попробуйте другое слово или включите нужный календарь.')}</p>}{matches.length > 100 && <p className="cal-empty-day">{tr('Показаны первые 100 событий. Уточните запрос.')}</p>}</div> : !model.sources.length && view !== 'month' ? <div className="cal-empty"><CalendarDays size={38} strokeWidth={1.2}/><h3>{tr("Вся неделя перед глазами")}</h3><p>{tr("Подключи Google, Яндекс или другую ICS-подписку.")}<br />{tr("Dinox будет обновлять расписание автоматически.")}</p><button className="cal-primary" onClick={openCalendarSettings}>{tr("Подключить календарь")}</button><small>{tr("Инструкция находится в настройках")}</small></div> : <>
      {view === 'week' && <><p className="cal-week-hint">{tr('Прокрутите неделю вбок или выберите «Список»')}</p><div className="cal-week-frame" tabIndex={0} role="region" aria-label={tr('Неделя: горизонтальная прокрутка')}><div className="cal-week-head"><span /><>{days.map(d => <button key={+d} className={sameDay(d, now) ? 'today' : ''} onClick={() => { onDate(d); void saveView('agenda'); }}><span>{d.toLocaleDateString(locale(), { weekday: 'short' })}</span><strong>{d.getDate()}</strong></button>)}</></div><WeekBanners events={model.events} date={date} onSelect={setSelected}/><div className="cal-week-scroll" ref={scroller} onScroll={e => { scrollPosition.current = {key: scrollKey, top: e.currentTarget.scrollTop}; }}><div className="cal-week-body" style={{ height: 24 * hourHeight }}><div className="cal-hours">{Array.from({ length: 24 }, (_, h) => <span key={h} style={{ top: h * hourHeight }}>{String(h).padStart(2, '0')}:00</span>)}</div>{days.map(d => <div className={`cal-day-column ${sameDay(d, now) ? 'today' : ''}`} key={+d} style={{ backgroundSize: `100% ${hourHeight}px` }}>{layoutDay(model.events, d).map(({ event, column, columns, top, height }) => <button className="cal-time-event" key={event.id} onClick={() => setSelected(event)} style={{ top: top * hourHeight / 60, height: Math.max(22, height * hourHeight / 60), left: `calc(${column / columns * 100}% + 2px)`, width: `calc(${100 / columns}% - 4px)`, '--event-color': event.color } as CSSProperties} title={`${eventTitle(event)} · ${eventTime(event)}`}><strong>{eventTitle(event)}</strong><span>{eventTime(event)}</span></button>)}{sameDay(d, now) && <div className="cal-now" style={{ top: (new Date(now).getHours() + new Date(now).getMinutes() / 60) * hourHeight }}/>}</div>)}</div></div></div></>}
      {view === 'month' && <div className="cal-month-layout"><div><div ref={monthGrid} className="cal-month-grid" title={tr("Прокрутите колесо для смены месяца")}>{[tr("Пн"), tr("Вт"), tr("Ср"), tr("Чт"), tr("Пт"), tr("Сб"), tr("Вс")].map(d => <span className="cal-weekday" key={d}>{d}</span>)}{Array.from({ length: 42 }, (_, i) => addDays(weekStart(new Date(date.getFullYear(), date.getMonth(), 1)), i)).map(d => <button key={+d} className={`${d.getMonth() !== date.getMonth() ? 'outside' : ''} ${sameDay(d, now) ? 'today' : ''} ${sameDay(d, date) ? 'selected' : ''}`} onClick={() => onDate(d)}><span>{d.getDate()}</span><div>{[...new Set(model.events.filter(e => onDay(e, d)).map(e => e.color))].slice(0, 4).map(c => <i key={c} style={{ background: c }}/>)}</div></button>)}</div>{timer && <div className="cal-timer">{timer}</div>}</div><div className="cal-day-agenda"><h4>{date.toLocaleDateString(locale(), { day: 'numeric', month: 'long', weekday: 'long' })}</h4>{model.events.filter(e => onDay(e, date)).map(row)}{!model.events.some(e => onDay(e, date)) && <p className="cal-empty-day">{tr("На этот день ничего не запланировано")}</p>}</div></div>}
      {view === 'agenda' && <div className="cal-agenda-list">{Array.from({ length: 7 }, (_, i) => addDays(dayStart(date), i)).map(d => <div key={+d}><h4>{sameDay(d, now) ? tr("Сегодня") : d.toLocaleDateString(locale(), { weekday: 'long' })}<span>{d.toLocaleDateString(locale(), { day: 'numeric', month: 'long' })}</span></h4>{model.events.filter(e => onDay(e, d)).map(row)}{!model.events.some(e => onDay(e, d)) && <p className="cal-empty-day">{tr("Свободный день")}</p>}</div>)}</div>}
    </>}
    <footer className="cal-footer"><span className={knownErrors.length ? 'warning' : ''}>{model.busy ? tr("Обновление…") : knownErrors.length ? tr("Показаны сохранённые данные") : last.length ? tr("Проверено в {0}", time(Math.min(...last) * 1000)) : tr("Нет подключённых календарей")}<small>{tr("Автообновление:")}{" "}{eco ? '30' : '10'}{" "}{tr("мин \u00B7")}{" "}{Intl.DateTimeFormat().resolvedOptions().timeZone}</small></span><button className="cal-icon-button" aria-label={tr("Обновить календарь")} disabled={model.busy} onClick={() => void model.refresh()}><RefreshCw size={15} className={model.busy ? 'spinning' : ''}/></button><button className="cal-icon-button" aria-label={tr("Настройки календаря")} onClick={openCalendarSettings}><Settings2 size={15}/></button></footer>
    {selected && <div className="cal-detail-backdrop" onClick={() => setSelected(null)}><article className="cal-event-detail" onClick={e => e.stopPropagation()} style={{ borderTopColor: selected.color }}><button className="cal-icon-button cal-detail-close" aria-label={tr("Закрыть событие")} onClick={() => setSelected(null)}><X size={16}/></button><span className="cal-source-label" style={{ color: selected.color }}>{selected.sourceName}</span><h3>{eventTitle(selected)}</h3><p><Clock3 size={14}/>{new Date(selected.start).toLocaleDateString(locale(), { day: 'numeric', month: 'long' })} · {eventTime(selected)}</p>{selected.location && <p><MapPin size={14}/>{selected.location}</p>}{selected.description && <div className="cal-description">{selected.description}</div>}<div className="cal-detail-actions">{selected.meeting && <button className="cal-primary" onClick={() => openLink(selected.meeting).catch(e => setError(String(e)))}><Video size={14}/>{tr("Подключиться")}</button>}{selected.url && <button className="cal-text-button" onClick={() => openLink(selected.url).catch(e => setError(String(e)))}><ExternalLink size={14}/>{tr("Открыть событие")}</button>}</div></article></div>}
  </section>;
}
export function UpcomingEvent({ events, onOpen }: {
    events: CalendarEvent[];
    onOpen: () => void;
}) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
    const next = events.find(e => !isBannerEvent(e) && e.end > now);
    const minutes = next ? Math.max(1, Math.ceil((next.start - now) / 60000)) : 0;
    const when = minutes < 60 ? tr("через {0} мин", minutes) : minutes < 1440 ? tr("через {0} ч {1} мин", Math.floor(minutes / 60), minutes % 60) : new Date(next!.start).toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) + ' · ' + time(next!.start);
    return <button className="cal-upcoming" onClick={onOpen}><CalendarDays size={14}/><span>{next ? eventTitle(next) : tr("Открыть расписание")}</span>{next && <small>{next.start <= now ? tr("Сейчас") : when}</small>}</button>;
}
export function ReminderCard({ reminder }: {
    reminder: ReturnType<typeof useReminders>;
}) {
    const e = reminder.active;
    const [error, setError] = useState('');
    if (!e)
        return null;
    return <div className="cal-reminder" role="status"><div><Clock3 size={14}/><strong>{eventTitle(e)}</strong><button className="cal-icon-button" aria-label={tr("Закрыть напоминание")} onClick={reminder.dismiss}><X size={14}/></button></div><p>{eventTime(e)}</p><div>{e.meeting && <button className="cal-primary" onClick={() => openLink(e.meeting).then(reminder.dismiss).catch(err => setError(String(err)))}>{tr("Подключиться")}</button>}<button className="cal-text-button" onClick={reminder.snooze}>{tr("Через 5 минут")}</button></div>{error && <small role="alert">{trError(error)}</small>}</div>;
}
