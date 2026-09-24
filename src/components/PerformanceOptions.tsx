import { useState } from 'react';
import { Leaf, AudioLines, Image, Cpu, PanelsTopLeft } from 'lucide-react';
import { usePersonalSetting } from './PersonalFeatures';
import { SettingRow } from '../settings/SettingRow';
import { tr, trError } from '../i18n/core';

function OptionalFeature({setting, label, description, icon}: {
    setting: string; label: string; description: string; icon: typeof Leaf;
}) {
    const [value, save] = usePersonalSetting(setting, 'true');
    const [error, setError] = useState('');
    return <><SettingRow icon={icon} label={tr(label)} desc={tr(description)}>
        <label className="toggle-switch"><input type="checkbox" aria-label={tr(label)} checked={value !== 'false'} onChange={e => {
            setError(''); void save(String(e.target.checked)).catch(e => setError(String(e)));
        }}/><span className="slider"/></label>
    </SettingRow>{error && <p className="cal-error" role="alert">{trError(error)}</p>}</>;
}

export function PerformanceOptions() {
    const [eco, saveEco] = usePersonalSetting('bloom-personal-eco', 'auto');
    const [error, setError] = useState('');
    return <div className="performance-options">
        <div className="setting-group-label">{tr('Производительность')}</div>
        <div className="setting-group">
            <SettingRow icon={Leaf} label={tr('Экономия энергии')} desc={tr('Без аудиовизуализации; показатели — раз в 10 секунд, календари — раз в 30 минут')}>
                <select className="settings-select" aria-label={tr('Экономия энергии')} value={eco} onChange={e => {
                    setError(''); void saveEco(e.target.value).catch(e => setError(String(e)));
                }}><option value="auto">{tr('От батареи')}</option><option value="on">{tr('Всегда')}</option><option value="off">{tr('Выключена')}</option></select>
            </SettingRow>
            <OptionalFeature setting="bloom-media-visualizer-enabled" label="Аудиовизуализация" description="Анимация звука. Выключение останавливает захват и анализ аудио." icon={AudioLines}/>
            <OptionalFeature setting="bloom-dock-preview-enabled" label="Превью окон" description="Снимки окон при наведении на приложения в доке." icon={PanelsTopLeft}/>
            <OptionalFeature setting="bloom-island-cpu" label="CPU рядом со временем" description="Скрытый показатель не опрашивается, пока не открыт соответствующий виджет." icon={Cpu}/>
            <OptionalFeature setting="bloom-media-ambience-enabled" label="Свечение обложки" description="Декоративное свечение в музыкальном режиме." icon={Image}/>
            <p className="cal-sync-note">{tr('Экономия сохраняет ваши переключатели. После её выключения эффекты возвращаются по вашим настройкам. Напоминания и управление Windows продолжают работать.')}</p>
            <p className="cal-sync-note">{tr('В экономии значок уведомления показывает индикатор вместо подпрыгивания.')}</p>
            <p className="cal-sync-note">{tr('CPU на острове — нагрузка всего компьютера. Расход самого Dinox нужно измерять вместе с его процессами WebView2. Замеры этой версии ещё не выполнены.')}</p>
            {error && <p className="cal-error" role="alert">{trError(error)}</p>}
        </div>
    </div>;
}
