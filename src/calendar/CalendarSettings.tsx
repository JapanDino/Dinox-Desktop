import {tr,trError,locale} from '../i18n/core';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { CalendarDays, Plus, Trash2, ExternalLink, ChevronDown, Check } from 'lucide-react';
import { SettingRow } from '../settings/SettingRow';
import { usePersonalSetting } from '../components/PersonalFeatures';
import {providers, subscriptionUrl, type Provider} from './subscriptions';
import type { CalendarSource } from './model';
import './calendar.css';
export const colors = ['#b7a6ff', '#8dd6b0', '#92bdff', '#efb782', '#ee99b1', '#c3c8d2'];
export function CalendarSettings() {
    const [sources, setSources] = useState<CalendarSource[]>([]), [name, setName] = useState(''), [url, setUrl] = useState(''), [color, setColor] = useState(colors[0]);
    const [error, setError] = useState(''), [busy, setBusy] = useState(false), [editing, setEditing] = useState<string | null>(null), [help, setHelp] = useState(false);
    const [provider, setProvider] = useState<Provider>('google');
    const [lead, saveLead] = usePersonalSetting('bloom-calendar-reminder', '10');
    const [density, saveDensity] = usePersonalSetting('bloom-calendar-density', 'comfortable');
    const [accent, saveAccent] = usePersonalSetting('bloom-calendar-accent', '#b7a6ff');
    const load = () => invoke<CalendarSource[]>('calendar_list').then(setSources).catch(e => setError(String(e)));
    useEffect(() => { void load(); const stop = listen('calendars-changed', () => void load()); return () => { void stop.then(f => f()); }; }, []);
    const apply = async (task: () => Promise<unknown>) => { setBusy(true); setError(''); try {
        await task();
        await load();
    }
    catch (e) {
        setError(String(e));
    }
    finally {
        setBusy(false);
    } };
    const reset = () => { setName(''); setUrl(''); setEditing(null); setColor(colors[0]); };
    return <div className="calendar-settings">
    <div className="setting-group-label">{tr("Календарь и расписание")}</div>
    <div className="setting-group">
      <div className="cal-connection-intro"><CalendarDays size={22}/><div><strong>{tr("Твоя неделя в Dinox")}</strong><p>{tr("Google, Яндекс, Outlook и другие ICS-подписки. Только просмотр; сохранённые события доступны без интернета.")}</p></div></div>
      {sources.map(s => <div className="cal-source-row" key={s.id}>
        <input type="checkbox" aria-label={tr("Показывать {0}", s.name)} checked={s.enabled} disabled={busy} onChange={e => void apply(() => invoke('calendar_save', { id: s.id, name: s.name, color: s.color, enabled: e.target.checked, url: null }))}/>
        <span className="cal-dot" style={{ background: s.color }}/><button className="cal-source-name" onClick={() => { setEditing(s.id); setName(s.name); setColor(s.color); setUrl(''); }}>{s.name}<small>{s.checked ? tr("Проверен {0}", new Date(s.checked * 1000).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : tr("Ещё не обновлялся")}</small></button>
        <button className="cal-icon-button" aria-label={tr("Удалить календарь {0}", s.name)} disabled={busy} onClick={() => void apply(() => invoke('calendar_remove', { id: s.id })).then(() => { if (editing === s.id)
            reset(); })}><Trash2 size={14}/></button>
      </div>)}
      <form className="cal-source-form" onSubmit={e => { e.preventDefault(); void apply(async () => { await invoke('calendar_save', { id: editing, name, color, enabled: sources.find(s => s.id === editing)?.enabled ?? true, url: url.trim() ? subscriptionUrl(url) : null }); reset(); }); }}>
        <div className="cal-providers" aria-label={tr('Сервис календаря')}>{Object.entries(providers).map(([id, item]) => <button type="button" key={id} aria-pressed={provider === id} onClick={() => { setProvider(id as Provider); setHelp(true); }}>{tr(item.name)}</button>)}</div>
        <p className="cal-provider-note">{tr(providers[provider].help)}</p>
        <label>{tr("Название")}<input aria-label={tr("Название календаря")} maxLength={120} required placeholder={tr("Например, работа")} value={name} onChange={e => setName(e.target.value)}/></label>
        <label>{editing ? tr("Новая ссылка — если нужно заменить") : tr("Ссылка подписки ICS")}<input aria-label={tr("Ссылка подписки ICS")} type="password" autoComplete="off" spellCheck={false} required={!editing} value={url} onChange={e => setUrl(e.target.value)} placeholder={editing ? tr("Оставьте пустой, чтобы сохранить текущую") : providers[provider].placeholder}/></label>
        <div className="cal-form-footer"><div className="cal-swatches" aria-label={tr("Цвет календаря")}>{colors.map(c => <button type="button" key={c} aria-label={tr("Цвет {0}", c)} aria-pressed={color === c} style={{ background: c }} onClick={() => setColor(c)}>{color === c && <Check size={13}/>}</button>)}</div><div>{editing && <button type="button" className="cal-text-button" onClick={reset}>{tr("Отмена")}</button>}<button className="cal-primary" disabled={busy}>{busy ? tr("Подключение…") : editing ? tr("Сохранить") : <><Plus size={13}/>{tr("Подключить")}</>}</button></div></div>
      </form>
      {error && <p role="alert" className="cal-error">{trError(error)}</p>}
      <button className="cal-help-toggle" aria-expanded={help} onClick={() => setHelp(!help)}><ChevronDown size={14} style={{ transform: help ? 'rotate(180deg)' : '' }}/>{tr("Подключение и конфиденциальность")}</button>
      {help && <div className="cal-help"><p>{tr('Вставь ссылку подписки выше, задай название и нажми «Подключить». Повтори для каждого календаря.')}</p><p>{tr('Ссылка даёт доступ к событиям. Dinox хранит её и кэш в защищённом хранилище Windows. Не отправляй ссылку другим людям.')}</p><p>{tr('Файл ICS — разовая копия. Подписка по ссылке получает изменения. Редактирование событий и CalDAV пока не поддерживаются.')}</p>{provider === 'yandex' && <button className="cal-text-button" onClick={() => invoke('calendar_open_link', { url: 'https://yandex.ru/support/yandex-360/customers/calendar/web/ru/data-exchange/export' }).catch(e => setError(String(e)))}><ExternalLink size={13}/>{tr('Инструкция Яндекса')}</button>}</div>}

      <p className="cal-sync-note">{tr("Проверка каждые")}{" "}<strong>{tr("10 минут")}</strong>{tr(", в режиме экономии —")}{" "}<strong>{tr("30 минут")}</strong>{tr(". Можно обновить вручную. После сна проверка возобновляется. Сервис календаря может публиковать изменения с задержкой. Dinox должен быть запущен.")}</p>
      <SettingRow icon={CalendarDays} label={tr("Напоминания")} desc={tr("До начала события; можно отложить на 5 минут")}><select className="settings-select" aria-label={tr("Напоминания")} value={lead} onChange={e => saveLead(e.target.value).catch(e => setError(String(e)))}>{[0, 5, 10, 15, 30].map(n => <option key={n} value={n}>{n ? tr("За {0} мин", n) : tr("Выключены")}</option>)}</select></SettingRow>
      <SettingRow icon={CalendarDays} label={tr("Плотность расписания")} desc={tr("Высота часовых интервалов")}><select className="settings-select" aria-label={tr("Плотность расписания")} value={density} onChange={e => saveDensity(e.target.value).catch(e => setError(String(e)))}><option value="comfortable">{tr("Комфортная")}</option><option value="compact">{tr("Компактная")}</option></select></SettingRow>
      <SettingRow icon={CalendarDays} label={tr("Акцент календаря")} desc={tr("Выбранный день и элементы управления")}><div className="cal-swatches">{colors.map(c => <button key={c} aria-label={tr("Акцент {0}", c)} aria-pressed={accent === c} style={{ background: c }} onClick={() => saveAccent(c).catch(e => setError(String(e)))}>{accent === c && <Check size={13}/>}</button>)}</div></SettingRow>
    </div>
  </div>;
}
