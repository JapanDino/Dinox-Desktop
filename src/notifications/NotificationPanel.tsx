import {tr,trError,locale} from '../i18n/core';
import { Bell, Check, X, Settings2, ArrowUpRight, MessageCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { CSSProperties } from 'react';
import type { Notice, NotificationOptions } from './model';
import {messengerIdentity} from './model';
import type { useNotifications } from './useNotifications';
import './notifications.css';
export function NotificationCard({ notice: n, options: o, onDismiss }: {
    notice: Notice;
    options: NotificationOptions;
    onDismiss?: () => void;
}) {
    const messenger=messengerIdentity(n,o.privacy);
    if(messenger) return <article className={`notice-card notice-message style-${o.style}`} style={{'--notice-accent':o.accent} as CSSProperties}>
      <div className="notice-source"><MessageCircle size={13}/><strong>{n.app_name}</strong><time>{new Date(n.created).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'})}</time>{onDismiss&&<button aria-label={tr('Скрыть уведомление {0}',n.app_name)} onClick={onDismiss}><X size={13}/></button>}</div>
      <div className="notice-message-row"><span className="notice-avatar" aria-hidden="true" title={o.privacy==='hidden'?undefined:tr('Инициалы — фото контакта недоступно')}>{messenger.initials||<MessageCircle size={20}/>}</span><div className="notice-message-content"><h3>{messenger.name}</h3>{o.privacy==='full'&&n.body?<p>{n.body}</p>:o.privacy!=='full'?<p className="notice-private">{o.privacy==='hidden'?tr('Содержимое скрыто настройками приватности'):tr('Текст сообщения скрыт')}</p>:null}</div></div>
    </article>;
    const telegram = /telegram/i.test(n.app_name); return <article className={`notice-card style-${o.style}`} style={{ '--notice-accent': o.accent } as CSSProperties}><div className="notice-source"><span className={`notice-app-icon ${telegram ? 'telegram' : ''}`}>{telegram ? <MessageCircle size={16}/> : <Bell size={15}/>}</span><strong>{n.app_name}</strong><time>{new Date(n.created).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}</time>{onDismiss && <button aria-label={tr("Скрыть уведомление {0}", n.app_name)} onClick={onDismiss}><X size={13}/></button>}</div><h3>{o.privacy === 'hidden' ? tr("Новое уведомление") : n.title || tr("Новое уведомление")}</h3>{o.privacy === 'full' && n.body && <p>{n.body}</p>}{o.privacy !== 'full' && <p className="notice-private">{o.privacy === 'hidden' ? tr("Содержимое скрыто настройками приватности") : tr("Текст сообщения скрыт")}</p>}</article>; }
export function NotificationPanel({ model: m }: {
    model: ReturnType<typeof useNotifications>;
}) { return <section className="bloom-notifications" onClick={e => e.stopPropagation()} onWheel={e => e.stopPropagation()} onPointerEnter={() => m.pause(true)} onPointerLeave={() => m.pause(false)}><header><div><Bell size={15}/><strong>{m.center ? tr("Уведомления") : tr("Новое уведомление")}</strong>{m.center && <small>{m.history.length}</small>}</div><button className="notice-control" aria-label={tr("Закрыть панель уведомлений")} onClick={m.close}><X size={15}/></button></header>{!m.options.enabled ? <div className="notice-empty"><Bell size={28}/><h3>{tr("Уведомления по твоим правилам")}</h3><p>{tr("Это отдельная опциональная функция.")}<br />{tr("Она пока выключена.")}</p><button onClick={() => { void invoke('open_notification_settings'); m.close(); }}>{tr("Настроить уведомления")}</button></div> : <><div className="notice-list">{m.error && <p role="alert" className="notice-error">{trError(m.error)}</p>}{(m.center ? m.history : m.popups.map(x => x.notice)).map(n => <NotificationCard key={`${n.app_id}:${n.id}:${n.created}`} notice={n} options={m.options} onDismiss={() => m.dismiss(n)}/>)}{m.center && !m.history.length && <div className="notice-empty"><Check size={25}/><h3>{tr("Всё спокойно")}</h3><p>{m.options.windowsEnabled ? tr("Здесь появятся уведомления Windows.") : tr("Чтение уведомлений Windows ещё не подключено.")}</p></div>}</div><footer><button onClick={() => { void invoke('open_notification_center'); m.close(); }}><ArrowUpRight size={13}/>{tr("Центр Windows")}</button>{!m.center && <button onClick={m.showCenter}>{tr("Все уведомления")}</button>}<button aria-label={tr("Настройки уведомлений")} onClick={() => { void invoke('open_notification_settings'); m.close(); }}><Settings2 size={14}/></button></footer></>}</section>; }
