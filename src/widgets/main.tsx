import {useCallback,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {getCurrentWebviewWindow} from '@tauri-apps/api/webviewWindow';
import {listen} from '@tauri-apps/api/event';
import {invoke} from '@tauri-apps/api/core';
import {WidgetBoard} from './WidgetBoard';
import {StickyWindow} from '../notes/StickyNotes';
import {waitForNotes} from '../notes/store';
import {tx} from '../desktopText';
import '../Settings.css';

const win=getCurrentWebviewWindow();
function Host() {
  const [visible,setVisible]=useState(false);
  const [error,setError]=useState(false);
  const close=useCallback(()=>{void invoke('widgets_hide').then(()=>{setVisible(false);setError(false);}).catch(()=>setError(true));},[]);
  useEffect(()=>{
    let active=true,revision=0;
    const visibility=listen<boolean>('widgets-visibility',({payload})=>{revision++;if(active)setVisible(payload);});
    void visibility.then(async()=>{const start=revision;const shown=await win.isVisible();if(active&&revision===start)setVisible(shown);});
    const closing=win.onCloseRequested(event=>{event.preventDefault();close();});
    // Hide on loss of focus so a dismissed board never sits above another app.
    const focus=win.onFocusChanged(({payload})=>{if(!payload&&document.documentElement.dataset.notesFilePicker!=='true')close();});
    return()=>{active=false;for(const stop of [visibility,closing,focus])void stop.then(f=>f());};
  },[close]);
  return visible?<><WidgetBoard onClose={close}/>{error&&<div role="alert" className="wb-close-error">{tx('Не удалось скрыть панель. Попробуйте ещё раз.','Could not hide the board. Please try again.')}<button onClick={close}>{tx('Закрыть','Close')}</button></div>}</>:null;
}
function NoteHost({id}:{id:string}){
  const [error,setError]=useState(false);
  const close=useCallback(()=>{void waitForNotes(id).then(()=>invoke('notes_close_window')).catch(()=>setError(true));},[id]);
  useEffect(()=>{const stop=win.onCloseRequested(event=>{event.preventDefault();close();});return()=>{void stop.then(f=>f());};},[close]);
  return <><StickyWindow id={id} onClose={close}/>{error&&<div role="alert">{tx('Сначала сохраните изменения или создайте копию.','Save your changes or create a copy first.')}</div>}</>;
}
const noteId=new URLSearchParams(location.search).get('note');
createRoot(document.getElementById('root')!).render(noteId?<NoteHost id={noteId}/>:<Host/>);
