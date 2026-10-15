import {useEffect,useRef,type PointerEvent, type RefObject} from 'react';
import {magnification} from './magnification';
export function useMagnification(ref:RefObject<HTMLDivElement|null>,enabled:boolean,vertical:boolean,size:number,gap:number){
 const frame=useRef<number|null>(null),point=useRef({x:0,y:0});
 const reset=()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;ref.current?.querySelectorAll<HTMLElement>('.dock-icon').forEach(el=>el.style.removeProperty('--dock-magnify'));};
 useEffect(()=>{if(!enabled)reset();return reset;},[enabled,size,gap,vertical]);
 const move=(e:PointerEvent)=>{
  if(!enabled||e.pointerType!=='mouse'||e.buttons!==0){reset();return;}
  point.current={x:e.clientX,y:e.clientY};
  if(frame.current!==null)return;
  frame.current=requestAnimationFrame(()=>{
   frame.current=null;
   // Read geometry together before writing styles; at most once per frame.
   const items=Array.from(ref.current?.querySelectorAll<HTMLElement>('.dock-icon')??[]).map(el=>{
    const r=el.getBoundingClientRect();
    const distance=vertical?point.current.y-(r.top+r.height/2):point.current.x-(r.left+r.width/2);
    return {el,value:magnification(distance,size,gap)};
   });
   for(const {el,value} of items)el.style.setProperty('--dock-magnify',String(value));
  });
 };
 return {move,reset};
}
