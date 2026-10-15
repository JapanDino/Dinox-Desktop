import {useEffect,useRef,type RefObject} from 'react';

/** Explicit dialogs receive focus. Background banners only get Escape handling. */
export function useDialogFocus(ref:RefObject<HTMLElement|null>,open:boolean,onClose:()=>void,modal=true) {
  const close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement as HTMLElement|null;
    const fields=()=>Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')??[]).filter(el=>el.getClientRects().length>0);
    if(modal)fields()[0]?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.defaultPrevented)return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current();return;}
      if(!modal||event.key!=='Tab')return;
      const nodes=fields(),first=nodes[0],last=nodes[nodes.length-1];if(!first)return;
      if(!ref.current?.contains(document.activeElement)){event.preventDefault();(event.shiftKey?last:first).focus();}
      else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    window.addEventListener('keydown',key);
    return()=>{window.removeEventListener('keydown',key);if(modal&&previous?.isConnected)previous.focus();};
  },[ref,open,modal]);
}
