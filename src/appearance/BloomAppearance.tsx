import {useAppLanguage} from '../i18n/useLanguage';
import {tr,trError} from '../i18n/core';
import { useEffect, useState } from 'react';
import { Palette } from 'lucide-react';
import { usePersonalSetting } from '../components/PersonalFeatures';
import { SettingRow } from '../settings/SettingRow';
import './bloom.css';
export function useBloomAppearance() {
    useAppLanguage();
    const [raw] = usePersonalSetting('bloom-unified-appearance', 'true');
    const enabled = raw !== 'false';
    useEffect(() => { document.documentElement.dataset.bloomUnified = String(enabled); }, [enabled]);
    return enabled;
}
export function BloomAppearanceSetting() {
    const [raw, save] = usePersonalSetting('bloom-unified-appearance', 'true');
    const [error, setError] = useState('');
    return <><SettingRow icon={Palette} label={tr("Единый стиль Dinox")} desc={tr("Чёрные панели, белые значки. Отключи для отдельных цветных тем.")}><label className="toggle-switch"><input aria-label={tr("Единый стиль Dinox")} type="checkbox" checked={raw !== 'false'} onChange={e => { setError(''); void save(String(e.target.checked)).catch(() => setError(tr("Не удалось сохранить оформление."))); }}/><span className="slider"/></label></SettingRow>{error && <p role="alert" className="personal-error">{trError(error)}</p>}</>;
}
