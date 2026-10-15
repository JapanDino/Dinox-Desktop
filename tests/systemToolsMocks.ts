// Demo-only fixtures. No Windows endpoint or power policy is accessed here.
const output=(id:string,name:string,selected=false)=>({id,name,default:selected,communications_default:selected,volume:.42,muted:false,controllable:true});
let audio={outputs:[output('speakers','Speakers',true),output('headphones','Studio Headphones')],inputs:[output('internal-mic','Built-in microphone',true),output('usb-mic','USB microphone')],warning:null as string|null};
let power={battery_present:true as boolean|null,battery_percent:76 as number|null,charging:false as boolean|null,plugged_in:false as boolean|null,remaining_minutes:225 as number|null,plans:[{id:'381b4222-f694-41f0-9685-ff5bb260df2e',name:'Сбалансированная',active:true},{id:'a1841308-3541-4fab-bc81-f71556f20b4a',name:'Экономия энергии',active:false}],plans_available:true,warning:null as string|null};
export async function systemToolsMock(command:string,args:any){
 const q=new URLSearchParams(location.search);
 if(command.startsWith('audio_device')){
  if(q.has('audio-error'))throw 'Audio devices could not be read';
  if(command==='audio_devices_snapshot')return {value:q.has('no-hardware')?{outputs:[],inputs:[],warning:null}:structuredClone(audio)};
  if(q.has('audio-save-error'))throw 'Windows did not confirm the audio change';
  const rows=args.kind==='input'?audio.inputs:audio.outputs,target=rows.find(d=>d.id===args.deviceId);if(!target)throw 'Device disconnected';
  if(command==='audio_device_default'){for(const row of rows){row.default=row.id===target.id;if(args.communications)row.communications_default=row.id===target.id;}}
  if(command==='audio_device_set'){if(args.volume!=null)target.volume=args.volume;if(args.muted!=null)target.muted=args.muted;}
  document.documentElement.dataset.audioChange=JSON.stringify(args);
  return {value:structuredClone(audio)};
 }
 if(command==='power_snapshot'||command==='power_set_scheme'){
  if(q.has('power-error'))throw 'Power plans could not be read';
  if(command==='power_set_scheme'){
   if(q.has('power-save-error'))throw 'Windows did not confirm the power plan';
   if(!power.plans.some(p=>p.id===args.schemeId))throw 'Power plan unavailable';
   for(const p of power.plans)p.active=p.id===args.schemeId;document.documentElement.dataset.powerScheme=args.schemeId;
  }
  return {value:q.has('no-hardware')?{...power,battery_present:false,battery_percent:null,remaining_minutes:null}:q.has('power-one-plan')?{...power,plans:power.plans.slice(0,1)}:structuredClone(power)};
 }
 return null;
}
