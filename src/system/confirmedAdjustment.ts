/** Serialize device writes; never lose the last input or accept stale polls. */
export function confirmedAdjustment(initial:number, apply:(value:number)=>Promise<number>, render:(value:number)=>void, error:(value:unknown)=>void) {
 let confirmed=initial, requested=initial, revision=0, completed=0, busy=false;
 let timer:ReturnType<typeof setTimeout>|undefined;
 const flush=async()=>{
  if(timer){clearTimeout(timer);timer=undefined;}
  if(busy||completed===revision)return;
  busy=true; const current=revision, value=requested;
  try { confirmed=await apply(value); if(revision===current){render(confirmed);error(null);} }
  catch(e){if(revision===current){render(confirmed);error(e);}}
  finally{completed=current;busy=false;if(revision!==current)void flush();}
 };
 return {
  change(value:number){requested=value;revision++;render(value);error(null);if(timer)clearTimeout(timer);timer=setTimeout(()=>void flush(),80);},
  receive(value:number){if(busy||revision!==completed)return;confirmed=requested=value;render(value);},
  flush,
  cancelTimer(){if(timer){clearTimeout(timer);timer=undefined;}},
 };
}
