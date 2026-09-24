import {tr,trError} from '../i18n/core';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Monitor } from 'lucide-react';
import { usePersonalSetting } from '../components/PersonalFeatures';
import { SettingRow } from '../settings/SettingRow';
export function ShellSettings() {
    const [mode, save] = usePersonalSetting('bloom-shell-mode', 'compatible');
    const [recovered, setRecovered] = useState(false);
    const [status, setStatus] = useState({replacing:false,restorePending:false});
    const [error, setError] = useState('');
    useEffect(() => {
        const refresh = () => void invoke<{
            recovered: boolean; replacing: boolean; restorePending: boolean;
        }>('shell_status').then(s => {setRecovered(!!s?.recovered);setStatus({replacing:!!s?.replacing,restorePending:!!s?.restorePending});}).catch(() => { });
        refresh();
        const timer = window.setInterval(refresh, 3000);
        return () => window.clearInterval(timer);
    }, []);
    const change = async (value: string) => { try {
        if(value === 'replace') await invoke('save_setting',{key:'bloom-dock-enabled',value:'true'});
        await save(value);
        setRecovered(false);
        setError('');
    }
    catch {
        setError(tr("Не удалось изменить режим. Панель Windows остаётся доступной."));
    } };
    return <div className="setting-group">
    <SettingRow icon={Monitor} label={tr("Панель задач Windows")} desc={tr("Выберите одну панель или оставьте обе")}>
      <select className="settings-select" aria-label={tr("Режим панели Windows")} value={!recovered && mode === 'replace' ? 'replace' : 'compatible'} onChange={e => void change(e.target.value)}>
        <option value="compatible">{tr("Обе панели")}</option>
        <option value="replace">{tr("Только Dinox (тест)")}</option>
      </select>
    </SettingRow>
    <p className="panel-mode-hint" role="status">{tr(status.restorePending ? 'Возвращаем панель Windows…' : status.replacing ? 'Панель Windows скрыта. Работает док Dinox.' : mode === 'replace' && !recovered ? 'Windows пока видна: ожидаем готовности дока и защиты восстановления.' : 'Панель Windows остаётся видна. Для замены выберите «Только Dinox».')}</p>
    <p style={{ padding: '4px 18px 15px', fontSize: 12, lineHeight: 1.6, opacity: .75 }}>{tr("Ctrl+Alt+B возвращает панель Windows. После сбоя замена отключается. Открытие скрытых значков через Windows также возвращает совместимый режим.")}</p>
    {recovered && <p role="status" style={{ padding: '0 18px 15px' }}>{tr("После сбоя включён совместимый режим. Замена панели отключена до повторного выбора.")}</p>}
    {error && <p role="alert">{trError(error)}</p>}
  </div>;
}
