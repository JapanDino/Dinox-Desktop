import {useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {RefreshCw,X,ExternalLink} from 'lucide-react';
import {ProviderLogo,CodexProviderIcon,ClaudeProviderIcon} from './ProviderLogo';
import {tx} from '../desktopText';
import {locale} from '../i18n/core';
import {SettingRow} from '../settings/SettingRow';
import {useDialogFocus} from '../hooks/useDialogFocus';
import {remaining,stale,summary,usableWindow,type ProviderLimits} from './model';
import {useAiLimits} from './useAiLimits';
import './limits.css';
import './help.css';
export type LimitsModel=ReturnType<typeof useAiLimits>;
const name=(p:ProviderLimits)=>p.provider==='codex'?'Codex':'Claude';
function actionError(error:unknown) {
 const code=String(error);
 const messages:Record<string,string>={
  codex_missing:tx('Установите официальный Codex CLI и повторите подключение.','Install the official Codex CLI and try connecting again.'),
  codex_busy:tx('Подождите завершения обновления Codex и повторите.','Wait for the Codex refresh to finish and try again.'),
  login_timeout:tx('Вход не завершён за 5 минут. Попробуйте подключиться снова.','Sign-in was not completed within 5 minutes. Try connecting again.'),
  claude_settings_changed:tx('Настройка Claude Code изменена вне Dinox. Она сохранена; автоматическое восстановление отменено.','Claude Code settings changed outside Dinox. They were preserved; automatic restoration was cancelled.'),
  invalid_data:tx('Файл источника повреждён. Существующие настройки сохранены.','The source file is invalid. Existing settings were preserved.'),
 };
 return messages[code]??tx('Не удалось подключить источник. Проверьте установку и повторите попытку.','Could not connect the source. Check the installation and try again.');
}
function windowName(w:ProviderLimits['windows'][number]) {
 if(w.minutes===300)return tx('5 часов','5 hours');
 if(w.minutes===10080)return tx('Неделя','Weekly');
 if(w.minutes!==null)return w.minutes%60===0?`${w.minutes/60} ${tx('ч','h')}`:`${w.minutes} ${tx('мин','min')}`;
 return w.label;
}
function message(p:ProviderLimits) {
 if(p.error==='login_required')return tx('Подключите аккаунт Codex.','Connect your Codex account.');
 if(p.error)return tx('Не удалось обновить. Последние данные сохранены.','Could not refresh. Last known data is retained.');
 if(!p.available)return p.provider==='codex'?tx('Установите официальный Codex CLI для подключения.','Install the official Codex CLI to connect.'):tx('Подключите передачу лимитов из Claude Code в настройках.','Connect Claude Code usage reporting in settings.');
 if(!p.windows.length)return p.provider==='claude'?tx('Откройте Claude Code и получите первый ответ. Лимиты передаются для Pro/Max.','Open Claude Code and receive the first reply. Limits are provided for Pro/Max.'):tx('Этот аккаунт пока не передал данные о лимитах.','This account has not provided quota data yet.');
 if(stale(p))return p.provider==='claude'?tx('Данные устарели. Claude обновляется во время работы Claude Code.','Data is stale. Claude updates while Claude Code is in use.'):tx('Данные устарели. Обновите лимиты.','Data is stale. Refresh usage limits.');
 return '';
}
export function LimitsChip({limits,onOpen}: {limits:ProviderLimits;onOpen:()=>void}) {
 return <button className="ai-limits-chip" type="button" onClick={e=>{e.stopPropagation();onOpen();}} aria-label={`${name(limits)}: ${tx('остаток лимита','quota remaining')} ${summary(limits)}`} title={tx('Остаток в самом ограничивающем лимите. Нажмите для подробностей.','Remaining in the tightest quota window. Click for details.')}><ProviderLogo provider={limits.provider} size={14}/><span>{name(limits)}</span><strong>{summary(limits)}</strong></button>;
}
export function AiLimitsPanel({model,onClose}: {model:LimitsModel;onClose:()=>void}) {
 const ref=useRef<HTMLElement>(null);useDialogFocus(ref,true,onClose);
 return <section ref={ref} className="ai-limits-panel" role="dialog" aria-label={tx('Лимиты AI','AI usage limits')} onWheel={e=>e.stopPropagation()}>
  <header><strong>{tx('Лимиты AI','AI usage limits')}</strong><button type="button" aria-label={tx('Обновить лимиты','Refresh limits')} disabled={model.busy} onClick={()=>void model.refresh(true)}><RefreshCw size={15}/></button><button type="button" aria-label={tx('Закрыть лимиты','Close limits')} onClick={onClose}><X size={16}/></button></header>
  <div className="ai-limits-scroll">{(['codex','claude'] as const).filter(id=>model[id]).map(id=>{const p=model.snapshot[id];return <article key={id}>
   <h3><ProviderLogo provider={id} size={24}/><span className="ai-provider-heading"><span>{name(p)}</span><small>{id==='codex'?tx('через ChatGPT','via ChatGPT'): 'Claude Code'}</small></span></h3>
   {message(p)&&<p className="ai-limits-hint" role="status">{message(p)}</p>}
   {p.windows.map(w=>{const expired=!usableWindow(w);return <div className={`ai-quota ${stale(p)||expired||p.error?'ai-quota-stale':''}`} key={w.id}>
    <div><span>{windowName(w)}{w.label&&w.label!==w.id&&w.minutes!==null?` · ${w.label}`:''}</span><strong>{expired?tx('Ожидает обновления','Awaiting refresh'):`${remaining(w)}% ${tx('осталось','remaining')}`}</strong></div>
    <progress value={expired?0:remaining(w)} max={100} aria-label={`${name(p)} ${windowName(w)}: ${tx('остаток','remaining')}`}/>
    <small>{w.resets!==null?`${tx('Сброс','Resets')}: ${new Date(w.resets*1000).toLocaleString(locale(),{weekday:'short',hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'})}`:tx('Время сброса не передано','Reset time unavailable')}</small>
   </div>;})}
   {p.checked!==null&&(stale(p)||p.error)&&<small className="ai-limits-checked">{tx('Последние данные','Last data')}: {new Date(p.checked*1000).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'})}</small>}
  </article>;})}
  {model.error&&<p role="alert">{tx('Источник лимитов недоступен. Попробуйте обновить.','Usage source unavailable. Try refreshing.')}</p>}
  <details className="ai-limits-help"><summary>{tx('Какие лимиты показаны','About these quotas')}</summary><p>{tx('Codex показывает лимиты работы в Codex через подписку ChatGPT. Claude — данные Claude Code. Отсутствующие данные не означают 0%.','Codex reports Codex quotas through your ChatGPT subscription. Claude shows Claude Code data. Missing data does not mean 0%.')}</p></details></div>
 </section>;
}
export function AiLimitsSettings() {
 const model=useAiLimits(true);const [working,setWorking]=useState(false),[error,setError]=useState('');
 async function action(command:string,args?:Record<string,unknown>) {
  setWorking(true);setError('');try{await invoke(command,args);await model.refresh(true);}catch(e){setError(actionError(e));}finally{setWorking(false);}
 }
 return <><div className="setting-group-label">{tx('Лимиты AI','AI usage limits')}</div><div className="setting-group ai-limits-settings">
  <SettingRow icon={CodexProviderIcon} label="Codex / ChatGPT" desc={tx('Остаток короткого и недельного лимита в верхней панели.','Remaining short-term and weekly quotas in the top bar.')}><label className="toggle-switch"><input type="checkbox" checked={model.codex} disabled={working} onChange={e=>{setError('');void model.saveCodex(String(e.target.checked)).catch(()=>setError(tx('Не удалось сохранить','Could not save')));}}/><span className="slider"/></label></SettingRow>
  <div className="ai-source-controls"><span>{model.snapshot.codex.connected?tx('Аккаунт подключён','Account connected'):tx('Вход через ChatGPT','Sign in through ChatGPT')}</span><button type="button" disabled={working} onClick={()=>void action('ai_limits_connect_codex')}>{model.snapshot.codex.connected?tx('Сменить аккаунт','Switch account'):tx('Подключить Codex','Connect Codex')}<ExternalLink size={12}/></button></div>
  <SettingRow icon={ClaudeProviderIcon} label="Claude" desc={tx('Лимиты за 5 часов и неделю из Claude Code.','5-hour and weekly quotas from Claude Code.')}><label className="toggle-switch"><input type="checkbox" checked={model.claude} disabled={working} onChange={e=>{setError('');void model.saveClaude(String(e.target.checked)).catch(()=>setError(tx('Не удалось сохранить','Could not save')));}}/><span className="slider"/></label></SettingRow>
  <div className="ai-source-controls"><span>{model.snapshot.claude.bridge?tx('Передача подключена','Reporting connected'):tx('Источник: Claude Code','Source: Claude Code')}</span><button type="button" disabled={working} onClick={()=>void action('ai_limits_claude_bridge',{enabled:!model.snapshot.claude.bridge})}>{model.snapshot.claude.bridge?tx('Отключить передачу','Disconnect reporting'):tx('Подключить Claude Code','Connect Claude Code')}</button></div>
  <details className="ai-limits-help ai-limits-setup"><summary>{tx('Подключение и обновление','Connection and refresh')}</summary>
   <p>{tx('Для Codex нужен официальный Codex CLI. Вход открывается в браузере; платный API не требуется.','Codex requires the official Codex CLI. Sign-in opens in your browser; no paid API is required.')}</p>
   <p>{tx('Подключение Claude добавляет локальную передачу лимитов в его строку статуса и сохраняет прежнюю настройку. Данные появятся после первого ответа Claude Code.','Connecting Claude adds local usage reporting to its status line and preserves the previous setting. Data appears after the first Claude Code reply.')}</p>
   <p>{tx('Индикатор показывает наименьший остаток. Codex обновляется раз в 5 минут, Claude — во время работы Claude Code.','The indicator shows the lowest remaining quota. Codex refreshes every 5 minutes; Claude refreshes while Claude Code is in use.')}</p>
  </details>
  {(error||model.error)&&<p className="ai-limits-hint" role="alert">{error||tx('Не удалось прочитать источники','Could not read usage sources')}</p>}
 </div></>;
}
