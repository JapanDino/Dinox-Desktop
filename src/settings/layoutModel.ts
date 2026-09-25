import {parseDockDesign,dockDefaults} from '../dockDesign';
export const layoutDefaults:Record<string,string>={
 'bloom-status-widgets':JSON.stringify({left:['weather'],right:['battery']}),
 'bloom-island-date':'false','bloom-island-battery':'true','bloom-island-cpu':'true',
 'bloom-dock-design':JSON.stringify(dockDefaults),'bloom-notch-mode':'fixed',
 'bloom-dock-mode':'fixed','bloom-dock-enabled':'true','bloom-unified-appearance':'true'
};
export function layoutDraft(snapshot:Record<string,unknown>){return Object.fromEntries(Object.entries(layoutDefaults).map(([key,fallback])=>[key,typeof snapshot[key]==='string'?snapshot[key] as string:fallback]));}
export function layoutChanges(draft:Record<string,string>,snapshot:Record<string,unknown>){const previous=layoutDraft(snapshot);return Object.fromEntries(Object.keys(layoutDefaults).filter(k=>draft[k]!==previous[k]).map(k=>[k,draft[k]]));}
export function layoutWidgets(raw:string){try{const v=JSON.parse(raw),seen=new Set<string>();const valid=(x:unknown)=>typeof x==='string'&&['weather','battery','cpu','ram','disk','net'].includes(x)&&!seen.has(x)&&!!seen.add(x);return {left:(Array.isArray(v.left)?v.left:[]).filter(valid).slice(0,2),right:(Array.isArray(v.right)?v.right:[]).filter(valid).slice(0,2)};}catch{return {left:['weather'],right:['battery']};}}
export {parseDockDesign};
