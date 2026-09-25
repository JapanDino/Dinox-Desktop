import {useEffect, useRef, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {Search} from 'lucide-react';
import {usePersonalSetting} from '../components/PersonalFeatures';
import {tx} from '../desktopText';
import {SettingRow} from './SettingRow';
import {captureShortcut, shortcutLabel} from '../launcher/shortcut';
import './searchSettings.css';

export function SearchSettings() {
  const [shortcut, saveShortcut] = usePersonalSetting('dinox-search-shortcut', 'alt-space');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [recording, setRecording] = useState(false);
  const [candidate, setCandidate] = useState('');
  const [captureError, setCaptureError] = useState('');
  const captureButton = useRef<HTMLButtonElement>(null);
  const captureActive = useRef(false);

  const finishRecording = async () => {
    captureActive.current = false;
    setRecording(false);
    try { await invoke('launcher_record_shortcut', {recording:false}); }
    catch { setError(true); }
  };
  useEffect(() => () => {
    if (captureActive.current) void invoke('launcher_record_shortcut', {recording:false}).catch(console.error);
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
    setSaving(true); setError(false);
    try { await saveShortcut(next); return true; }
    catch { setError(true); return false; }
    finally { setSaving(false); }
  };

  useEffect(() => {
    let active = true;
    let receivedStatus = false;
    const stop = listen<boolean>('launcher-shortcut-status', ({payload}) => {
      receivedStatus = true;
      if (active) setAvailable(payload);
    });
    void invoke<boolean>('launcher_hotkey_status').then(value => {
      if (active && !receivedStatus) setAvailable(value);
    }).catch(() => {});
    return () => { active = false; void stop.then(unlisten => unlisten()); };
  }, []);

  return <>
    <div className="setting-group-label">{tx('Поиск Dinox', 'Dinox search')}</div>
    <div className="setting-group">
      <SettingRow icon={Search} label={tx('Горячая клавиша поиска', 'Search shortcut')}
        desc={tx('Открывает строку поиска из любого приложения. Применяется сразу.', 'Open search from any app. Changes apply immediately.')} divider={false}>
        <select className="settings-select" aria-label={tx('Горячая клавиша поиска', 'Search shortcut')}
          value={shortcut} disabled={saving || recording} onChange={event => { void save(event.target.value); }}>
          <option value="alt-space">Alt + Space</option>
          <option value="ctrl-alt-space">Ctrl + Alt + Space</option>
          {shortcut.startsWith('custom:') && <option value={shortcut}>{shortcutLabel(shortcut)}</option>}
          <option value="off">{tx('Без горячей клавиши', 'No shortcut')}</option>
        </select>
      </SettingRow>
      <div className="search-shortcut-editor" onBlur={event => {
        if (recording && !event.currentTarget.contains(event.relatedTarget as Node | null)) void finishRecording();
      }}>
        {!recording ? <button type="button" className="settings-select" disabled={saving} onClick={async () => {
          setSaving(true); setError(false); setCandidate(''); setCaptureError('');
          try {
            captureActive.current = true;
            await invoke('launcher_record_shortcut', {recording:true});
            if (captureActive.current) setRecording(true);
          } catch { await finishRecording(); setError(true); }
          finally { setSaving(false); }
        }}>{tx('Задать своё сочетание…', 'Record custom shortcut…')}</button> : <>
          <button ref={captureButton} type="button" className="shortcut-capture" aria-label={tx('Запись сочетания', 'Record shortcut')}
            onKeyDown={event => {
              if (event.key === 'Tab' && !event.ctrlKey && !event.altKey) return;
              event.preventDefault(); event.stopPropagation();
              if (event.key === 'Escape') { void finishRecording(); return; }
              if (['Control','Alt','Shift','Meta'].includes(event.key) || event.repeat) return;
              const next = captureShortcut(event.nativeEvent);
              setCaptureError(next ? '' : tx('Используйте Ctrl или Alt и клавишу. Системные сочетания, Win, F12 и Ctrl + Alt + B недоступны.', 'Use Ctrl or Alt with a key. System shortcuts, Win, F12 and Ctrl + Alt + B are unavailable.'));
              setCandidate(next ?? '');
            }}>{candidate ? shortcutLabel(candidate) : tx('Нажмите сочетание клавиш…', 'Press a key combination…')}</button>
          <div className="shortcut-actions">
            <button type="button" className="settings-select" disabled={!candidate || saving} onClick={async () => {
              if (await save(candidate)) await finishRecording();
            }}>{tx('Сохранить', 'Save')}</button>
            <button type="button" className="settings-select" disabled={saving} onClick={() => { void finishRecording(); }}>{tx('Отмена', 'Cancel')}</button>
          </div>
        </>}
        <p className="setting-desc">{recording
          ? tx('Ctrl и/или Alt + клавиша, при желании Shift. Esc — отмена. Буквы привязаны к клавишам и работают в русской и английской раскладке.', 'Ctrl and/or Alt + a key, optionally Shift. Esc cancels. Letter bindings use physical keys across keyboard layouts.')
          : tx('Можно выбрать своё сочетание с Ctrl или Alt, например Ctrl + Shift + K.', 'Choose your own combination with Ctrl or Alt, for example Ctrl + Shift + K.')}</p>
        {recording && captureError && <p className="setting-desc" role="alert">{captureError}</p>}
      </div>
    </div>
    {error && <p className="setting-desc" role="alert">{tx('Не удалось сохранить сочетание. Попробуйте ещё раз.', 'Could not save shortcut. Try again.')}</p>}
    {!recording && shortcut !== 'off' && available === false && <div className="search-shortcut-conflict">
      <p className="setting-desc" role="status">{tx('Windows не удалось подключить сочетание. Обычно оно занято другой программой. Выберите другое или освободите его в той программе.', 'Windows could not register the shortcut. Usually another app owns it. Choose another or free it in that app.')}</p>
      {shortcut === 'alt-space' && <p className="setting-desc">{tx('Если открывается PowerToys Run: в PowerToys → Run измените сочетание активации, например на Alt + Shift + Space. Если открывается Copilot — отключите Alt + Space в его настройках. Затем нажмите «Подключить повторно». Dinox не меняет чужие настройки автоматически.', 'If PowerToys Run opens, change its activation shortcut in PowerToys → Run, for example to Alt + Shift + Space. If Copilot opens, turn off Alt + Space in its settings. Then retry below. Dinox never changes other apps’ settings automatically.')}</p>}
      <button type="button" className="settings-select" onClick={() => {
        setError(false); void invoke('launcher_retry_shortcut').catch(() => setError(true));
      }}>{tx('Подключить повторно', 'Retry shortcut')}</button>
    </div>}
  </>;
}
