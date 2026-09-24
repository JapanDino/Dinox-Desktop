import {tr,trError} from '../i18n/core';
import { SlidersHorizontal, Keyboard, Wifi, Volume2, Battery, Percent, ChevronUp, Minimize2 } from 'lucide-react';
import { useState } from 'react';
import { usePersonalSetting } from '../components/PersonalFeatures';
import { SettingRow } from '../settings/SettingRow';
import { parseSystemOptions, systemDefaults, type SystemOptions } from './model';
export function SystemSettings() {
    const icons = { enabled: SlidersHorizontal, layout: Keyboard, wifi: Wifi, volume: Volume2, battery: Battery, percent: Percent, tray: ChevronUp, compact: Minimize2 };
    const [raw, save] = usePersonalSetting('bloom-system-controls', JSON.stringify(systemDefaults));
    const options = parseSystemOptions(raw);
    const [error, setError] = useState('');
    const change = async (key: keyof SystemOptions, value: boolean) => { try {
        await save(JSON.stringify({ ...options, [key]: value }));
        setError('');
    }
    catch {
        setError(tr("Не удалось сохранить настройку."));
    } };
    const rows: [
        keyof SystemOptions,
        string,
        string?
    ][] = [['enabled', tr("Системная панель"), tr("Wi-Fi, звук, раскладка, батарея и скрытые значки")], ['layout', tr("Раскладка клавиатуры")], ['wifi', tr("Значок Wi-Fi")], ['volume', tr("Значок громкости")], ['battery', tr("Батарея и питание")], ['percent', tr("Процент заряда")], ['tray', tr("Стрелка скрытых значков")], ['compact', tr("Компактная кнопка"), tr("Заменяет группу Wi-Fi, звука и батареи одной кнопкой")]];
    return <><div className="setting-group-label">{tr("Системные функции")}</div><div className="setting-group">{rows.filter(([key]) => options.enabled || key === 'enabled').map(([key, label, desc]) => <SettingRow key={key} icon={icons[key]} label={label} desc={desc}><label className="toggle-switch"><input type="checkbox" aria-label={label} checked={options[key]} onChange={e => void change(key, e.target.checked)}/><span className="slider"/></label></SettingRow>)}<p style={{ padding: '4px 18px 15px', fontSize: 11, lineHeight: 1.6, opacity: .65 }}>{tr("Стрелка открывает панель доступа к скрытым значкам. Сами значки пока открываются в Windows с возвратом штатного таскбара. Микшер приложений и выбор устройств также остаются в Windows.")}</p>{error && <p role="alert">{trError(error)}</p>}</div></>;
}
