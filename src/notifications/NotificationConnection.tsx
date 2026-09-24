import {useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {tr,trError} from '../i18n/core';
import type {Notice} from './model';
import '../dock/content.css';
export function NotificationConnection({enabled}:{enabled:boolean}){
 const [health,setHealth]=useState<{checked:number;count:number;last:number|null;telegram:boolean}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!enabled){setHealth(null);return;}const stop=listen<NonNullable<typeof health>>('bloom-notification-health',e=>{setHealth(e.payload);setError('');});return()=>{void stop.then(f=>f());};},[enabled]);
 const check=async()=>{setBusy(true);setError('');try{const items=await invoke<Notice[]>('notification_snapshot');setHealth({checked:Date.now(),count:items.length,last:items[0]?.created??null,telegram:items.some(n=>/telegram/i.test(n.app_name))});}catch(e){setError(trError(e));}finally{setBusy(false);}};
 return <section className="notification-connection" aria-label={tr('Подключение Telegram')}><strong>{tr('Подключение Telegram')}</strong><p>{tr('Dinox видит только уведомления из центра Windows. Собственные баннеры Telegram не перехватываются.')}</p><p>{tr('В Telegram: Настройки → Уведомления и звуки → Использовать уведомления Windows. Затем проверьте сообщение из другого чата.')}</p><small>{tr('Dinox не отключает исходные баннеры автоматически. Чтобы убрать дубли, выключите только баннеры Telegram в Windows, оставив уведомления в центре.')}</small>{enabled&&<><button disabled={busy} onClick={()=>void check()}>{busy?tr('Проверка…'):tr('Проверить получение')}</button><div role="status"><small>{health?tr('Прочитано из центра Windows: {0}',health.count):tr('Доступ разрешён; получение сообщений ещё не проверено.')}</small>{health&&<small>{health.telegram?tr('Telegram найден в центре уведомлений.'):tr('Telegram пока не найден в центре уведомлений.')}</small>}</div></>}{error&&<p role="alert" className="notice-error">{error}</p>}</section>;
}
