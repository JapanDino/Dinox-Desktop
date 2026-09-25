import {createRoot} from 'react-dom/client';
import {getCurrentWebviewWindow} from '@tauri-apps/api/webviewWindow';
import {Launcher} from './Launcher';
import {invoke} from '@tauri-apps/api/core';
const win=getCurrentWebviewWindow();
const close=()=>{void invoke('launcher_files',{query:''}).catch(()=>{});void win.hide();};
void win.onCloseRequested(event=>{event.preventDefault();close();});
void win.onFocusChanged(({payload})=>{if(!payload)close();});
createRoot(document.getElementById('root')!).render(<Launcher onClose={close}/>);
