import {useEffect, useRef, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {Search} from 'lucide-react';
import {usePersonalSetting} from '../components/PersonalFeatures';
import {tx} from '../desktopText';
import {SettingRow} from './SettingRow';
import {captureShortcut, shortcutLabel} from '../launcher/shortcut';
import {ShortcutConnection} from './ShortcutConnection';
import './searchSettings.css';

export function SearchSettings({target = 'search'}: {target?: 'search' | 'widgets'} = {}) {
  const widgets = target === 'widgets';
  const title = widgets ? tx('Панель виджетов', 'Widget board') : tx('Поиск Dinox', 'Dinox search');
  const label = widgets ? tx('Горячая клавиша виджетов', 'Widgets shortcut') : tx('Горячая клавиша поиска', 'Search shortcut');
  const prefix = widgets ? 'widgets' : 'launcher';
  const [shortcut, saveShortcut] = usePersonalSetting(widgets ? 'dinox-widgets-shortcut' : 'dinox-search-shortcut', widgets ? 'custom:3:87' : 'alt-space');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [candidate, setCandidate] = useState('');
  const [captureError, setCaptureError] = useState('');
  const captureButton = useRef<HTMLButtonElement>(null);
  const captureActive = useRef(false);

  const finishRecording = async () => {
    captureActive.current = false;
    setRecording(false);
    try { await invoke('launcher_record_shortcut', {recording:false}); }
    catch { setError(tx('Не удалось завершить запись. Нажмите «Подключить повторно» или откройте настройки снова.','Could not finish recording. Retry the shortcut or reopen settings.')); }
  };
  useEffect(() => () => {
    if(captureActive.current){captureActive.current=false;void invoke('launcher_record_shortcut', {recording:false}).catch(console.error);}
  }, []);
  useEffect(() => {
    if (!recording) return;
    captureButton.current?.focus();
    const cancel = () => { void finishRecording(); };
    window.addEventListener('blur', cancel);
    const timer = window.setTimeout(cancel, 55000);
    return () => { window.removeEventListener('blur', cancel); window.clearTimeout(timer); };
  }, [recording]);

  const save = async (next:string) => {
    if(saving)return false;
    const previousAvailability=available;
    setSaving(true); setError('');setAvailable(null);
    try { await saveShortcut(next); return true; }
    catch { setAvailable(previousAvailability);setError(tx('Не удалось подтвердить сохранение сочетания. Проверьте текущее значение и попробуйте ещё раз.','Could not confirm that the shortcut was saved. Check the current value and try again.')); return false; }
    finally { setSaving(false); }
  };

  useEffect(() => {
    let active = true;
    let receivedStatus = false;
    const stop = listen<boolean>(`${prefix}-shortcut-status`, ({payload}) => {
      receivedStatus = true;
      if (active) {setCheckFailed(false);setAvailable(payload);}
    });
    void invoke<boolean>(`${prefix}_hotkey_status`).then(value => {
      if (active && !receivedStatus) setAvailable(value);
    }).catch(() => {if(active&&!receivedStatus)setCheckFailed(true);});
    return () => { active = false; void stop.then(unlisten => unlisten()); };
  }, [prefix]);

  return <section id={widgets?'dinox-widgets-shortcut-settings':'dinox-search-settings'} className="search-shortcut-settings" tabIndex={-1} aria-label={title}>
    <div className="setting-group-label">{title}</div>
    <div className="setting-group">
      <SettingRow icon={Search} label={label}
        desc={widgets ? tx('Показывает и скрывает виджеты поверх окон. Применяется сразу.', 'Show and hide widgets above your windows. Changes apply immediately.') : tx('Открывает строку поиска из любого приложения. Применяется сразу.', 'Open search from any app. Changes apply immediately.')} divider={false}>
        <select className="settings-select" aria-label={label}
          value={shortcut} disabled={saving || recording} onChange={event => { void save(event.target.value); }}>
          <option value="alt-space">Alt + Space</option>
          {widgets && <option value="custom:3:87">Ctrl + Alt + W</option>}
          <option value="ctrl-alt-space">Ctrl + Alt + Space</option>
          {shortcut.startsWith('custom:') && !(widgets && shortcut === 'custom:3:87') && <option value={shortcut}>{shortcutLabel(shortcut)}</option>}
          <option value="off">{tx('Без горячей клавиши', 'No shortcut')}</option>
        </select>
      </SettingRow>
      <div className="search-shortcut-status"><ShortcutConnection shortcut={shortcut} available={available} pending={saving} recording={recording} checkFailed={checkFailed}/></div>
      <div className="search-shortcut-editor" onBlur={event => {
        if (recording && !event.currentTarget.contains(event.relatedTarget as Node | null)) void finishRecording();
      }}>
        {!recording ? <button type="button" className="shortcut-button" disabled={saving} onClick={async () => {
          setSaving(true); setError(''); setCandidate(''); setCaptureError('');
          try {
            captureActive.current = true;
            await invoke('launcher_record_shortcut', {recording:true});
            if (captureActive.current) setRecording(true);
          } catch { await finishRecording(); setError(tx('Не удалось начать запись. Попробуйте ещё раз.','Could not start recording. Try again.')); }
          finally { setSaving(false); }
        }}>{tx('Задать своё сочетание…', 'Record custom shortcut…')}</button> : <>
          <button ref={captureButton} type="button" className="shortcut-capture" aria-label={tx('Запись сочетания', 'Record shortcut')} aria-describedby={`${prefix}-shortcut-candidate`}
            onKeyDown={event => {
              if (event.key === 'Tab' && !event.ctrlKey && !event.altKey) return;
              event.preventDefault(); event.stopPropagation();
              if (event.key === 'Escape') { void finishRecording(); return; }
              if (['Control','Alt','Shift','Meta'].includes(event.key) || event.repeat) return;
              const next = captureShortcut(event.nativeEvent);
              setCaptureError(next ? '' : tx('Используйте Ctrl или Alt и клавишу. Системные сочетания, Win, F12 и Ctrl + Alt + B недоступны.', 'Use Ctrl or Alt with a key. System shortcuts, Win, F12 and Ctrl + Alt + B are unavailable.'));
              setCandidate(next ?? '');
            }}>{candidate ? shortcutLabel(candidate) : tx('Нажмите сочетание клавиш…', 'Press a key combination…')}</button>
          <span id={`${prefix}-shortcut-candidate`} className="shortcut-candidate-status" role="status" aria-live="polite">{candidate?tx(`Выбрано сочетание ${shortcutLabel(candidate)}`,`Selected shortcut ${shortcutLabel(candidate)}`):tx('Ожидаем сочетание клавиш','Waiting for a key combination')}</span>
          <div className="shortcut-actions">
            <button type="button" className="shortcut-button shortcut-primary" disabled={!candidate || saving} onClick={async () => {
              if (await save(candidate)) await finishRecording();
            }}>{tx('Сохранить', 'Save')}</button>
            <button type="button" className="shortcut-button" disabled={saving} onClick={() => { void finishRecording(); }}>{tx('Отмена', 'Cancel')}</button>
          </div>
        </>}
        <p className="setting-desc">{recording
          ? tx('Ctrl и/или Alt + клавиша, при желании Shift. Esc — отмена. Буквы привязаны к клавишам и работают в русской и английской раскладке.', 'Ctrl and/or Alt + a key, optionally Shift. Esc cancels. Letter bindings use physical keys across keyboard layouts.')
          : tx('Можно выбрать своё сочетание с Ctrl или Alt, например Ctrl + Shift + K.', 'Choose your own combination with Ctrl or Alt, for example Ctrl + Shift + K.')}</p>
        {recording && captureError && <p className="setting-desc" role="alert">{captureError}</p>}
      </div>
    </div>
    {error && <p className="search-shortcut-error" role="alert">{error}</p>}
    {!recording && shortcut !== 'off' && (available === false || checkFailed) && <div className="search-shortcut-conflict">
      {available===false&&<p className="setting-desc" role="status">{tx('Windows не удалось подключить сочетание. Обычно оно занято другой программой. Выберите другое или освободите его в той программе.', 'Windows could not register the shortcut. Usually another app owns it. Choose another or free it in that app.')}</p>}
      {available===false && shortcut === 'alt-space' && <p className="setting-desc">{tx('Если открывается PowerToys Run: в PowerToys → Run измените сочетание активации, например на Alt + Shift + Space. Если открывается Copilot — отключите Alt + Space в его настройках. Затем нажмите «Подключить повторно». Dinox не меняет чужие настройки автоматически.', 'If PowerToys Run opens, change its activation shortcut in PowerToys → Run, for example to Alt + Shift + Space. If Copilot opens, turn off Alt + Space in its settings. Then retry below. Dinox never changes other apps’ settings automatically.')}</p>}
      <button type="button" className="shortcut-button" disabled={saving} onClick={() => {
        setError('');setSaving(true);setCheckFailed(false);setAvailable(null);void invoke(`${prefix}_retry_shortcut`).then(()=>invoke<boolean>(`${prefix}_hotkey_status`)).then(setAvailable).catch(() => {setCheckFailed(true);setAvailable(null);setError(tx('Не удалось проверить подключение сочетания. Попробуйте ещё раз.','Could not check shortcut registration. Please retry.'));}).finally(()=>setSaving(false));
      }}>{tx('Подключить повторно', 'Retry shortcut')}</button>
    </div>}
  </section>;
}
