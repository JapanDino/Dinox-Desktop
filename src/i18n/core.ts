import {pairs} from './catalog';
export type Language='ru'|'en';
let language:Language=typeof localStorage!=='undefined'&&localStorage.getItem('bloom-language')==='en'?'en':'ru';
const listeners=new Set<()=>void>();
const dictionary=new Map<string,[string,string]>();
for(const pair of pairs)for(const text of pair)dictionary.set(text,pair);
export const getLanguage=()=>language;
export const locale=()=>language==='ru'?'ru-RU':'en-US';
export function setLanguage(next:unknown){
  const value:Language=next==='en'?'en':'ru';
  if(typeof document!=='undefined')document.documentElement.lang=value;
  if(typeof localStorage!=='undefined')localStorage.setItem('bloom-language',value);
  if(language!==value){language=value;for(const listener of listeners)listener();}
}
export function subscribeLanguage(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function tr(text:string,...args:unknown[]):string {
  const pair=dictionary.get(text);
  const translated=pair?pair[language==='ru'?0:1]:text;
  return args.length?translated.replace(/\{(\d+)\}/g,(token,index)=>Number(index)<args.length?String(args[Number(index)]):token):translated;
}
// Only call for application errors, never for event, track, or notification content.
export function trError(error:unknown):string {
  const text=(error instanceof Error?error.message:String(error)).replace(/^Error:\s*/,'');const direct=tr(text);
  if(direct!==text||dictionary.has(text))return direct;
  for(const [ru,en] of pairs){
    for(const pattern of [ru,en]){
      if(!pattern.includes('{'))continue;
      const escaped=pattern.replace(/[.*+?^$()|[\]\\]/g,'\\$&').replace(/\{\d+\}/g,'(.*?)');
      const match=new RegExp('^'+escaped+'$').exec(text);
      if(match)return tr(ru,...match.slice(1));
    }
  }
  return text;
}
