import {useEffect,useRef} from 'react';
import {ArrowLeft,ArrowUpRight,ChevronUp,X} from 'lucide-react';
import {tr} from '../i18n/core';
export function TrayPanel({onBack,onClose,onWindows,busy}:{onBack:()=>void;onClose:()=>void;onWindows:()=>void;busy:boolean}){
  const back=useRef<HTMLButtonElement>(null);
  useEffect(()=>{back.current?.focus();window.dispatchEvent(new Event('system-panel-bounds'));},[]);
  return <><header className="bluetooth-heading"><button ref={back} onClick={onBack} aria-label={tr('Назад к быстрым настройкам')}><ArrowLeft size={18}/></button><strong>{tr('Скрытые значки')}</strong><button onClick={onClose} aria-label={tr('Закрыть скрытые значки')}><X size={18}/></button></header>
    <div className="bluetooth-power"><ChevronUp size={24}/><strong>{tr('Фоновые приложения')}</strong></div>
    <p className="bluetooth-hint">{tr('Значки фоновых приложений пока обслуживает Windows. Открытие вернёт штатную панель задач и покажет её меню значков.')}</p>
    <button className="bluetooth-add" disabled={busy} onClick={onWindows}>{busy?tr('Открываем…'):tr('Открыть значки Windows')}<ArrowUpRight size={15}/></button>
    <p className="bluetooth-hint">{tr('Вернуться к одной панели можно в настройках Dinox → Док → Только Dinox.')}</p>
  </>;
}
