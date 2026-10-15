import type {CalendarAccount} from '../src/calendar/accounts';
import type {RemoteItem} from '../src/calendar/model';
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const item=(id:string,title:string,start:string|null,completed=false):RemoteItem=>({id,title,start,end:null,all_day:true,task:true,completed,description:'Демонстрационная задача · не данные аккаунта',url:''});
const fixture=():CalendarAccount[]=>[{id:'google-demo',provider:'google',label:'Демонстрационный Google',collections:[
 {id:'primary',color:'#4285f4',name:'Личный календарь',kind:'event',writable:true,ics:'',checked:Date.now()/1000,items:[]},
 {id:'readonly',color:'#e67c73',name:'Только чтение',kind:'event',writable:false,ics:'',checked:Date.now()/1000,items:[]},
 {id:'tasks',name:'Мои задачи',kind:'task',writable:true,ics:'',checked:Date.now()/1000,items:[item('due','Подготовить материалы',today()),item('later','Идея без срока',null),item('done','Выполненная задача',today(),true)]}
]}];
let accounts:CalendarAccount[]|null=null;
const operations=new Map<string,unknown>();
export async function calendarSyncMock(command:string,args:any,emit:(name:string,value:unknown)=>void){
 const q=new URLSearchParams(location.search),enabled=q.has('calendar-sync'),done=(value:unknown=null)=>({value});
 if(accounts===null){
  accounts=enabled&&!q.has('calendar-disconnected')?fixture():[];
  if(q.has('calendar-many')&&accounts[0]){
   accounts[0].collections[0].items=[{id:'blue-event',title:'Personal planning',start:today()+'T10:00:00',end:today()+'T11:00:00',all_day:false,task:false,completed:false,description:'Demo',url:''}];
   accounts[0].collections[1].items=[{id:'red-event',title:'Shared workshop',start:today()+'T12:00:00',end:today()+'T13:00:00',all_day:false,task:false,completed:false,description:'Demo',url:''}];
   for(let i=0;i<18;i++)accounts[0].collections.push({id:'demo-'+i,name:'Демонстрационный календарь команды '+(i+1),kind:'event',writable:false,enabled:i<2,ics:'',checked:Date.now()/1000,items:[]});
  }
 }
 if(command==='calendar_accounts')return done(structuredClone(accounts));
 if(command==='calendar_google_config')return done({google:enabled,yandex:false,googleMode:q.has('google-testing')?'testing':'unverified'});
 if(command==='calendar_cancel_auth')return done();
 if(command==='calendar_connect_google'){accounts=fixture();emit('calendars-changed',null);return done(structuredClone(accounts));}
 if(command==='calendar_account_refresh'){if(q.has('calendar-account-offline'))throw 'Google is offline; cached entries are unchanged';return done(structuredClone(accounts));}
 if(command==='calendar_account_remove'){accounts=accounts.filter(a=>a.id!==args.id);emit('calendars-changed',null);return done();}
 if(command==='calendar_collection_enabled'){const c=accounts.find(a=>a.id===args.accountId)?.collections.find(c=>c.id===args.collectionId&&c.kind===args.kind);if(q.has('calendar-visibility-error'))throw 'Cannot save calendar selection';if(c)c.enabled=args.enabled;emit('calendars-changed',null);return done();}
 if(command==='calendar_task_complete'){const i=accounts.find(a=>a.id===args.accountId)?.collections.find(c=>c.id===args.collectionId)?.items.find(i=>i.id===args.id);if(i)i.completed=args.completed;emit('calendars-changed',null);return done();}
 if(command==='calendar_create_item'){
  const d=args.draft;document.documentElement.dataset.calendarDraft=JSON.stringify(d);
  document.documentElement.dataset.calendarWrites=String(Number(document.documentElement.dataset.calendarWrites||0)+1);
  if(q.has('calendar-write-error'))throw 'Rejected: Google HTTP 403. Check calendar permissions.';
  if(q.has('calendar-write-unknown'))throw 'Creation result is uncertain. Check the original calendar.';
  if(operations.has(d.request_id))return done(operations.get(d.request_id));
  const c=accounts.find(a=>a.id===d.account_id)?.collections.find(c=>c.id===d.collection_id&&c.kind===d.kind&&c.writable);if(!c)throw 'Choose a writable calendar or task list';
  c.items.push({id:d.request_id,title:d.title,description:d.description,start:d.start,end:d.end,all_day:d.all_day,task:d.kind==='task',completed:false,url:''});
  const result={saved:true,id:d.request_id};operations.set(d.request_id,result);emit('calendars-changed',null);return done(result);
 }
 return null;
}
