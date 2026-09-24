import { useEffect, useRef, useState } from 'react';
import {parseNotificationOptions,isQuiet,notificationDefaults} from '../notifications/model';
import {noticeMatchesApp,type NoticeApp,type DockApp} from '../notifications/attention';
import { listen } from '@tauri-apps/api/event';
import { appWindows, needsAttention, type WindowApp } from '../personalLogic';
import { usePersonalSetting } from '../components/PersonalFeatures';

export function useDockAttention() {
  const [notificationRaw]=usePersonalSetting('bloom-notifications',JSON.stringify(notificationDefaults));
  const quiet=useRef(false);const notificationOptions=parseNotificationOptions(notificationRaw);quiet.current=notificationOptions.enabled&&isQuiet(notificationOptions);
  const [enabled] = usePersonalSetting('bloom-personal-attention', 'true');
  const [seconds] = usePersonalSetting('bloom-attention-duration', '4');
  const [muted, saveMuted] = usePersonalSetting('bloom-attention-muted', '[]');
  const duration = [2,4,8].includes(Number(seconds)) ? Number(seconds)*1000 : 4000;
  let mutedApps: {path:string;name:string}[] = [];
  try { const parsed=JSON.parse(muted); if(Array.isArray(parsed)) mutedApps=parsed.filter(a=>typeof a.path==='string'); } catch {}
  const isMuted = (app: WindowApp & {path?:string}) => mutedApps.some(a=>a.path.toLowerCase()===app.path?.toLowerCase());
  const [entries, setEntries] = useState<Record<number, number>>({});
  const [notices,setNotices]=useState<(NoticeApp&{expires:number})[]>([]);
  const noticeCooldown=useRef(new Map<string,number>());
  const cooldown = useRef(new Map<number, number>());
  useEffect(() => {
    if (enabled === 'false') { setEntries({});setNotices([]);noticeCooldown.current.clear();cooldown.current.clear(); return; }
    let active = true;
    const flash = listen<number>('dock-attention', ({ payload: hwnd }) => {
      if (!active || quiet.current || !Number.isSafeInteger(hwnd) || hwnd <= 0) return;
      const now = Date.now();
      for (const [id, expiry] of cooldown.current) if (expiry <= now) cooldown.current.delete(id);
      if (cooldown.current.has(hwnd)) return;
      cooldown.current.set(hwnd, now + 10000);
      setEntries(previous => ({ ...previous, [hwnd]: now + duration }));
    });
    const news=listen<NoticeApp>('bloom-app-notice',({payload})=>{
      if(!active||quiet.current||typeof payload?.app_id!=='string'||typeof payload?.app_name!=='string')return;
      const now=Date.now();for(const [key,expiry] of noticeCooldown.current)if(expiry<=now)noticeCooldown.current.delete(key);
      if(noticeCooldown.current.has(payload.app_id))return;
      noticeCooldown.current.set(payload.app_id,now+10000);
      setNotices(old=>[...old.filter(n=>n.app_id!==payload.app_id&&n.expires>now),{...payload,expires:now+duration}].slice(-100));
    });
    const clear = listen<number>('dock-attention-clear', ({ payload: hwnd }) => {
      if (active) setEntries(previous => { const next = { ...previous }; delete next[hwnd]; return next; });
    });
    return () => { active = false; flash.then(f => f()).catch(console.error); clear.then(f => f()).catch(console.error);news.then(f=>f()).catch(console.error); };
  }, [enabled, duration]);
  useEffect(() => {
    const expiries = [...Object.values(entries),...notices.map(n=>n.expires)];
    if (!expiries.length) return;
    const timer = setTimeout(() => {setNotices(old=>old.filter(n=>n.expires>Date.now()));setEntries(previous => Object.fromEntries(Object.entries(previous).filter(([, expiry]) => expiry > Date.now())));}, Math.max(0, Math.min(...expiries) - Date.now()));
    return () => clearTimeout(timer);
  }, [entries,notices]);
  return {
    duration,
    isMuted,
    toggleMuted: (app: WindowApp & {path:string;name:string}) => saveMuted(JSON.stringify(isMuted(app) ? mutedApps.filter(a=>a.path.toLowerCase()!==app.path.toLowerCase()) : [...mutedApps,{path:app.path,name:app.name}])),
    has: (app: WindowApp & DockApp) => enabled !== 'false' && !isMuted(app) && (needsAttention(app, entries, Date.now())||notices.some(n=>n.expires>Date.now()&&noticeMatchesApp(n,app))),
    clear: (app: WindowApp & DockApp) => {setNotices(old=>old.filter(n=>!noticeMatchesApp(n,app)));setEntries(previous => {
      const next = { ...previous }; appWindows(app).forEach(id => delete next[id]); return next;
    });},
  };
}
