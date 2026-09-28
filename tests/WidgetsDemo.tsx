import {useEffect,useState} from 'react';
import {WidgetBoard} from '../src/widgets/WidgetBoard';
import {StickyWindow} from '../src/notes/StickyNotes';
import {waitForNotes} from '../src/notes/store';
import {usePersonalSetting} from '../src/components/PersonalFeatures';
import {captureShortcut,parseShortcut} from '../src/launcher/shortcut';
export function WidgetsDemo(){
  const [open,setOpen]=useState(true);
  const [note,setNote]=useState<string|null>(null),[noteError,setNoteError]=useState(false);
  useEffect(()=>{const open=(event:Event)=>setNote((event as CustomEvent<string>).detail);window.addEventListener('dinox-demo-note-window',open);return()=>window.removeEventListener('dinox-demo-note-window',open);},[]);
  const [enabled]=usePersonalSetting('dinox-widgets-enabled','true');
  const [shortcut]=usePersonalSetting('dinox-widgets-shortcut','custom:3:87');
  useEffect(()=>{const key=(event:KeyboardEvent)=>{
    if(event.repeat||document.documentElement.dataset.shortcutRecording==='true')return;
    const pressed=captureShortcut(event);
    if(enabled==='true'&&pressed&&JSON.stringify(parseShortcut(pressed))===JSON.stringify(parseShortcut(shortcut))){event.preventDefault();setOpen(value=>!value);}
  };const show=(event:Event)=>setOpen((event as CustomEvent).detail);
  window.addEventListener('keydown',key);window.addEventListener('dinox-demo-widgets',show);
  return()=>{window.removeEventListener('keydown',key);window.removeEventListener('dinox-demo-widgets',show);};},[shortcut,enabled]);
  return <div className="widgets-demo-background"><h2>Ваш рабочий день</h2><p>Панель появляется поверх приложений и скрывается по Esc.</p><button onClick={()=>setOpen(true)}>Открыть панель виджетов</button><p><small>В браузерном демо хоткей работает только внутри этой вкладки.</small></p>
    <div className="widgets-demo-document" aria-hidden="true"><span>Демонстрационный фон · открытый документ</span><h2>План на неделю</h2><p>Идеи для проекта</p><hr/><p>Подготовить материалы к встрече</p><p>Довести презентацию до финальной версии</p><hr/><p>Заметки и наброски</p></div>
    {open&&<div className="widgets-demo-shade" onClick={()=>setOpen(false)}><div className="widgets-demo-window" onClick={e=>e.stopPropagation()}><WidgetBoard onClose={()=>setOpen(false)}/></div></div>}
    {note&&<div style={{position:'fixed',right:20,top:35,width:'min(440px,calc(100vw - 40px))',height:'min(560px,calc(100vh - 70px))',zIndex:1400,boxShadow:'0 20px 80px #000b'}}><StickyWindow id={note} onClose={()=>{void waitForNotes(note).then(()=>{setNote(null);setNoteError(false);}).catch(()=>setNoteError(true));}}/>{noteError&&<p role="alert">Сначала сохраните изменения</p>}</div>}
    <style>{`.widgets-demo-background{padding:32px;min-height:100vh;background:#394451;color:#eee;box-sizing:border-box}.widgets-demo-background p{line-height:1.7}.widgets-demo-background>button{padding:12px;border:1px solid #777;color:#eee;background:#222;border-radius:10px}.widgets-demo-document{position:absolute;right:6vw;top:24vh;width:68vw;height:65vh;padding:40px;background:#ece9e2;color:#31363b;box-sizing:border-box;border-radius:10px;box-shadow:0 20px 60px #0005;overflow:hidden}.widgets-demo-document span{font-size:12px;color:#555}.widgets-demo-document hr{border:0;border-top:1px solid #bab9b5;margin:28px 0}.widgets-demo-shade{position:fixed;inset:0;z-index:100}.widgets-demo-window{width:100%;height:100%;overflow:hidden}`}</style>
  </div>;
}
