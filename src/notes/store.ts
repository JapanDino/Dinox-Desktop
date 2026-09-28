import {useSyncExternalStore} from 'react';
import {newNote,validateNote,type StickyNote} from './model';

const DB='dinox-sticky-notes',RECOVERY='dinox-sticky-recovery:';
type Pending={note:StickyNote;expected:number;failed?:boolean};
type Snapshot={notes:StickyNote[];loaded:boolean;error:string;saving:boolean;unsaved:boolean};
let snapshot:Snapshot={notes:[],loaded:false,error:'',saving:false,unsaved:false};
const committed=new Map<string,StickyNote>(),pending=new Map<string,Pending>(),listeners=new Set<()=>void>();
let database:Promise<IDBDatabase>|null=null,loading:Promise<void>|null=null,working=false;
const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('dinox-sticky-notes'):null;
function notify(error=snapshot.error){snapshot={...snapshot,notes:[...new Map([...committed,...[...pending].map(([id,p])=>[id,p.note] as const)]).values()],error,saving:working,unsaved:pending.size>0};listeners.forEach(f=>f());}
function db(){return database??=(new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>{request.result.createObjectStore('notes',{keyPath:'id'});request.result.createObjectStore('meta');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Database blocked'));}).catch(error=>{database=null;throw error;}));}
async function readAll(){const database=await db();return new Promise<StickyNote[]>((resolve,reject)=>{const request=database.transaction('notes').objectStore('notes').getAll();request.onsuccess=()=>{try{resolve(request.result.map(validateNote));}catch(error){reject(error);}};request.onerror=()=>reject(request.error);});}
async function commit(item:Pending){const database=await db();return new Promise<StickyNote>((resolve,reject)=>{const tx=database.transaction('notes','readwrite'),store=tx.objectStore('notes');let result:StickyNote,conflict=false;const request=store.get(item.note.id);request.onsuccess=()=>{if((request.result?.revision??0)!==item.expected){conflict=true;tx.abort();return;}result={...item.note,revision:item.expected+1};store.put(result);};tx.oncomplete=()=>resolve(result!);tx.onabort=()=>reject(new Error(conflict?'conflict':'storage'));tx.onerror=()=>{};});}
async function migrate(){const database=await db();let legacy:string|null=null;
  try{const raw=localStorage.getItem('dinox-widget-note-data');if(raw!==null){const parsed=JSON.parse(raw);if(typeof parsed!=='string')throw new Error();legacy=parsed;}}catch{notify('migration');return;}
  await new Promise<void>((resolve,reject)=>{const tx=database.transaction(['notes','meta'],'readwrite'),meta=tx.objectStore('meta');const request=meta.get('legacy-migrated');request.onsuccess=()=>{if(!request.result){if(legacy){const note={...newNote(legacy),id:'legacy-v1',revision:1};tx.objectStore('notes').put(note);}meta.put(true,'legacy-migrated');}};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});
}
async function refresh(){const rows=await readAll();committed.clear();rows.forEach(n=>committed.set(n.id,n));notify();}
export async function loadNotes(){if(loading)return loading;loading=(async()=>{try{await migrate();await refresh();
    for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith(RECOVERY))continue;try{const item=JSON.parse(localStorage.getItem(key)!);validateNote(item.note);if(!Number.isInteger(item.expected))throw new Error();const saved=committed.get(item.note.id);if(saved&&saved.updated===item.note.updated&&JSON.stringify(saved.doc)===JSON.stringify(item.note.doc)&&saved.title===item.note.title&&saved.color===item.note.color&&saved.pinned===item.note.pinned&&saved.deletedAt===item.note.deletedAt&&saved.source===item.note.source)continue;pending.set(item.note.id,item);}catch{notify('recovery');}}
    snapshot={...snapshot,loaded:true};notify();void drain();
  }catch{notify('load');loading=null;}})();return loading;}
async function drain(){if(working)return;working=true;notify();
  for(const [id,item] of pending){if(item.failed)continue;try{const saved=await commit(item);committed.set(id,saved);const latest=pending.get(id);if(latest===item){pending.delete(id);try{localStorage.removeItem(RECOVERY+id);}catch{}}else if(latest){latest.expected=saved.revision;persistRecovery(latest);}channel?.postMessage(id);}
    catch(error){const latest=pending.get(id);if(latest)latest.failed=true;notify(error instanceof Error&&error.message==='conflict'?'conflict':'save');}}
  working=false;notify(pending.size?snapshot.error:snapshot.error==='migration'||snapshot.error==='recovery'?snapshot.error:'');
  if([...pending.values()].some(p=>!p.failed))void drain();
}
function persistRecovery(item:Pending){try{localStorage.setItem(RECOVERY+item.note.id,JSON.stringify(item));}catch{/* IndexedDB still saves; failure is reported if that write also fails. */}}
export function saveNote(note:StickyNote){validateNote(note);const old=pending.get(note.id);const item={note:{...note,updated:Date.now()},expected:old?.expected??committed.get(note.id)?.revision??0,failed:old?.failed};pending.set(note.id,item);persistRecovery(item);notify();void drain();}
export function retryNotes(){if(!snapshot.loaded){void loadNotes();return;}pending.forEach(p=>p.failed=false);void drain();}
export function waitForNotes(id?:string):Promise<void>{return new Promise((resolve,reject)=>{let timer:ReturnType<typeof setTimeout>;const check=()=>{const items=[...pending.entries()].filter(([key])=>!id||id===key);if(!items.length){clearTimeout(timer);listeners.delete(check);resolve();}else if(items.some(([,p])=>p.failed)){clearTimeout(timer);listeners.delete(check);reject(new Error('Unsaved changes'));}};timer=setTimeout(()=>{listeners.delete(check);reject(new Error('Save timeout'));},5000);listeners.add(check);check();});}
export function duplicateNote(note:StickyNote){const copy={...note,id:crypto.randomUUID(),created:Date.now(),updated:Date.now(),revision:0,deletedAt:null};saveNote(copy);return copy;}
export function resolveAsCopy(id:string){const item=pending.get(id);if(!item)return null;const copy=duplicateNote(item.note);pending.delete(id);try{localStorage.removeItem(RECOVERY+id);}catch{}void refresh();notify();return copy;}
export async function deletePermanently(ids:string[]){if(ids.some(id=>pending.has(id)))throw new Error('Save pending');const database=await db();await new Promise<void>((resolve,reject)=>{const tx=database.transaction('notes','readwrite'),store=tx.objectStore('notes');for(const id of ids){const r=store.get(id);r.onsuccess=()=>{if(!r.result?.deletedAt||r.result.revision!==committed.get(id)?.revision){tx.abort();return;}store.delete(id);};}tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error('Delete failed'));});ids.forEach(id=>committed.delete(id));notify();channel?.postMessage('delete');}
channel?.addEventListener('message',()=>{void refresh().catch(()=>notify('load'));});
function subscribe(callback:()=>void){listeners.add(callback);if(snapshot.error!=='load')void loadNotes();return()=>{listeners.delete(callback);};}
export function useNotes(){return useSyncExternalStore(subscribe,()=>snapshot);}
