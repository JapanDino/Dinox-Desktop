import {useEffect,useSyncExternalStore} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {getLanguage,setLanguage,subscribeLanguage} from './core';
export function useAppLanguage(){
  const language=useSyncExternalStore(subscribeLanguage,getLanguage,getLanguage);
  useEffect(()=>{
    let active=true,revision=0;
    const unlisten=listen<{key:string;value:unknown}>('settings-changed',({payload})=>{
      if(payload.key==='bloom-language'){revision++;setLanguage(payload.value);}
    });
    invoke<Record<string,unknown>>('load_settings').then(settings=>{if(active&&revision===0)setLanguage(settings['bloom-language']);}).catch(()=>{});
    return()=>{active=false;void unlisten.then(fn=>fn());};
  },[]);
  return language;
}
