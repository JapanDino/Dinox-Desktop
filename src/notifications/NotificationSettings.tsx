import {NotificationConnection} from './NotificationConnection';
import {tr,trError} from '../i18n/core';
import { useBloomAppearance } from '../appearance/BloomAppearance';
import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { Bell, LockKeyhole, Moon, Paintbrush, ChevronDown } from 'lucide-react';
import { usePersonalSetting } from '../components/PersonalFeatures';
import { SettingRow } from '../settings/SettingRow';
import { notificationDefaults, parseNotificationOptions, sampleNotice, type Notice, type NotificationOptions } from './model';
import { NotificationCard } from './NotificationPanel';
export function NotificationSettings() {
    const unified = useBloomAppearance();
    const [raw, save] = usePersonalSetting('bloom-notifications', JSON.stringify(notificationDefaults));
    const o = parseNotificationOptions(raw);
    const [access, setAccess] = useState('checking'), [error, setError] = useState(''), [busy, setBusy] = useState(false), [help, setHelp] = useState(false), [apps, setApps] = useState<Notice[]>([]);
    const pending=useRef(false);
    const refresh = () => invoke<string>('notification_access_status').then(setAccess).catch(() => setAccess('unavailable'));
    useEffect(() => { void refresh(); window.addEventListener('focus',refresh); return()=>window.removeEventListener('focus',refresh); }, []);
    useEffect(() => { if (o.enabled && o.windowsEnabled)
        void invoke<Notice[]>('notification_snapshot').then(setApps).catch(() => { });
    else
        setApps([]); }, [o.enabled, o.windowsEnabled]);
    const update = async (key: keyof NotificationOptions, value: any) => { setError(''); try {
        await save(JSON.stringify({ ...o, [key]: value }));
    }
    catch {
        setError(tr("Не удалось сохранить настройку."));
    } };
    const toggle = async (enabled:boolean) => {
        if(pending.current)return;pending.current=true;setBusy(true);setError('');
        try {
            if(!enabled){await save(JSON.stringify({...o,enabled:false,windowsEnabled:false}));return;}
            let status=await invoke<string>('notification_access_status');
            if(status==='not_requested')status=await invoke<string>('notification_request_access');
            setAccess(status);
            if(status!=='allowed'){
                await save(JSON.stringify({...o,enabled:false,windowsEnabled:false}));
                setError(tr('Уведомления не включены. Причина указана под переключателем.'));
                return;
            }
            await save(JSON.stringify({...o,enabled:true,windowsEnabled:true}));
        } catch(e){setError(trError(e));}
        finally{pending.current=false;setBusy(false);}
    };
    const statusText: Record<string, string> = { checking: tr("Проверка доступности…"), package_required: tr("Компонент уведомлений Windows не зарегистрирован. Установите его вместе с Dinox и перезапустите приложение."), allowed: o.enabled && o.windowsEnabled ? tr("Доступ Windows разрешён. Ниже можно проверить получение сообщений.") : tr("Выключено. Доступ Windows уже разрешён."), denied: tr("Доступ запрещён. Разрешение можно изменить в параметрах конфиденциальности Windows."), not_requested: tr("Windows ещё не запрашивала разрешение."), unavailable: tr("Windows API уведомлений недоступен.") };
    const appList = [...new Map(apps.map(n => [n.app_id, n])).values()];
    return <div className="notification-settings"><div className="setting-group-label">{tr("Уведомления Dinox")}</div><div className="setting-group"><SettingRow icon={Bell} label={tr("Уведомления Dinox")} desc={busy?tr("Ожидание Windows…"):statusText[access] || access}><label className="toggle-switch"><input aria-label={tr("Уведомления Dinox")} type="checkbox" disabled={busy || access==='checking'} checked={o.enabled && o.windowsEnabled && access==='allowed'} onChange={e => void toggle(e.target.checked)}/><span className="slider"/></label></SettingRow><div className="notice-preview"><NotificationCard notice={sampleNotice} options={o}/><small>{tr("Пример оформления \u00B7 не настоящее сообщение")}</small></div></div>
 <NotificationConnection enabled={o.enabled && o.windowsEnabled}/>{unified && <p className="notice-explanation">{tr("Оформление связано с календарём и доком. Отдельные темы доступны, если выключить \u00ABЕдиный стиль Dinox\u00BB в Appearance.")}</p>}
 {o.enabled && <><div className="setting-group-label">{tr("Оформление и поведение")}</div><div className="setting-group">{([['style', tr("Оформление"), [['glass', tr("Стекло")], ['solid', tr("Плотная карточка")], ['minimal', tr("Минимальное")]]], ['privacy', tr("Содержимое"), [['full', tr("Заголовок и текст")], ['title', tr("Только заголовок")], ['hidden', tr("Только приложение")]]]] as [
            keyof NotificationOptions,
            string,
            string[][]
        ][]).filter(([key]) => !unified || key !== "style").map(([key, label, choices]) => <SettingRow key={key} icon={key === 'privacy' ? LockKeyhole : Paintbrush} label={label}><select aria-label={label} className="settings-select" value={String(o[key])} onChange={e => void update(key, e.target.value)}>{choices.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></SettingRow>)}{!unified && <SettingRow icon={Paintbrush} label={tr("Акцент")}><input aria-label={tr("Акцент уведомлений")} type="color" value={o.accent} onChange={e => void update('accent', e.target.value)}/></SettingRow>}<SettingRow icon={Bell} label={tr("Время показа")} desc={tr("На время наведения таймер останавливается")}><select aria-label={tr("Время показа")} className="settings-select" value={o.duration} onChange={e => void update('duration', Number(e.target.value))}>{[4, 8, 12, 20].map(n => <option key={n} value={n}>{n}{" "}{tr("секунд")}</option>)}</select></SettingRow><SettingRow icon={Bell} label={tr("Карточек одновременно")}><select aria-label={tr("Карточек одновременно")} className="settings-select" value={o.maxVisible} onChange={e => void update('maxVisible', Number(e.target.value))}>{[1, 2, 3].map(n => <option key={n}>{n}</option>)}</select></SettingRow><SettingRow icon={Moon} label={tr("Тихие часы")} desc={tr("Без всплывающих карточек; история остаётся доступна")}><label className="toggle-switch"><input aria-label={tr("Тихие часы")} type="checkbox" checked={o.quiet} onChange={e => void update('quiet', e.target.checked)}/><span className="slider"/></label></SettingRow>{o.quiet && <div className="notice-times"><label>{tr("С")}{" "}<input type="time" aria-label={tr("Начало тихих часов")} value={o.quietStart} onChange={e => void update('quietStart', e.target.value)}/></label><label>{tr("До")}<input type="time" aria-label={tr("Конец тихих часов")} value={o.quietEnd} onChange={e => void update('quietEnd', e.target.value)}/></label></div>}<div className="notice-actions"><button onClick={() => void emit('bloom-preview-notification', { ...sampleNotice, created: Date.now() })}>{tr("Показать пример в панели")}</button></div></div>
 </>}<div className="setting-group-label">{tr("Windows и Telegram")}</div><div className="setting-group"><p className="notice-explanation">{tr("С разрешения Windows Dinox читает уведомления других приложений и показывает свои карточки в верхней панели. Текст хранится только в памяти, пока Dinox работает; не отправляется в сеть и не сохраняется в журнал.")}</p><button className="notice-help" aria-expanded={help} onClick={() => setHelp(!help)}><ChevronDown size={14}/>{tr("Как подключить, в том числе Telegram")}</button>{help && <div className="notice-help-body"><ol><li>{tr("Установите Dinox и его компонент уведомлений Windows. После регистрации компонента перезапустите Dinox.")}</li><li>{tr("Включи тумблер «Уведомления Dinox». Если Windows запросит доступ, решение нужно принять в её диалоге.")}</li><li>{tr("В Telegram Desktop открой \u00ABНастройки \u2192 Уведомления и звуки\u00BB и включи \u00ABИспользовать уведомления Windows\u00BB. Название пункта зависит от версии.")}</li><li>{tr("Отправь себе тестовое сообщение с другого устройства. Сначала убедись, что оно появляется в центре уведомлений Windows.")}</li><li>{tr("Чтобы не видеть два баннера, в параметрах уведомлений Windows для нужного приложения отключи только баннеры, оставив уведомления в центре включёнными.")}</li></ol><p>{tr("Собственные всплывающие окна Telegram, которые не попадают в центр Windows, этому API недоступны. Ответы и исходные кнопки остаются в Windows/Telegram. Bloom не меняет эти настройки автоматически.")}</p><p>{tr("Отключение модуля останавливает чтение и очищает его историю из памяти. Чтобы отозвать само разрешение, используй параметры конфиденциальности Windows.")}</p></div>}
 {appList.length > 0 && <div className="notice-app-list"><strong>{tr("Показывать приложения")}</strong>{appList.map(a => <label key={a.app_id}><input type="checkbox" checked={!o.blocked.includes(a.app_id)} onChange={e => void update('blocked', e.target.checked ? o.blocked.filter(id => id !== a.app_id) : [...o.blocked, a.app_id])}/>{a.app_name}</label>)}</div>}
 {o.blocked.filter(id => !appList.some(a => a.app_id === id)).map(id => <button key={id} className="notice-help" onClick={() => void update('blocked', o.blocked.filter(x => x !== id))}>{tr("Разрешить снова:")}{" "}{id}</button>)}</div>{error && <p role="alert" className="notice-error">{trError(error)}</p>}</div>;
}

