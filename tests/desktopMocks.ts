import type {AudioDevice} from '../src/system/MixerPanel';
const devices:AudioDevice[]=[{id:'speakers',name:'Studio Speakers',default:true,volume:.64,muted:false,sessions:[{id:'music',name:'Музыка',volume:.76,muted:false},{id:'telegram',name:'Telegram',volume:.38,muted:false},{id:'browser',name:'Браузер',volume:.55,muted:true}]},{id:'headphones',name:'Wireless Headphones',default:false,volume:.42,muted:false,sessions:[]}];
export async function desktopMock(command:string,args:any,settings:Record<string,any>,emit:(name:string,value:unknown)=>void){
 const q=new URLSearchParams(location.search);const done=(value:unknown=null)=>({value});
 if(command==='mixer_snapshot'){if(q.has('mixer-error'))throw 'Audio unavailable';return done(structuredClone(q.has('mixer-empty')?[]:devices));}
 if(command==='mixer_set'||command==='mixer_default_device'){
  await new Promise(resolve=>setTimeout(resolve,100));if(q.has('mixer-write-error'))throw 'Device disconnected';
  const device=devices.find(d=>d.id===args.deviceId);if(!device)throw 'Unknown device';
  if(command==='mixer_default_device')devices.forEach(d=>d.default=d.id===device.id);
  else{const row=args.sessionId?device.sessions.find(s=>s.id===args.sessionId):device;if(!row)throw 'Session closed';if(args.volume!=null)row.volume=args.volume;if(args.muted!=null)row.muted=args.muted;}
  document.documentElement.dataset.mixerCommand=JSON.stringify({command,...args});return done();
 }
 if(command==='launcher_files'){
  await new Promise(resolve=>setTimeout(resolve,args.query==='slow'?900:80));if(q.has('search-error'))throw 'Search unavailable';
  const names=['План проекта.pdf','Заметки по проекту.md','Project notes.txt'];return done(names.filter(name=>args.query==='slow'||name.toLowerCase().includes(args.query.toLowerCase())).map(name=>({name,path:'C:\\Demo\\Documents\\'+name})));
 }
 if(command==='launcher_hotkey_status')return done(!q.has('shortcut-conflict'));
 if(command==='launcher_record_shortcut'){
  if(q.has('capture-error')&&args.recording)throw 'Shortcut service unavailable';
  document.documentElement.dataset.shortcutRecording=String(args.recording);
  return done();
 }
 if(command==='launcher_retry_shortcut'){emit('launcher-shortcut-status',!q.has('shortcut-conflict'));return done();}
 if(command==='launcher_show'){window.dispatchEvent(new CustomEvent('bloom-demo-page',{detail:'search'}));return done();}
 if(command==='launcher_open'){if(q.has('open-error'))throw 'Target unavailable';document.documentElement.dataset.searchOpened=JSON.stringify(args);window.dispatchEvent(new CustomEvent('bloom-demo-action',{detail:args.target}));return done();}
 if(command==='save_layout'){
  if(q.has('save-error'))throw 'Save failed';
  for(const key of Object.keys(args.values))if(q.has('layout-conflict')||JSON.stringify(settings[key]??null)!==JSON.stringify(args.expected[key]??null))throw 'Layout changed in another window';
  Object.assign(settings,args.values);localStorage.setItem('dinox-v4-demo-settings',JSON.stringify(settings));
  for(const [key,value]of Object.entries(args.values))emit('settings-changed',{key,value});
  document.documentElement.dataset.savedLayout=JSON.stringify(args.values);return done();
 }
 return null;
}
