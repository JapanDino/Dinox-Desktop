import {tr,trError} from '../i18n/core';
import { BloomAppearanceSetting, useBloomAppearance } from '../appearance/BloomAppearance';
import { useEffect, useState, type CSSProperties } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Bell, Folder, Globe, Mail, Settings2, RotateCcw } from 'lucide-react';
import { usePersonalSetting } from './PersonalFeatures';
import { dockDefaults, dockPresets, bloomDockDesign, parseDockDesign, dockVariables, type DockDesign } from '../dockDesign';
import { SettingRow } from '../settings/SettingRow';
import './DockDesign.css';
export function DockDesignPreview({ design: d }: {
    design: DockDesign;
}) { return <div className="dock-design-preview" style={dockVariables(d) as CSSProperties}><div className={`dock-preview-island indicator-${d.indicator}`} style={{ gap: d.gap, padding: d.padding, borderRadius: d.radius }}>{[Folder, Globe, Mail, Bell].map((Icon, i) => <div key={i} className="dock-preview-item"><div style={{ width: d.size, height: d.size, borderRadius: d.iconRadius }}><Icon size={d.size * .57}/></div>{i < 3 && <i />}{d.labels && <small>{[tr("Файлы"), tr("Браузер"), tr("Почта"), tr("События")][i]}</small>}</div>)}</div><span>{tr("Предпросмотр оформления")}</span></div>; }
export function DockDesignSettings() {
    const unified = useBloomAppearance();
    const [raw, save] = usePersonalSetting('bloom-dock-design', JSON.stringify(dockDefaults));
    const [draft, setDraft] = useState(() => parseDockDesign(raw)), [error, setError] = useState('');
    useEffect(() => setDraft(parseDockDesign(raw)), [raw]);
    const commit = async (next: DockDesign) => { setDraft(next); setError(''); try {
        await save(JSON.stringify(next));
        await invoke('sync_appbar');
    }
    catch {
        setError(tr("Не удалось сохранить оформление. Попробуй ещё раз."));
    } };
    const set = (key: keyof DockDesign, value: any) => void commit({ ...draft, [key]: value, preset: 'custom' });
    const ranges: [
        keyof DockDesign,
        string,
        number,
        number,
        string
    ][] = [['size', tr("Размер значков"), 28, 64, 'px'], ['gap', tr("Расстояние"), 2, 20, 'px'], ['padding', tr("Внутренний отступ"), 4, 18, 'px'], ['offset', tr("Отступ от края"), 0, 28, 'px'], ['radius', tr("Скругление панели"), 0, 32, 'px'], ['iconRadius', tr("Скругление плиток"), 0, 22, 'px'], ['opacity', tr("Непрозрачность"), 45, 100, '%'], ['blur', tr("Размытие"), 0, 28, 'px'], ['shadow', tr("Тень"), 0, 60, 'px']];
    return <><div className="setting-group-label">{tr("Оформление панели")}</div><div className="setting-group dock-design-settings"><BloomAppearanceSetting /><DockDesignPreview design={unified ? bloomDockDesign(draft) : draft}/>{!unified && <div className="dock-preset-grid">{[['glass', tr("Стекло")], ['graphite', tr("Графит")], ['light', tr("Светлая")], ['classic', tr("Классика")]].map(([id, label]) => <button key={id} className={draft.preset === id ? 'selected' : ''} onClick={() => void commit(dockPresets[id] as DockDesign)}><span style={{ background: dockPresets[id].background }}/>{tr(label)}</button>)}</div>}
 <div className="dock-range-grid">{ranges.filter(([key]) => !unified || !["opacity", "blur", "shadow"].includes(key)).map(([key, label, min, max, unit]) => <label key={key}><span>{tr(label)}<output>{String(draft[key])} {unit}</output></span><input aria-label={label} type="range" min={min} max={max} value={Number(draft[key])} onChange={e => setDraft({ ...draft, [key]: Number(e.target.value), preset: 'custom' })} onPointerUp={() => void commit(draft)} onKeyUp={() => void commit(draft)} onBlur={() => void commit(draft)}/></label>)}</div>
 {!unified && <SettingRow icon={Settings2} label={tr("Цвета")} desc={tr("Поверхность и акцент")}><div className="dock-color-inputs"><input type="color" aria-label={tr("Цвет поверхности дока")} value={draft.background} onChange={e => set('background', e.target.value)}/><input type="color" aria-label={tr("Акцент дока")} value={draft.accent} onChange={e => set('accent', e.target.value)}/></div></SettingRow>}
 {([['align', tr("Расположение"), [['left', tr("Слева")], ['center', tr("По центру")], ['right', tr("Справа")]]], ['indicator', tr("Открытые приложения"), [['line', tr("Линия")], ['dot', tr("Точка")], ['none', tr("Без индикатора")]]], ['hover', tr("При наведении"), [['lift', tr("Поднять")], ['zoom', tr("Увеличить")], ['none', tr("Без анимации")]]]] as [
        keyof DockDesign,
        string,
        string[][]
    ][]).map(([key, label, options]) => <SettingRow key={key} icon={Settings2} label={label}><select className="settings-select" aria-label={label} value={String(draft[key])} onChange={e => set(key, e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></SettingRow>)}
 {([['labels', tr("Подписи приложений")], ['separators', tr("Разделять группы")], ['showStart', tr("Кнопка \u00ABПуск\u00BB")], ['showBell', tr("Кнопка уведомлений")]] as [
        keyof DockDesign,
        string
    ][]).map(([key, label]) => <SettingRow key={key} icon={Settings2} label={label}><label className="toggle-switch"><input type="checkbox" aria-label={label} checked={Boolean(draft[key])} onChange={e => set(key, e.target.checked)}/><span className="slider"/></label></SettingRow>)}
 <div className="dock-design-bottom"><small>{tr("Размер автоматически уменьшается, если значки не помещаются. Перетаскивай закреплённые приложения для сортировки; правый клик — своя иконка и другие действия.")}</small><button onClick={() => void commit(dockDefaults)}><RotateCcw size={13}/>{tr("Сбросить оформление")}</button></div>{error && <p role="alert" className="personal-error">{trError(error)}</p>}</div></>;
}
