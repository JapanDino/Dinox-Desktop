import {tx} from '../desktopText';
export function ShortcutConnection({shortcut,available,pending=false,recording=false,checkFailed=false}:{shortcut:string;available:boolean|null;pending?:boolean;recording?:boolean;checkFailed?:boolean}){
 const state=pending?'pending':recording?'recording':shortcut==='off'?'disabled':checkFailed?'unverified':available===null?'unknown':available?'active':'unavailable';
 const label=state==='pending'?tx('Сохраняем сочетание…','Saving shortcut…'):state==='recording'?tx('Идёт запись сочетания','Recording shortcut'):state==='disabled'?tx('Горячая клавиша отключена','Shortcut is disabled'):state==='unverified'?tx('Не удалось проверить сочетание','Could not check shortcut registration'):state==='unknown'?tx('Проверяем подключение…','Checking registration…'):state==='active'?tx('Сочетание подключено','Shortcut is registered'):tx('Сочетание занято или недоступно','Shortcut is occupied or unavailable');
 return <span className="shortcut-connection" data-state={state} role="status" aria-live="polite">{label}</span>;
}
