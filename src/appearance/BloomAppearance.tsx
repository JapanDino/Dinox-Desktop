import {useAppLanguage} from '../i18n/useLanguage';
import {tr,trError} from '../i18n/core';
import { useEffect, useState } from 'react';
import { Palette } from 'lucide-react';
import { usePersonalSetting } from '../components/PersonalFeatures';
import { SettingRow } from '../settings/SettingRow';
import {initTheme} from '../theme';
import './bloom.css';
import './designSystem.css';
let themeUsers=0;
let stopTheme:(()=>void)|undefined;
export function useBloomAppearance() {
    useAppLanguage();
    const [raw] = usePersonalSetting('bloom-unified-appearance', 'true');
    const enabled = raw !== 'false';
    useEffect(()=>{
        if(themeUsers++===0)stopTheme=initTheme();
        return()=>{if(--themeUsers===0){stopTheme?.();stopTheme=undefined;}};
    },[]);
    useEffect(() => { document.documentElement.dataset.bloomUnified = String(enabled); }, [enabled]);
    return enabled;
}
export function BloomAppearanceSetting() {
    const [raw, save] = usePersonalSetting('bloom-unified-appearance', 'true');
    const [error, setError] = useState('');
    return <><SettingRow icon={Palette} label={tr("Единый стиль Dinox")} desc={tr("Чёрные панели, белые значки. Отключи для отдельных цветных тем.")}><label className="toggle-switch"><input aria-label={tr("Единый стиль Dinox")} type="checkbox" checked={raw !== 'false'} onChange={e => { setError(''); void save(String(e.target.checked)).catch(() => setError(tr("Не удалось сохранить оформление."))); }}/><span className="slider"/></label></SettingRow>{error && <p role="alert" className="settings-inline-error">{trError(error)}</p>}</>;
}
