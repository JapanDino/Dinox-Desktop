export async function aiLimitsMock(command:string,args:any) {
 if(!command.startsWith('ai_limits_'))return null;
 const q=new URLSearchParams(location.search),checked=Date.now()/1000;
 const empty=(provider:string)=>({provider,available:false,connected:false,bridge:false,checked:null,windows:[],error:null});
 if(command==='ai_limits_snapshot') {
  const value={codex:empty('codex'),claude:empty('claude')};
  if(q.has('ai-limits-demo'))for(const id of ['codex','claude'] as const)Object.assign(value[id],{available:true,connected:true,bridge:id==='claude',checked:q.has('ai-stale')?checked-3600:checked,error:q.has('ai-error')?'offline':null,windows:q.has('ai-empty')?[]:[{id:'primary',label:'',minutes:300,used:id==='codex'?32:73,resets:checked+3600},{id:'weekly',label:'',minutes:10080,used:id==='codex'?61:44,resets:checked+3*86400}]});
  if(q.has('ai-expired'))(value.codex.windows as any[])[0].resets=checked-1;
  document.documentElement.dataset.aiRefresh=JSON.stringify(args);
  return {value};
 }
 if(command==='ai_limits_connect_codex') {if(q.has('ai-connect-error'))throw 'codex_missing';document.documentElement.dataset.aiConnected='codex';return {value:null};}
 if(command==='ai_limits_claude_bridge') {if(q.has('ai-connect-error'))throw 'storage_failed';document.documentElement.dataset.aiBridge=String(args.enabled);return {value:null};}
 return null;
}
