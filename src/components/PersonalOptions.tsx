import {tr,trError} from '../i18n/core';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {PerformanceOptions} from './PerformanceOptions';
import { Bell, LayoutPanelTop } from 'lucide-react';
import { usePersonalSetting } from './PersonalFeatures';
import { SettingRow } from '../settings/SettingRow';
import '../calendar/calendar.css';
export const profiles = [['work', tr("Работа")], ['study', tr("Учёба")], ['relax', tr("Отдых")]];
export function useEcoMode() {
    const [mode] = usePersonalSetting('bloom-personal-eco', 'auto');
    const [active, setActive] = useState(false);
    useEffect(() => { let alive = true; const poll = () => invoke<boolean>('personal_power_state').then(v => { if (alive)
        setActive(v); }).catch(() => { if (alive)
        setActive(mode === 'on'); }); void poll(); const timer = setInterval(poll, 30000); return () => { alive = false; clearInterval(timer); }; }, [mode]);
    useEffect(() => { document.documentElement.dataset.bloomEco = String(active); }, [active]);
    return active;
}
export function ProfilePicker() {
    const [profile, save] = usePersonalSetting('bloom-personal-profile', 'work');
    const [error, setError] = useState('');
    return <div className="personal-profile-switch" aria-label={tr("Профиль панели")}>{profiles.map(([id, label]) => <button key={id} aria-pressed={profile === id} onClick={() => save(id).catch(e => setError(String(e)))}>{tr(label)}</button>)}{error && <span role="alert">{trError(error)}</span>}</div>;
}
export function PersonalOptions() {
    const [profile] = usePersonalSetting('bloom-personal-profile', 'work');
    const [duration, saveDuration] = usePersonalSetting('bloom-attention-duration', '4');
    const [muted, saveMuted] = usePersonalSetting('bloom-attention-muted', '[]');
    const [upcoming, saveUpcoming] = usePersonalSetting(`bloom-profile-${profile}-upcoming`, profile === 'relax' ? 'false' : 'true');
    const [actions, saveActions] = usePersonalSetting(`bloom-profile-${profile}-actions`, 'true');
    const [error, setError] = useState('');
    let apps: {
        path: string;
        name: string;
    }[] = [];
    try {
        apps = JSON.parse(muted);
        if (!Array.isArray(apps))
            apps = [];
    }
    catch { }
    const change = (f: () => Promise<unknown>) => { setError(''); f().catch(e => setError(String(e))); };
    return <>
    <SettingRow icon={LayoutPanelTop} label={tr("Виджеты профиля")} desc={tr("Для выбранного режима работы")}><div className="personal-select-row"><label><input type="checkbox" checked={upcoming === 'true'} onChange={e => change(() => saveUpcoming(String(e.target.checked)))}/>{tr("Событие")}</label><label><input type="checkbox" checked={actions === 'true'} onChange={e => change(() => saveActions(String(e.target.checked)))}/>{tr("Кнопки")}</label></div></SettingRow>
    <PerformanceOptions/>
    <SettingRow icon={Bell} label={tr("Длительность внимания")} desc={tr("Исключения доступны по правому клику на значке дока")}><select aria-label={tr("Длительность внимания")} className="settings-select" value={duration} onChange={e => change(() => saveDuration(e.target.value))}>{[2, 4, 8].map(n => <option key={n} value={n}>{n}{tr("секунды")}</option>)}</select></SettingRow>
    {!!apps.length && <div className="personal-muted-apps">{apps.map(app => <button key={app.path} title={tr("Вернуть подпрыгивание")} onClick={() => change(() => saveMuted(JSON.stringify(apps.filter(a => a.path !== app.path))))}>{app.name} ×</button>)}</div>}
    {error && <p className="cal-error" role="alert">{trError(error)}</p>}
  </>;
}
