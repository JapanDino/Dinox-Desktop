import {useEffect, useRef, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {Send, ArrowUpRight, ShieldCheck, Activity} from 'lucide-react';
import {tx} from '../desktopText';
import {SettingRow} from '../settings/SettingRow';
import './telegram.css';

export interface ProxyStatus {
  enabled:boolean; available:boolean; running:boolean; port:number;
  active:number; up:number; down:number; errors:number; ws:number; tcp:number; error:string|null;
}
function message(error:unknown):string {
  switch(String(error)) {
    case 'helper_missing': return tx('Компонент прокси отсутствует. Установите сборку Dinox с модулем Telegram.', 'Proxy component is missing. Install a Dinox build with the Telegram module.');
    case 'port_unavailable': return tx('Этот порт занят или недоступен. Выберите другой порт в дополнительных настройках.', 'This port is busy or unavailable. Choose another port in advanced settings.');
    case 'invalid_config': return tx('Не удалось прочитать настройки прокси. Порт должен быть от 1024 до 65535.', 'Could not read proxy settings. The port must be between 1024 and 65535.');
    case 'storage_failed': return tx('Не удалось сохранить или прочитать настройки. Проверьте доступ к профилю Windows.', 'Could not save or read settings. Check access to your Windows profile.');
    case 'telegram_missing': return tx('Не удалось открыть Telegram. Установите Telegram Desktop и повторите подключение.', 'Could not open Telegram. Install Telegram Desktop and try connecting again.');
    case 'not_running': case 'helper_stopped': return tx('Прокси остановился. Нажмите «Запустить снова».', 'The proxy stopped. Select “Start again”.');
    case 'start_timeout': return tx('Запуск занял слишком много времени. Компонент остановлен; можно повторить попытку.', 'Startup timed out. The component was stopped; you can retry.');
    default: return tx('Не удалось выполнить действие. Повторите попытку. Если компонент блокируется защитой Windows, проверьте его — отключать защиту не нужно.', 'The action failed. Try again. If Windows protection blocks the component, review the detection without disabling protection.');
  }
}
const traffic=(bytes:number)=>bytes<1024?`${bytes} B`:bytes<1024**2?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1024**2).toFixed(1)} MB`;

export function TelegramSettings() {
  const [status,setStatus]=useState<ProxyStatus|null>(null);
  const [port,setPort]=useState('1443');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmStop,setConfirmStop]=useState(false),[opened,setOpened]=useState(false);
  const mutating=useRef(false), mounted=useRef(true), initialized=useRef(false);
  useEffect(()=>{
    mounted.current=true;
    let stopped=false, timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      if(!mutating.current&&document.visibilityState!=='hidden'){
        try {
          const next=await invoke<ProxyStatus>('telegram_proxy_status');
          if(!stopped&&!mutating.current){setStatus(next);if(!initialized.current){initialized.current=true;setPort(String(next.port));}}
        } catch(e){if(!stopped&&!mutating.current)setError(message(e));}
      }
      if(!stopped)timer=setTimeout(poll,4000);
    };
    void poll();
    return ()=>{stopped=true;mounted.current=false;clearTimeout(timer);};
  },[]);
  const validPort=/^\d+$/.test(port)&&Number(port)>=1024&&Number(port)<=65535;
  const apply=async(enabled:boolean)=>{
    if(mutating.current)return;
    mutating.current=true;setBusy(true);setError('');setOpened(false);
    try {
      const next=await invoke<ProxyStatus>('telegram_proxy_set',{enabled,port:Number(port)});
      if(mounted.current){setStatus(next);setConfirmStop(false);}
    }catch(e){if(mounted.current)setError(message(e));}
    finally{mutating.current=false;if(mounted.current)setBusy(false);}
  };
  const connect=async()=>{
    if(mutating.current)return;
    mutating.current=true;setBusy(true);setError('');
    try{await invoke('telegram_proxy_connect');if(mounted.current)setOpened(true);}
    catch(e){if(mounted.current)setError(message(e));}
    finally{mutating.current=false;if(mounted.current)setBusy(false);}
  };
  const transferring=!!status?.running&&status.active>0&&status.down>0;
  const title=busy?tx('Применяем…','Applying…'):!status?tx('Проверяем компонент…','Checking component…'):!status.available?tx('Компонент не установлен','Component not installed'):status.running?(transferring?tx('Есть трафик Telegram','Telegram traffic detected'):tx('Прокси запущен','Proxy is running')):status.enabled?tx('Требуется повторный запуск','Restart required'):tx('Выключено','Off');
  return <section className="telegram-settings" aria-label={tx('Прокси Telegram','Telegram proxy')}>
    <div className="telegram-heading"><Send size={22}/><div><h2>Telegram</h2><span>{tx('Экспериментальная функция','Experimental feature')}</span></div></div>
    <p className="telegram-intro">{tx('Помогает Telegram Desktop подключаться через WebSocket. Работает на этом компьютере, без подписки и отдельного аккаунта.', 'Helps Telegram Desktop connect over WebSocket. Runs on this computer, without a subscription or separate account.')}</p>
    <div className="setting-group">
      <SettingRow icon={Send} label={tx('Помогать подключению','Help Telegram connect')} desc={tx('Запускать локальный прокси вместе с Dinox.', 'Start the local proxy with Dinox.')}>
        <label className="toggle-switch"><input type="checkbox" aria-label={tx('Помогать подключению','Help Telegram connect')} checked={status?.enabled??false} disabled={busy||!status||(!status.available&&!status.enabled)||(!status.enabled&&!validPort)} onChange={e=>{if(e.target.checked)void apply(true);else setConfirmStop(true);}}/><span className="slider"/></label>
      </SettingRow>
      <div className="telegram-status" role="status"><span className={`telegram-dot ${status?.running?'is-running':''}`}/><strong>{title}</strong></div>
      {status?.running&&<div className="telegram-actions"><button className="telegram-primary" disabled={busy} onClick={()=>void connect()}>{tx('Подключить Telegram','Connect Telegram')}<ArrowUpRight size={15}/></button><span>{tx('Подтвердите подключение в Telegram один раз.', 'Confirm the connection in Telegram once.')}</span></div>}
      {status?.enabled&&!status.running&&status.available&&<div className="telegram-actions"><button disabled={busy||!validPort} onClick={()=>void apply(true)}>{tx('Запустить снова','Start again')}</button></div>}
      {opened&&<p className="telegram-feedback" role="status">{tx('Запрос передан Telegram. Нажмите «Подключить» в его окне. Открытие окна само по себе ещё не подтверждает соединение.', 'Request sent to Telegram. Select “Connect” in its window. Opening the window does not confirm a connection yet.')}</p>}
      {(error||status?.error)&&<p className="telegram-error" role="alert">{error||message(status?.error)}</p>}
      {status&&!status.available&&<p className="telegram-feedback">{message('helper_missing')}</p>}
      {confirmStop&&<div className="telegram-stop" role="group" aria-label={tx('Отключение прокси','Stop proxy')}><strong>{tx('Сначала отключите прокси в Telegram','First disable the proxy in Telegram')}</strong><p>{tx('Telegram → Настройки → Продвинутые настройки → Тип соединения. Иначе Telegram может остаться без связи после остановки.', 'Telegram → Settings → Advanced → Connection type. Otherwise Telegram may lose connectivity after stopping.')}</p><div className="telegram-actions"><button onClick={()=>setConfirmStop(false)} disabled={busy}>{tx('Отмена','Cancel')}</button><button onClick={()=>void apply(false)} disabled={busy}>{tx('Прокси в Telegram отключён — остановить','Disabled in Telegram — stop')}</button></div></div>}
    </div>
    <div className="telegram-note"><ShieldCheck size={17}/><p>{tx('В этой версии — только серверы Telegram. Сторонние CF-прокси выключены. Системные настройки сети Windows не меняются.', 'This version connects only to Telegram servers. Third-party CF proxies are disabled. Windows system network settings are unchanged.')}</p></div>
    <div className="telegram-note"><Activity size={17}/><p>{tx('Результат зависит от сети. При закрытии Dinox прокси остановится. Если Telegram потеряет связь, отключите прокси в его настройках. Звонки и загрузку медиа нужно проверить в вашей сети.', 'Results depend on your network. Closing Dinox stops the proxy. If Telegram loses connectivity, disable its proxy setting. Calls and media loading need testing on your network.')}</p></div>
    <details className="telegram-details"><summary>{tx('Дополнительные настройки','Advanced settings')}</summary><label>{tx('Локальный порт','Local port')}<input type="number" min={1024} max={65535} value={port} disabled={busy||!!status?.running} onChange={e=>setPort(e.target.value)}/></label>{!validPort&&<p role="alert">{tx('Введите целое число от 1024 до 65535.', 'Enter a whole number from 1024 to 65535.')}</p>}<p>{tx('После смены порта снова нажмите «Подключить Telegram». Автозапуск самого Dinox включается в разделе «Основные».', 'After changing the port, select “Connect Telegram” again. Enable Dinox startup in General settings.')}</p>{status&&<dl><dt>{tx('Локальные соединения','Local connections')}</dt><dd>{status.active}</dd><dt>{tx('Отправлено / получено','Sent / received')}</dt><dd>{traffic(status.up)} / {traffic(status.down)}</dd><dt>{tx('Соединения WebSocket / TCP','WebSocket / TCP connections')}</dt><dd>{status.ws} / {status.tcp}</dd></dl>}<p>{tx('Счётчики обнуляются при запуске. Запущенный процесс не гарантирует доступность Telegram.', 'Counters reset on startup. A running process does not guarantee Telegram is reachable.')}</p></details>
    <p className="telegram-credit">{tx('На основе Flowseal/tg-ws-proxy · MIT. Адаптация Dinox.', 'Based on Flowseal/tg-ws-proxy · MIT. Adapted for Dinox.')}</p>
  </section>;
}
