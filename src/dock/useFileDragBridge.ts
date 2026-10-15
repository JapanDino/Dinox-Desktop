import {useEffect,useRef,useState,type DragEvent} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {tx} from '../desktopText';

/** A navigation bridge only: the source application keeps the drag payload.
 * Never read files, forward paths, start a closed app or accept a dock drop. */
export function useFileDragBridge(reordering:boolean,onError:(message:string)=>void,onHover:(id:string|null)=>void){
 const [active,setActive]=useState(false);
 const activeRef=useRef(false);
 const target=useRef<HTMLElement|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const attempted=useRef<number|null>(null),alive=useRef(true),busy=useRef(false);
 const clearTarget=()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;target.current?.removeAttribute('data-file-drag-target');target.current=null;};
 const end=()=>{clearTarget();attempted.current=null;setActive(false);if(activeRef.current)onHover(null);activeRef.current=false;};
 useEffect(()=>{alive.current=true;const stop=listen('dock-drag-release',end);const cancel=(e:KeyboardEvent)=>{if(e.key==='Escape')end();};window.addEventListener('keydown',cancel);window.addEventListener('dragend',end);return()=>{alive.current=false;clearTarget();window.removeEventListener('keydown',cancel);window.removeEventListener('dragend',end);void stop.then(f=>f());};},[]);
 const isFileDrag=(e:DragEvent)=>!reordering&&Array.from(e.dataTransfer.types).includes('Files');
 const over=(e:DragEvent<HTMLElement>)=>{
  if(!isFileDrag(e))return;
  // Prevent WebView file navigation without consuming or transferring payload.
  e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='none';activeRef.current=true;setActive(true);
  const group=(e.target as HTMLElement).closest<HTMLElement>('[data-drag-app]');onHover(group?.dataset.dragApp??null);
  const element=(e.target as HTMLElement).closest<HTMLElement>('[data-drag-window]');
  const hwnd=Number(element?.dataset.dragWindow);
  if(!element||!Number.isSafeInteger(hwnd)||hwnd<=0){clearTarget();attempted.current=null;return;}
  if(target.current===element)return;
  clearTarget();target.current=element;element.dataset.fileDragTarget='true';
  if(attempted.current===hwnd)return;
  const activate=async()=>{
   if(target.current!==element||!alive.current)return;
   if(busy.current){timer.current=setTimeout(activate,100);return;}
   attempted.current=hwnd;busy.current=true;
   try{await invoke('focus_window',{hwnd,toggle:false});}
   catch{if(alive.current)onError(tx('Не удалось открыть окно для переноса. Используйте Alt + Tab, удерживая файл.','Could not open the destination window. Hold the file and use Alt + Tab.'));}
   finally{busy.current=false;}
  };
  timer.current=setTimeout(activate,650);
 };
 const leave=(e:DragEvent<HTMLElement>)=>{
  const next=e.relatedTarget;
  if(next instanceof Node&&e.currentTarget.contains(next))return;
  const rect=e.currentTarget.getBoundingClientRect();
  if(e.clientX>=rect.left&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom)return;
  end();
 };
 const drop=(e:DragEvent<HTMLElement>)=>{if(isFileDrag(e)){e.preventDefault();e.stopPropagation();end();}};
 return {active,over,leave,drop};
}
