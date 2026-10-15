import {tx} from '../desktopText';
import {tr,trError,locale} from '../i18n/core';
import { Bell, Check, X, Settings2, ArrowUpRight, MessageCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {useDialogFocus} from '../hooks/useDialogFocus';
import {motion,AnimatePresence,useReducedMotion,useIsPresent} from 'framer-motion';
import type { Notice, NotificationOptions } from './model';
import {messengerIdentity} from './model';
import type { useNotifications } from './useNotifications';
import './notifications.css';
export function NotificationCard({ notice: n, options: o, onDismiss, history = false }: {
    notice: Notice;
    options: NotificationOptions;
    onDismiss?: () => void;
    history?: boolean;
}) {
    const messenger=messengerIdentity(n,o.privacy);
    if(messenger) return <article className={`notice-card notice-message style-${o.style}`} style={{'--notice-accent':o.accent} as CSSProperties}>
      <div className="notice-source"><MessageCircle size={13}/><strong>{n.app_name}</strong><time>{new Date(n.created).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'})}</time>{onDismiss&&<button aria-label={history ? tx('Скрыть из истории Dinox: ', 'Hide from Dinox history: ') + n.app_name : tr('Скрыть уведомление {0}',n.app_name)} title={history ? tx('Скрывает только в Dinox. В Windows уведомление останется.', 'Hides only in Dinox. The Windows notification remains.') : undefined} onClick={onDismiss}><X size={13}/></button>}</div>
      <div className="notice-message-row"><span className="notice-avatar" aria-hidden="true" title={o.privacy==='hidden'?undefined:tr('Инициалы — фото контакта недоступно')}>{messenger.initials||<MessageCircle size={20}/>}</span><div className="notice-message-content"><h3>{messenger.name}</h3>{o.privacy==='full'&&n.body?<p>{n.body}</p>:o.privacy!=='full'?<p className="notice-private">{o.privacy==='hidden'?tr('Содержимое скрыто настройками приватности'):tr('Текст сообщения скрыт')}</p>:null}</div></div>
    </article>;
    const telegram = /telegram/i.test(n.app_name); return <article className={`notice-card style-${o.style}`} style={{ '--notice-accent': o.accent } as CSSProperties}><div className="notice-source"><span className={`notice-app-icon ${telegram ? 'telegram' : ''}`}>{telegram ? <MessageCircle size={16}/> : <Bell size={15}/>}</span><strong>{n.app_name}</strong><time>{new Date(n.created).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}</time>{onDismiss && <button aria-label={history ? tx('Скрыть из истории Dinox: ', 'Hide from Dinox history: ') + n.app_name : tr('Скрыть уведомление {0}',n.app_name)} title={history ? tx('Скрывает только в Dinox. В Windows уведомление останется.', 'Hides only in Dinox. The Windows notification remains.') : undefined} onClick={onDismiss}><X size={13}/></button>}</div><h3>{o.privacy === 'hidden' ? tr("Новое уведомление") : n.title || tr("Новое уведомление")}</h3>{o.privacy === 'full' && n.body && <p>{n.body}</p>}{o.privacy !== 'full' && <p className="notice-private">{o.privacy === 'hidden' ? tr("Содержимое скрыто настройками приватности") : tr("Текст сообщения скрыт")}</p>}</article>; }
function ViewedNotice({notice, model, reduced, reading}: {notice: Notice; model: ReturnType<typeof useNotifications>; reduced: boolean | null; reading:boolean}) {
    const ref = useRef<HTMLDivElement>(null);
    const markRead = useRef(model.markVisibleRead); markRead.current = model.markVisibleRead;
    useEffect(() => {
        if (!reading || !ref.current) return;
        let timer:ReturnType<typeof setTimeout>|null=null;
        const observer = new IntersectionObserver(entries => {
            if(timer)clearTimeout(timer);timer=null;
            // A card briefly passing through the viewport during expansion or
            // collapse is not a read message. Require continuous visibility.
            if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .5)) timer=setTimeout(()=>markRead.current(notice),200);
        // The viewport root includes every clipping ancestor. In short panels
        // the panel itself scrolls, while notice-list becomes overflow:visible.
        }, {root: null, threshold: .5});
        observer.observe(ref.current);
        return () => {observer.disconnect();if(timer)clearTimeout(timer);};
    }, [reading, notice]);
    return <motion.div ref={ref} initial={{opacity:0,y:reduced?0:6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:reduced?0:-6,height:0}} transition={{duration:reduced?0:.16}}><NotificationCard notice={notice} options={model.options} history={model.center} onDismiss={() => model.center ? model.dismiss(notice) : model.hideBanner(notice)}/></motion.div>;
}
export function NotificationPanel({ model: m, onContentHeight }: {
    model: ReturnType<typeof useNotifications>;
    onContentHeight?:(height:number)=>void;
}) { const reduced=useReducedMotion(); const present=useIsPresent(); const ref=useRef<HTMLElement>(null); const actionBusy=useRef(false),alive=useRef(true);const[pending,setPending]=useState(false),[actionError,setActionError]=useState('');
    useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
    const [shortPanel,setShortPanel]=useState(false);
    const [narrowPanel,setNarrowPanel]=useState(false);
    const [tinyPanel,setTinyPanel]=useState(false);
    useEffect(()=>{
        const element=ref.current;if(!element||m.center||!onContentHeight)return;
        const measure=()=>{
            const outer=(node:Element|null)=>{if(!(node instanceof HTMLElement))return 0;const s=getComputedStyle(node);return node.offsetHeight+(parseFloat(s.marginTop)||0)+(parseFloat(s.marginBottom)||0);};
            const style=getComputedStyle(element),list=element.querySelector('.notice-list');
            const listStyle=list?getComputedStyle(list):null;
            const content=Array.from(list?.children??[]).reduce((sum,node)=>sum+Math.max(outer(node),outer(node.querySelector('.notice-card'))),0);
            const height=outer(element.querySelector('header'))+outer(element.querySelector('footer'))+content+(parseFloat(style.paddingTop)||0)+(parseFloat(style.paddingBottom)||0)+(parseFloat(listStyle?.paddingTop??'0')||0)+(parseFloat(listStyle?.paddingBottom??'0')||0)+8;
            if(height>0&&Number.isFinite(height))onContentHeight(Math.ceil(height));
        };
        measure();const observer=new ResizeObserver(measure);observer.observe(element);element.querySelectorAll('header,footer,.notice-card').forEach(node=>observer.observe(node));return()=>observer.disconnect();
    },[m.center,m.popups,onContentHeight]);
    useEffect(()=>{
        const element=ref.current;if(!element)return;
        const header=element.querySelector('header');
        const measure=()=>{
            const headerHeight=header?.clientHeight??0;
            element.style.setProperty('--notice-header-height',`${headerHeight}px`);
            element.style.setProperty('--notice-panel-height',`${element.clientHeight}px`);
            setShortPanel(element.clientHeight>0&&element.clientHeight<=180);
            setNarrowPanel(element.clientWidth>0&&element.clientWidth<=220);
            // Keep the close control sticky only while another action can fit below it.
            setTinyPanel(element.clientHeight>0&&element.clientHeight<headerHeight+36);
        };
        measure();const observer=new ResizeObserver(measure);observer.observe(element);if(header)observer.observe(header);return()=>observer.disconnect();
    },[]);
    const openAction=async(command:string)=>{if(actionBusy.current)return;actionBusy.current=true;setPending(true);setActionError('');try{await invoke(command);m.close();}catch(error){if(alive.current)setActionError(trError(error).slice(0,300)||tx('Не удалось открыть. Попробуйте ещё раз.','Could not open. Please retry.'));}finally{actionBusy.current=false;if(alive.current)setPending(false);}};
    useDialogFocus(ref,true,m.close,m.center); return <motion.section ref={ref} role={m.center?'dialog':'region'} aria-modal={m.center?true:undefined} aria-label={tr('Уведомления')} className={`bloom-notifications${shortPanel?" notice-short":""}${narrowPanel?" notice-narrow":""}${tinyPanel?" notice-tiny":""}`} initial={{opacity:0,y:reduced?0:-6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:reduced?0:-4}} transition={{duration:reduced?0:.16,ease:'easeOut'}} onClick={e => e.stopPropagation()} onWheel={e => e.stopPropagation()} onPointerMove={e => {if(e.movementX||e.movementY)m.pause(true);}} onPointerLeave={() => m.pause(false)} onPointerCancel={() => m.pause(false)} onFocusCapture={() => m.pause(true)} onBlurCapture={e => {if(!e.currentTarget.contains(e.relatedTarget as Node))m.pause(false);}}><header><div><Bell size={15}/><strong>{m.center ? tr("Уведомления") : tr("Новое уведомление")}</strong>{m.center && <small>{m.history.length}</small>}</div><button className="notice-control" aria-label={tr("Закрыть панель уведомлений")} onClick={m.close}><X size={15}/></button></header>{!m.options.enabled ? <div className="notice-empty"><Bell size={28}/><h3>{tr("Уведомления по твоим правилам")}</h3><p>{tr("Это отдельная опциональная функция.")}<br />{tr("Она пока выключена.")}</p><button disabled={pending} onClick={() => {void openAction('open_notification_settings');}}>{tr("Настроить уведомления")}</button>{actionError&&<p role="alert" className="notice-error">{actionError}</p>}</div> : <><div className="notice-list" aria-live={m.center?undefined:"polite"}>{actionError&&<p role="alert" className="notice-error">{actionError} {tx('Повторите нажатие кнопки.','Try the button again.')}</p>}{pending&&<p role="status">{tx('Открываем…','Opening…')}</p>}{m.error && <p role="alert" className="notice-error">{trError(m.error)}</p>}<AnimatePresence initial={false}>{(m.center ? m.history : m.popups.map(x => x.notice)).map(n => <ViewedNotice key={`${n.app_id}:${n.id}:${n.created}`} notice={n} model={m} reduced={reduced} reading={m.center&&present}/>)}</AnimatePresence>{m.center && !m.history.length && <div className="notice-empty"><Check size={25}/><h3>{tr("Всё спокойно")}</h3><p>{m.options.windowsEnabled ? tr("Здесь появятся уведомления Windows.") : tr("Чтение уведомлений Windows ещё не подключено.")}</p></div>}</div><footer>{m.center && <small className="notice-local-history">{tx("История Dinox · закрытие не удаляет уведомления Windows", "Dinox history · hiding does not delete Windows notifications")}</small>}<button className="notice-open-windows" disabled={pending} aria-label={tr("Центр Windows")} title={tr("Центр Windows")} onClick={() => {void openAction('open_notification_center');}}><ArrowUpRight size={13}/><span>{tr("Центр Windows")}</span></button>{!m.center && <button className="notice-open-history" disabled={pending} aria-label={tr("Все уведомления")} title={tr("Все уведомления")} onClick={m.showCenter}><Bell size={14}/><span>{tr("Все уведомления")}</span></button>}<button disabled={pending} aria-label={tr("Настройки уведомлений")} onClick={() => {void openAction('open_notification_settings');}}><Settings2 size={14}/></button></footer></>}</motion.section>; }
