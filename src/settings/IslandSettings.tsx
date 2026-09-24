import {useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {Battery, Calendar, Cpu, PanelTop} from 'lucide-react';
import {usePersonalSetting} from '../components/PersonalFeatures';
import {SettingRow} from './SettingRow';
import {tr} from '../i18n/core';

export function IslandSettings() {
    const [reserve, setReserve] = usePersonalSetting('bloom-notch-reserve-space', 'false');
    const [date, setDate] = usePersonalSetting('bloom-island-date', 'false');
    const [battery, setBattery] = usePersonalSetting('bloom-island-battery', 'true');
    const [cpu, setCpu] = usePersonalSetting('bloom-island-cpu', 'true');
    const [error, setError] = useState('');
    const options = [
        {icon: PanelTop, label: 'Место над окнами', desc: 'Резервировать полосу для постоянно видимого острова. Выключено: окна занимают всю высоту, остров поверх них.', value: reserve, save: setReserve, sync: true},
        {icon: Calendar, label: 'Дата рядом со временем', desc: 'Сегодняшнее число и месяц', value: date, save: setDate},
        {icon: Battery, label: 'Заряд рядом со временем', desc: 'Показывать без раскрытия острова', value: battery, save: setBattery},
        {icon: Cpu, label: 'Процессор рядом со временем', desc: 'Показывать без раскрытия острова', value: cpu, save: setCpu},
    ];
    return <><div className="setting-group-label">{tr('Компактный остров')}</div><div className="setting-group">
        {options.map(option => <SettingRow key={option.label} icon={option.icon} label={tr(option.label)} desc={tr(option.desc)}><label className="toggle-switch"><input type="checkbox" aria-label={tr(option.label)} checked={option.value === 'true'} onChange={async e => {
            setError('');
            try {await option.save(String(e.target.checked)); if (option.sync) await invoke('sync_appbar');}
            catch {setError(tr('Не удалось сохранить настройку'));}
        }}/><span className="slider"/></label></SettingRow>)}
        {error && <p role="alert" className="panel-mode-hint">{error}</p>}
    </div></>;
}
