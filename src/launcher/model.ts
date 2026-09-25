export interface AppResult {name:string;path:string;icon?:string|null}
export interface SearchResult {id:string;kind:'app'|'file'|'web'|'command'|'hint'|'calc';name:string;target:string;detail:string;icon?:string|null;symbol?:string}
export function rankApps(apps:AppResult[],query:string):AppResult[]{
 const q=query.trim().toLocaleLowerCase();
 const tokens=q.split(/\s+/).filter(Boolean);
 const score=(name:string)=>{const n=name.toLocaleLowerCase();return n===q?0:n.startsWith(q)?1:tokens.every(t=>n.includes(t))?2:3;};
 const unique=new Map<string,AppResult>();
 for(const app of apps)if(app.path&&(!q||score(app.name)<3)&&!unique.has(app.path.toLowerCase()))unique.set(app.path.toLowerCase(),app);
 return [...unique.values()].sort((a,b)=>score(a.name)-score(b.name)||a.name.localeCompare(b.name)).slice(0,8);
}
export function moveSelection(current:number,delta:number,length:number){return length?((current+delta)%length+length)%length:0;}
export function parseQuery(raw:string){
 const text=raw.trimStart();
 for(const [prefix,scope]of [['!!','recent'],['=','calc'],['?','files'],['.','apps'],['@','commands'],['>','web']] as const){if(text.startsWith(prefix))return {scope,term:text.slice(prefix.length).trim(),prefix,engine:undefined as string|undefined};}
 const web=/^([gyb])\s+(.*)$/is.exec(text);
 if(web)return {scope:'web',term:web[2].trim(),prefix:web[1],engine:({g:'google',y:'yandex',b:'bing'} as Record<string,string>)[web[1].toLowerCase()]};
 return {scope:'all',term:text.trim(),prefix:'',engine:undefined as string|undefined};
}
export function parseRecent(raw:string|null):SearchResult[]{
 try{const value=JSON.parse(raw??'[]');if(!Array.isArray(value))return [];return value.filter((r:any)=>r&&['app','file','command'].includes(r.kind)&&['id','name','target','detail'].every(k=>typeof r[k]==='string'&&r[k].length<=32768)).slice(0,20).map(({id,kind,name,target,detail})=>({id,kind,name,target,detail}));}catch{return [];}
}
export function addRecent(items:SearchResult[],item:SearchResult){return ['app','file','command'].includes(item.kind)?[{id:item.id,kind:item.kind,name:item.name,target:item.target,detail:item.detail},...items.filter(r=>!(r.kind===item.kind&&r.target.toLocaleLowerCase()===item.target.toLocaleLowerCase()))].slice(0,20):items;}
