import {useState} from 'react';
import {Languages} from 'lucide-react';
import {invoke} from '@tauri-apps/api/core';
import {SettingRow} from '../settings/SettingRow';
import {tr,setLanguage} from './core';
import {useAppLanguage} from './useLanguage';
export function LanguageSetting(){
  const language=useAppLanguage();const [error,setError]=useState(false);
  return <><SettingRow icon={Languages} label={tr('Язык интерфейса')} desc={tr('Применяется ко всем окнам Dinox')}>
    <select className="settings-select" aria-label={tr('Язык интерфейса')} value={language} onChange={async e=>{const next=e.target.value;try{await invoke('save_setting',{key:'bloom-language',value:next});setLanguage(next);setError(false);}catch{setError(true);}}}>
      <option value="ru">Русский</option><option value="en">English</option>
    </select>
  </SettingRow>{error&&<p role="alert">{tr('Не удалось изменить язык')}</p>}</>;
}
