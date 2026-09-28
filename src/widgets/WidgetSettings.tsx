import {useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {PanelsTopLeft,ArrowUp,ArrowDown} from 'lucide-react';
import {usePersonalSetting} from '../components/PersonalFeatures';
import {SearchSettings} from '../settings/SearchSettings';
import {SettingRow} from '../settings/SettingRow';
import {tx} from '../desktopText';
import {widgetCatalog,readWidgetLayout} from './personalModel';
import './widgets.css';

function WidgetChoice({id, ru, en}: {id:string;ru:string;en:string}) {
  const [value, save] = usePersonalSetting(`dinox-widget-${id}`, 'true');
  const [error, setError] = useState(false), [busy,setBusy] = useState(false);
  return <div><label className="widget-choice"><input type="checkbox" checked={value !== 'false'} disabled={busy} onChange={async event => {
    setError(false);setBusy(true);try{await save(String(event.target.checked));}catch{setError(true);}finally{setBusy(false);}
  }}/>{tx(ru,en)}</label>{error && <p role="alert">{tx('Не удалось сохранить', 'Could not save')}</p>}</div>;
}
export function WidgetSettings() {
  const [enabled, save] = usePersonalSetting('dinox-widgets-enabled','false');
  const [backdrop, saveBackdrop] = usePersonalSetting('dinox-widgets-backdrop','70');
  const [layoutRaw,saveLayout]=usePersonalSetting('dinox-widgets-layout','{}');
  const layout=readWidgetLayout(layoutRaw);
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  const updateLayout=async(next:typeof layout)=>{setError('');setBusy(true);try{await saveLayout(JSON.stringify(next));}catch{setError(tx('Не удалось сохранить','Could not save'));}finally{setBusy(false);}};
  return <section className="widget-settings">
    <div className="setting-group-label">{tx('Виджеты поверх окон','Widgets above windows')}</div>
    <div className="setting-group"><SettingRow icon={PanelsTopLeft} label={tx('Панель виджетов','Widget board')}
      desc={tx('Задачи, заметка, проекты, музыка и календарь поверх приложений. Хоткей открывает панель на экране под курсором; Esc скрывает её.','Tasks, notes, projects, music and calendar over your apps. Open on the screen under your pointer with a shortcut; Esc hides the board.')} divider={false}>
      <label className="toggle-switch"><input type="checkbox" aria-label={tx('Включить виджеты','Enable widgets')} checked={enabled==='true'} disabled={busy} onChange={async event=>{
        setError('');setBusy(true);try{await save(String(event.target.checked));}catch{setError(tx('Не удалось сохранить','Could not save'));}finally{setBusy(false);}
      }}/><span className="slider"/></label>
    </SettingRow></div>
    {enabled==='true' && <><SearchSettings target="widgets"/>
    <label className="wb-backdrop-setting"><span>{tx('Затемнение фона','Background dimming')}</span><select className="settings-select" aria-label={tx('Затемнение фона','Background dimming')} value={['45','70','90','100'].includes(backdrop)?backdrop:'70'} disabled={busy} onChange={async event=>{
      setError('');setBusy(true);try{await saveBackdrop(event.target.value);}catch{setError(tx('Не удалось сохранить','Could not save'));}finally{setBusy(false);}
    }}><option value="45">{tx('Лёгкое · 45%','Light · 45%')}</option><option value="70">{tx('Среднее · 70%','Balanced · 70%')}</option><option value="90">{tx('Плотное · 90%','Dense · 90%')}</option><option value="100">{tx('Непрозрачный фон','Opaque background')}</option></select></label>
    <div className="widget-choices">
      {layout.order.map((id,index)=>{const widget=widgetCatalog.find(w=>w.id===id)!;const name=tx(widget.ru,widget.en);return <div className="wb-choice-row" key={id}><WidgetChoice {...widget}/><div>
        <select className="settings-select" aria-label={`${tx('Размер','Size')}: ${name}`} value={layout.wide.includes(id)?'wide':'normal'} disabled={busy} onChange={e=>void updateLayout({...layout,wide:e.target.value==='wide'?[...layout.wide,id]:layout.wide.filter(w=>w!==id)})}><option value="normal">{tx('Обычный','Regular')}</option><option value="wide">{tx('Широкий','Wide')}</option></select>
        {[-1,1].map(direction=><button type="button" key={direction} aria-label={`${direction===-1?tx('Выше','Move up'):tx('Ниже','Move down')}: ${name}`} disabled={busy||index+direction<0||index+direction>=layout.order.length} onClick={()=>{const order=[...layout.order];[order[index],order[index+direction]]=[order[index+direction],order[index]];void updateLayout({...layout,order});}}>{direction===-1?<ArrowUp size={15}/>:<ArrowDown size={15}/>}</button>)}
      </div></div>;})}
    </div><button type="button" className="settings-select" onClick={()=>{setError('');void invoke('widgets_show').catch(()=>setError(tx('Не удалось открыть панель','Could not open the board')));}}>{tx('Открыть виджеты','Open widgets')}</button></>}
    {error && <p role="alert" className="setting-desc">{error}</p>}
  </section>;
}
