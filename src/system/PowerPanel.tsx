import {useEffect, useRef, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {ArrowLeft, Battery, BatteryCharging, Check, Leaf, PlugZap, RefreshCw, X} from 'lucide-react';
import {tx} from '../desktopText';
import {usePersonalSetting} from '../components/PersonalFeatures';
import './power.css';

export interface PowerPlan {id:string; name:string; active:boolean}
export interface PowerSnapshot {
  battery_present:boolean|null; battery_percent:number|null; charging:boolean|null;
  plugged_in:boolean|null; remaining_minutes:number|null; plans:PowerPlan[];
  plans_available:boolean; warning:string|null;
}
export function PowerPanel({onBack,onClose}:{onBack:()=>void;onClose:()=>void}) {
  const [snapshot,setSnapshot]=useState<PowerSnapshot|null>(null);
  const [loading,setLoading]=useState(true),[changing,setChanging]=useState<string|null>(null);
  const [error,setError]=useState(''),[details,setDetails]=useState('');
  const [eco,saveEco]=usePersonalSetting('bloom-personal-eco','auto');
  const [savingEco,setSavingEco]=useState(false),[ecoError,setEcoError]=useState('');
  const back=useRef<HTMLButtonElement>(null),alive=useRef(true),busy=useRef(false);
  const refresh=async()=>{
    if(busy.current)return;
    busy.current=true;setLoading(true);
    try {const next=await invoke<PowerSnapshot>('power_snapshot');if(alive.current){setSnapshot(next);setError('');setDetails('');}}
    catch(reason){if(alive.current){setError(tx('Не удалось получить сведения о питании. Попробуйте обновить.','Could not read power information. Try refreshing.'));setDetails(String(reason));}}
    finally {busy.current=false;if(alive.current)setLoading(false);}
  };
  useEffect(()=>{
    alive.current=true;back.current?.focus();void refresh();
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},30_000);
    return()=>{alive.current=false;window.clearInterval(timer);};
  },[]);
  useEffect(()=>{window.dispatchEvent(new Event('system-panel-bounds'));},[snapshot,loading,error,ecoError]);
  const selectPlan=async(plan:PowerPlan)=>{
    if(busy.current||plan.active)return;
    busy.current=true;setChanging(plan.id);setError('');setDetails('');
    try {const next=await invoke<PowerSnapshot>('power_set_scheme',{schemeId:plan.id});if(alive.current)setSnapshot(next);}
    catch(reason){
      // Read back after a failure: an IPC timeout must not leave a speculative selection.
      let current:PowerSnapshot|null=null;
      try {current=await invoke<PowerSnapshot>('power_snapshot');}catch{}
      if(alive.current){setSnapshot(current);setError(tx('Не удалось подтвердить выбранный план. Обновите состояние.','Could not confirm the selected plan. Refresh its state.'));setDetails(String(reason));}
    } finally {busy.current=false;if(alive.current)setChanging(null);}
  };
  const disabled=loading||changing!==null;
  const source=snapshot?.charging===true?tx('Заряжается','Charging'):snapshot?.plugged_in===true?tx('Подключён к питанию','Plugged in'):snapshot?.plugged_in===false?tx('От батареи','On battery'):tx('Источник питания неизвестен','Power source unavailable');
  const time=snapshot?.remaining_minutes;
  const duration=time!=null?(time>=60?`${Math.floor(time/60)} ${tx('ч','h')} ${time%60?`${time%60} ${tx('мин','min')}`:''}`:`${time} ${tx('мин','min')}`):null;
  const hasBattery=snapshot?.battery_present===true;
  const percent=snapshot?.battery_percent;
  return <div className="power-panel-body" aria-busy={disabled}>
    <header className="power-heading"><button ref={back} onClick={onBack} aria-label={tx('Назад к быстрым настройкам','Back to quick settings')}><ArrowLeft size={18}/></button><strong>{tx('Питание','Power')}</strong><button onClick={onClose} aria-label={tx('Закрыть питание','Close power')}><X size={18}/></button></header>
    {snapshot&&<section className="power-battery" aria-label={tx('Состояние питания','Power status')}>
      <span className="power-battery-icon">{snapshot.charging?<BatteryCharging size={28}/>:snapshot.battery_present===false?<PlugZap size={28}/>:<Battery size={28}/>}</span>
      <div><strong>{hasBattery&&percent!=null?`${percent}%`:snapshot.battery_present===false?tx('Питание от сети','External power'):tx('Нет данных о заряде','Charge unavailable')}</strong><span>{source}</span></div>
      {hasBattery&&percent!=null&&<progress max={100} value={percent} aria-label={tx('Заряд батареи','Battery charge')}/>}
      {hasBattery&&<p>{duration?`${tx('Примерно','About')} ${duration} ${tx('до разрядки','remaining')}`:snapshot.charging||snapshot.plugged_in?tx('Оценка времени работы появится при работе от батареи.','Remaining runtime is available when running on battery.'):tx('Windows не сообщает оставшееся время работы.','Windows does not report remaining runtime.')}</p>}
    </section>}
    {error&&<div className="system-error power-error" role="alert"><p>{error}</p>{details&&<details><summary>{tx('Подробности','Details')}</summary>{details}</details>}</div>}
    <div className="power-list-heading"><span>{tx('Планы питания','Power plans')}</span><button disabled={disabled} onClick={()=>void refresh()} aria-label={tx('Обновить питание','Refresh power')}><RefreshCw size={16}/></button></div>
    {loading&&!snapshot?<p className="power-empty" role="status">{tx('Читаем состояние питания…','Reading power information…')}</p>:snapshot?.plans_available&&snapshot.plans.length>0?<>
      <ul className="power-plans">{snapshot.plans.map(plan=><li key={plan.id}><button disabled={disabled} aria-pressed={plan.active} onClick={()=>void selectPlan(plan)}><span><strong>{plan.name}</strong><small>{changing===plan.id?tx('Применение…','Applying…'):plan.active?tx('Используется сейчас','Currently active'):tx('Выбрать этот план','Use this plan')}</small></span>{plan.active&&<Check size={17} aria-hidden="true"/>}</button></li>)}</ul>
      {snapshot.plans.length===1&&<p className="power-hint">{tx('Windows предоставляет только один план на этом компьютере.','Windows provides only one plan on this computer.')}</p>}
    </>:!loading&&<p className="power-empty">{tx('Список планов недоступен. Обновите состояние или проверьте ограничения Windows.','Power plans are unavailable. Refresh or check Windows restrictions.')}</p>}
    {snapshot?.warning&&<p className="power-hint" role="status">{tx('Windows не предоставила часть данных о питании.','Some power information was not provided by Windows.')}</p>}
    <section className="power-eco" aria-label={tx('Экономия ресурсов Dinox','Dinox resource saving')}>
      <div className="power-eco-heading"><Leaf size={17}/><label htmlFor="dinox-power-eco">{tx('Экономия ресурсов Dinox','Dinox resource saving')}</label></div>
      <select id="dinox-power-eco" value={eco} disabled={savingEco} onChange={async event=>{
        const next=event.target.value;setSavingEco(true);setEcoError('');
        try{await saveEco(next);}catch{if(alive.current)setEcoError(tx('Не удалось сохранить режим экономии. Попробуйте ещё раз.','Could not save resource saving. Please try again.'));}
        finally{if(alive.current)setSavingEco(false);}
      }}><option value="auto">{tx('От батареи','On battery')}</option><option value="on">{tx('Всегда','Always')}</option><option value="off">{tx('Выключена','Off')}</option></select>
      <p>{tx('Уменьшает нагрузку самого Dinox: отключает визуализатор и реже обновляет показатели. План Windows не меняется.','Reduces Dinox activity: pauses the visualizer and refreshes metrics less often. Keeps your Windows plan unchanged.')}</p>
      {ecoError&&<p className="system-error" role="alert">{ecoError}</p>}
    </section>
  </div>;
}
