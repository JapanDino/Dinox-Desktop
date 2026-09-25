import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {Search,Globe,File,AppWindow,Command,X,ArrowUpRight,LoaderCircle,Calculator,Settings2,Trash2} from 'lucide-react';
import {useBloomAppearance} from '../appearance/BloomAppearance';
import {usePersonalSetting} from '../components/PersonalFeatures';
import {tx} from '../desktopText';
import {rankApps,moveSelection,parseQuery,parseRecent,addRecent,type AppResult,type SearchResult} from './model';
import {calculate} from './calculator';
import {shortcutLabel as formatShortcut} from './shortcut';
import './launcher.css';
const historyKey='dinox-search-session';
function readRecent(){try{return parseRecent(sessionStorage.getItem(historyKey));}catch{return [];}}
export function Launcher({onClose,onCopy}:{onClose:()=>void;onCopy?:(text:string)=>Promise<void>}){
 useBloomAppearance();
 const [query,setQuery]=useState(''),[apps,setApps]=useState<AppResult[]>([]),[files,setFiles]=useState<AppResult[]>([]),[selected,setSelected]=useState(0),[selectedId,setSelectedId]=useState('');
 const [recent,setRecent]=useState(readRecent);
 const [loading,setLoading]=useState(false),[launching,setLaunching]=useState(false),[error,setError]=useState(''),[fileError,setFileError]=useState(false),[appsError,setAppsError]=useState(false),[hotkey,setHotkey]=useState(true);
 const [shortcut,saveShortcut]=usePersonalSetting('dinox-search-shortcut','alt-space');
 const shortcutLabel=formatShortcut(shortcut)||tx('Поиск','Search');
 useEffect(()=>{const stop=listen<boolean>('launcher-shortcut-status',({payload})=>setHotkey(payload));return()=>{void stop.then(f=>f());};},[]);
 const [engine,saveEngine]=usePersonalSetting('dinox-search-engine','google');
 const {scope,term:q,prefix,engine:queryEngine}=parseQuery(query);
 const effectiveEngine=queryEngine??engine;
 const input=useRef<HTMLInputElement>(null),generation=useRef(0),launchLock=useRef(false);
 const reset=()=>{setQuery('');setFiles([]);setRecent(readRecent());setError('');setSelected(0);setSelectedId('');input.current?.focus();};
 const loadApps=()=>{setAppsError(false);void invoke<AppResult[]>('get_installed_apps').then(setApps).catch(()=>setAppsError(true));};
 useEffect(()=>{loadApps();input.current?.focus();void invoke<boolean>('launcher_hotkey_status').then(setHotkey).catch(()=>setHotkey(false));const stop=listen('launcher-open',()=>{reset();loadApps();});return()=>{generation.current++;void stop.then(f=>f());};},[]);
 useEffect(()=>{
  const id=++generation.current;setFiles([]);setSelected(0);setSelectedId('');setFileError(false);setError('');
  if(q.length<2||!['all','files'].includes(scope)){setLoading(false);return;}
  setLoading(true);const timer=setTimeout(()=>{void invoke<AppResult[]>('launcher_files',{query:q}).then(items=>{if(generation.current===id)setFiles(items);}).catch(()=>{if(generation.current===id)setFileError(true);}).finally(()=>{if(generation.current===id)setLoading(false);});},320);
  return()=>{clearTimeout(timer);generation.current++;};
 },[q,scope]);
 const commands=[{id:'settings',name:tx('Настройки Dinox','Dinox settings')},{id:'calendar',name:tx('Подключения календаря','Calendar connections')},{id:'notifications',name:tx('Уведомления Dinox','Dinox notifications')}];
 const home=!query.trim(),calculation=scope==='calc'?calculate(q):{};
 const hints:SearchResult[]=[
  ['=','Посчитать выражение','Calculate an expression','Например: = (5 × 3) − 2','For example: = (5 × 3) − 2'],
  ['!!','Недавно открытые','Recently opened','Приложения и файлы за этот сеанс','Apps and files from this session'],
  ['?','Найти файлы и папки','Find files and folders','Поиск по именам в индексе Windows','Search names in the Windows index'],
  ['@','Команды Dinox','Dinox commands','Настройки, календарь, уведомления','Settings, calendar, notifications'],
  ['.','Открыть приложение','Open an application','Например: . Telegram','For example: . Telegram'],
  ['>','Искать в интернете','Search the web','Google, Яндекс или Bing','Google, Yandex or Bing']
 ].map(([symbol,ru,en,detailRu,detailEn])=>({id:'hint:'+symbol,kind:'hint',symbol,name:tx(ru,en),detail:tx(detailRu,detailEn),target:symbol+' '}));
 const normal:SearchResult[]=[
  ...(['all','apps'].includes(scope)?rankApps(apps,q).map(a=>({...a,id:'app:'+a.path,kind:'app' as const,target:a.path,detail:tx('Приложение','Application')})):[]),
  ...(['all','commands'].includes(scope)?commands.filter(c=>!q||c.name.toLocaleLowerCase().includes(q.toLocaleLowerCase())).map(c=>({id:c.id,kind:'command' as const,name:c.name,target:c.id,detail:tx('Команда Dinox','Dinox command')})):[]),
  ...(['all','files'].includes(scope)?files.map(f=>({id:'file:'+f.path,kind:'file' as const,name:f.name,target:f.path,detail:f.path})):[]),
  ...(q&&['all','web'].includes(scope)?[{id:'web',kind:'web' as const,name:tx(`Искать «${q}» в интернете`,`Search the web for “${q}”`),target:q,detail:effectiveEngine==='yandex'?tx('Яндекс','Yandex'):effectiveEngine==='bing'?'Bing':'Google'}]:[])
 ];
 const results:SearchResult[]=home?hints:scope==='recent'?recent.filter(r=>!q||r.name.toLocaleLowerCase().includes(q.toLocaleLowerCase())):scope==='calc'?(calculation.value!==undefined?[{id:'calculation',kind:'calc',name:calculation.value,target:calculation.value,detail:tx('Enter — скопировать результат','Enter to copy the result')}]:[]):normal;
 const selectedIndex=results.findIndex(r=>r.id===selectedId);
 const active=selectedIndex>=0?selectedIndex:Math.min(selected,Math.max(0,results.length-1));
 useEffect(()=>{document.getElementById(`launcher-result-${active}`)?.scrollIntoView({block:'nearest'});},[active]);
 const open=async(result?:SearchResult)=>{if(!result||launchLock.current)return;if(result.kind==='hint'){setQuery(result.target);input.current?.focus();return;}launchLock.current=true;setLaunching(true);setError('');try{if(result.kind==='calc')await (onCopy?onCopy(result.target):navigator.clipboard.writeText(result.target));else{await invoke('launcher_open',{kind:result.kind,target:result.target,engine:effectiveEngine});const next=addRecent(recent,result);setRecent(next);try{sessionStorage.setItem(historyKey,JSON.stringify(next));}catch{}}onClose();}catch{setError(result.kind==='calc'?tx('Не удалось скопировать результат.','Could not copy the result.'):tx('Не удалось открыть результат. Файл мог быть перемещён или приложение удалено.','Could not open the result. The file may have moved or the app may have been removed.'));}finally{launchLock.current=false;setLaunching(false);}};
 const emptyTitle=loading?tx('Ищем в индексе Windows…','Searching the Windows index…'):scope==='calc'?(calculation.error==='zero'?tx('На ноль делить нельзя','Cannot divide by zero'):calculation.error==='range'?tx('Выражение слишком велико','Expression is too large'):q?tx('Проверьте выражение','Check the expression'):tx('Введите выражение','Enter an expression')):scope==='recent'?tx('История пуста','No recent results'):scope==='files'&&q.length<2?tx('Введите хотя бы два символа','Enter at least two characters'):tx('Ничего не найдено','No results');
 const emptyHelp=scope==='calc'?tx('Например: = (120 + 80) / 4. Доступны + − × ÷ % ^ и скобки.','Try = (120 + 80) / 4. Supports + − × ÷ % ^ and parentheses.'):scope==='recent'?tx('Здесь появятся открытые приложения и файлы. История хранится только до закрытия Dinox.','Opened apps and files appear here. History lasts only until Dinox closes.'):tx('Попробуйте другое имя. Для интернета начните с >','Try another name. Start with > to search the web.');
 return <main className="dinox-launcher" onKeyDown={e=>{if(e.nativeEvent.isComposing)return;if(e.key==='Escape'){e.preventDefault();onClose();}if(e.target===input.current){if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const next=moveSelection(active,e.key==='ArrowDown'?1:-1,results.length);setSelected(next);setSelectedId(results[next]?.id??'');}if(e.key==='Enter'){e.preventDefault();void open(results[active]);}}}}>
  <header className="launcher-input"><Search size={23}/><input ref={input} maxLength={256} value={query} onChange={e=>setQuery(e.target.value)} role="combobox" aria-label={tx('Поиск Dinox','Dinox search')} aria-controls="launcher-results" aria-expanded={true} aria-autocomplete="list" aria-activedescendant={results.length?`launcher-result-${active}`:undefined} placeholder={tx('Начните вводить…','Start typing…')}/>{loading?<LoaderCircle className="search-spin" size={18}/>:<kbd>{shortcutLabel}</kbd>}<button onClick={onClose} aria-label={tx('Закрыть поиск','Close search')}><X size={18}/></button></header>
  <div className="launcher-section-label">{home?tx('Быстрые команды','Quick commands'):prefix?<><code>{prefix}</code>{({apps:tx('Приложения','Applications'),files:tx('Файлы и папки','Files and folders'),calc:tx('Калькулятор','Calculator'),commands:tx('Команды Dinox','Dinox commands'),recent:tx('Недавно открытые','Recently opened'),web:tx('Поиск в интернете','Web search')} as Record<string,string>)[scope]}</>:tx('Результаты','Results')}</div>
  {error&&<p className="desktop-error" role="alert">{error}</p>}
  {appsError&&<button className="launcher-hint" onClick={loadApps}>{tx('Не удалось загрузить приложения. Повторить','Could not load apps. Retry')}</button>}
  {fileError&&<p className="launcher-hint" role="status">{tx('Поиск файлов Windows недоступен. Проверьте службу и индекс Windows Search. Поиск приложений и интернета работает отдельно.','Windows file search is unavailable. Check the Windows Search service and index. App and web search remain available.')}</p>}
  <div id="launcher-results" className="launcher-results" role="listbox" aria-label={tx('Результаты','Results')} aria-busy={loading}>{results.map((r,i)=>{const Icon=r.kind==='web'?Globe:r.kind==='file'?File:r.kind==='command'?Command:r.kind==='calc'?Calculator:AppWindow;return <div id={`launcher-result-${i}`} key={r.id} role="option" aria-selected={i===active} aria-disabled={launching} tabIndex={-1} className={`${i===active?'selected':''} ${r.kind==='calc'?'calculator-result':''}`} onPointerMove={()=>{setSelected(i);setSelectedId(r.id);}} onMouseDown={e=>e.preventDefault()} onClick={()=>void open(r)}><span className="launcher-result-icon">{r.symbol?<b>{r.symbol}</b>:r.icon?<img src={r.icon} alt=""/>:<Icon size={21}/>}</span><span className="launcher-result-text"><strong>{r.name}</strong><small>{r.detail}</small></span>{i===active?<kbd>↵</kbd>:r.kind==='web'?<ArrowUpRight size={15}/>:null}</div>;})}{!results.length&&<div className="launcher-empty"><Search size={30}/><strong>{emptyTitle}</strong><p>{emptyHelp}</p></div>}</div>
  <footer><span>{launching?tx('Открываем…','Opening…'):tx('↑ ↓ выбрать · Enter выполнить · Esc закрыть','↑ ↓ select · Enter run · Esc close')}</span><details className="launcher-preferences"><summary aria-label={tx("Настройки поиска","Search preferences")}><Settings2 size={17}/></summary><div className="launcher-preferences-body"><select aria-label={tx('Сочетание клавиш','Keyboard shortcut')} value={shortcut} onChange={e=>{void saveShortcut(e.target.value).catch(()=>setError(tx('Не удалось сохранить сочетание','Could not save shortcut')));}}><option value="alt-space">Alt + Space</option>{shortcut.startsWith('custom:')&&<option value={shortcut}>{formatShortcut(shortcut)}</option>}<option value="ctrl-alt-space">Ctrl + Alt + Space</option><option value="off">{tx('Без горячей клавиши','No shortcut')}</option></select><select aria-label={tx('Поисковая система','Search engine')} value={engine} onChange={e=>{void saveEngine(e.target.value).catch(()=>setError(tx('Не удалось сохранить поисковик','Could not save search engine')));}}><option value="google">Google</option><option value="yandex">{tx("Яндекс","Yandex")}</option><option value="bing">Bing</option></select><button onClick={()=>{setRecent([]);try{sessionStorage.removeItem(historyKey);}catch{}}}><Trash2 size={14}/>{tx('Очистить историю','Clear history')}</button><p>{tx('История приложений и файлов — только за текущий сеанс. Интернет-запросы и вычисления не сохраняются.','App and file history lasts for this session only. Web queries and calculations are not saved.')}</p></div></details></footer>
  <p className="launcher-privacy">{tx('Файлы: индекс Windows. Интернет-запрос отправляется только при открытии результата.','Files: Windows index. Web queries are sent only when you open the result.')}{!hotkey&&shortcut!=='off'&&' '+tx('Горячая клавиша занята — используйте поиск в доке.','Shortcut is occupied — use search in the dock.')}</p>
 </main>;
}
