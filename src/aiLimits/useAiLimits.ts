import {useCallback,useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {emptyLimits,type LimitsSnapshot} from './model';
import {usePersonalSetting} from '../components/PersonalFeatures';
export function useAiLimits(inspect=false) {
 const [codex,saveCodex]=usePersonalSetting('dinox-limits-codex','false');
 const [claude,saveClaude]=usePersonalSetting('dinox-limits-claude','false');
 const [snapshot,setSnapshot]=useState<LimitsSnapshot>({codex:emptyLimits('codex'),claude:emptyLimits('claude')});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(true),pending=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const refresh=useCallback(async(force=false)=>{
  if(pending.current)return;pending.current=true;
  if(alive.current)setBusy(true);
  try {const next=await invoke<LimitsSnapshot>('ai_limits_snapshot',{codex:codex==='true',refresh:force});if(alive.current){setSnapshot(next);setError('');}}
  catch {if(alive.current)setError('unavailable');}
  finally {pending.current=false;if(alive.current)setBusy(false);}
 },[codex]);
 useEffect(()=>{
  if(!inspect&&codex!=='true'&&claude!=='true')return;
  void refresh();const timer=setInterval(()=>void refresh(),60000);
  return()=>clearInterval(timer);
 },[inspect,codex,claude,refresh]);
 return {snapshot,busy,error,refresh,codex:codex==='true',claude:claude==='true',saveCodex,saveClaude};
}
