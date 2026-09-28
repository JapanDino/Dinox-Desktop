import type {ProxyStatus} from '../src/telegram/TelegramSettings';
let status:ProxyStatus={enabled:false,available:true,running:false,port:1443,active:0,up:0,down:0,errors:0,ws:0,tcp:0,error:null};
export async function telegramProxyMock(command:string,args:any){
 if(!command.startsWith('telegram_proxy_'))return null;
 const q=new URLSearchParams(location.search);
 status.available=!q.has('proxy-missing');
 if(command==='telegram_proxy_set'){
  if(args.enabled&&q.has('proxy-port-busy'))throw 'port_unavailable';
  if(args.enabled&&!status.available)throw 'helper_missing';
  if(!Number.isInteger(args.port)||args.port<1024||args.port>65535)throw 'invalid_config';
  status={...status,enabled:args.enabled,running:args.enabled,port:args.port,active:0,up:0,down:0,error:null};
 }
 if(command==='telegram_proxy_connect'){
  if(q.has('proxy-no-telegram'))throw 'telegram_missing';
  if(!status.running)throw 'not_running';
  document.documentElement.dataset.proxyConnectRequested='true';
  // A deep link is not proof of connectivity: do not fabricate traffic.
  return {value:null};
 }
 return {value:{...status}};
}
