import {tr,trError} from '../i18n/core';
import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Bell, Settings, Wifi, Volume2, Battery, Zap } from 'lucide-react';
import { useSettingsSync } from '../hooks/useSettingsSync';
import { SettingRow } from '../settings/SettingRow';
import './PersonalFeatures.css';
import { PersonalOptions, ProfilePicker } from './PersonalOptions';
const actions = {
    none: { get label() {
            return tr("Скрыть");
        }, command: '', Icon: Zap },
    notifications: { get label() {
            return tr("Уведомления");
        }, command: 'open_notification_center', Icon: Bell },
    settings: { get label() {
            return tr("Настройки Dinox");
        }, command: 'open_settings_window', Icon: Settings },
    wifi: { label: 'Wi-Fi', command: 'open_wifi_settings', Icon: Wifi },
    sound: { get label() {
            return tr("Звук");
        }, command: 'open_sound_settings', Icon: Volume2 },
    battery: { get label() {
            return tr("Энергосбережение");
        }, command: 'open_battery_saver_settings', Icon: Battery },
};
type Action = keyof typeof actions;
function validAction(value: unknown, fallback: Action): Action {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(actions, value) ? value as Action : fallback;
}
export function usePersonalSetting(key: string, fallback: string) {
    const [value, setValue] = useState(() => localStorage.getItem(key) ?? fallback);
    const revision = useRef(0);
    useSettingsSync({ [key]: next => { revision.current++; setValue(String(next)); localStorage.setItem(key, String(next)); } });
    useEffect(() => {
        let active = true;
        const atStart = revision.current;
        invoke<Record<string, unknown>>('load_settings').then(settings => {
            if (active && atStart === revision.current)
                setValue(settings[key] == null ? fallback : String(settings[key]));
        }).catch(console.error);
        return () => { active = false; };
    }, [key, fallback]);
    const save = async (next: string) => {
        await invoke('save_setting', { key, value: next });
        revision.current++;
        localStorage.setItem(key, next);
        setValue(next);
    };
    return [value, save] as const;
}
export function PersonalActions() {
    const [profile] = usePersonalSetting('bloom-personal-profile', 'work');
    const [left] = usePersonalSetting(`bloom-${profile}-action-1`, profile === 'relax' ? 'sound' : 'notifications');
    const [right] = usePersonalSetting(`bloom-${profile}-action-2`, profile === 'study' ? 'battery' : 'settings');
    const [error, setError] = useState('');
    return <div className="personal-actions" onWheel={e => e.stopPropagation()}>
    {[validAction(left, 'notifications'), validAction(right, 'settings')].map((id, i) => {
            const { label, command, Icon } = actions[id];
            return command && <button key={i} title={label} onClick={e => {
                    e.stopPropagation();
                    setError('');
                    invoke(command).catch(() => setError(tr("Не удалось открыть действие")));
                }}><Icon size={14}/><span>{tr(label)}</span></button>;
        })}
    {error && <span role="alert" className="personal-error">{trError(error)}</span>}
  </div>;
}
function ActionSetting({ slot, fallback }: {
    slot: number;
    fallback: Action;
}) {
    const [profile] = usePersonalSetting("bloom-personal-profile", "work");
    const [value, save] = usePersonalSetting(`bloom-${profile}-action-${slot}`, profile === "relax" && slot === 1 ? "sound" : profile === "study" && slot === 2 ? "battery" : fallback);
    const [error, setError] = useState('');
    return <SettingRow icon={Zap} label={tr("Кнопка {0} вверху", slot)} desc={error || tr("В развёрнутой панели статуса")}>
    <select aria-label={tr("Действие кнопки {0}", slot)} className="settings-select" value={validAction(value, fallback)} onChange={e => { setError(''); save(e.target.value).catch(() => setError(tr("Не удалось сохранить"))); }}>
      {Object.entries(actions).map(([id, a]) => <option key={id} value={id}>{a.label}</option>)}
    </select>
  </SettingRow>;
}
export function PersonalSettings() {
    const [bounce, save] = usePersonalSetting('bloom-personal-attention', 'true');
    const [error, setError] = useState('');
    return <>
    <div className="setting-group-label">Bloom Personal</div>
    <div className="setting-group">
      <ProfilePicker />
      <PersonalOptions />
      <ActionSetting slot={1} fallback="notifications"/>
      <ActionSetting slot={2} fallback="settings"/>
      <SettingRow icon={Bell} label={tr("Подпрыгивание значков")} desc={error || tr("Когда приложение запрашивает внимание Windows")}>
        <label className="toggle-switch"><input aria-label={tr("Подпрыгивание значков")} type="checkbox" checked={bounce !== 'false'} onChange={e => { setError(''); save(String(e.target.checked)).catch(() => setError(tr("Не удалось сохранить"))); }}/><span className="slider"/></label>
      </SettingRow>
    </div>
  </>;
}
