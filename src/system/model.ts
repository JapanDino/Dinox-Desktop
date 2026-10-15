export const systemDefaults = { enabled:true, layout:true, wifi:true, volume:true, battery:true, percent:true, tray:true, compact:false };
export type SystemOptions = typeof systemDefaults;
export interface SystemStatus {volume:number|null;muted:boolean;brightness:number|null;brightness_target?:'internal'|'primary-ddc'|null;battery:number|null;charging:boolean;plugged_in:boolean;language:string}
export function parseSystemOptions(raw:string):SystemOptions {
  let value:any={};try{value=JSON.parse(raw)??{};}catch{}
  return Object.fromEntries(Object.entries(systemDefaults).map(([key,fallback])=>[key,typeof value[key]==='boolean'?value[key]:fallback])) as SystemOptions;
}
export function systemStripWidth(o:SystemOptions) {
  if(!o.enabled)return 0;
  const indicators=Number(o.wifi)+Number(o.volume)+Number(o.battery);
  const quick=o.compact||indicators===0?36:16+indicators*24+(o.battery&&o.percent?30:0);
  return quick+(o.layout?40:0)+(o.tray?36:0)+8;
}
export interface PanelPlacement {width:number;left:number;top?:number;bottom?:number;maxHeight:number}
export function panelPosition(anchor:{right:number;top:number;left?:number;bottom?:number;edge?:string},viewport:{width:number;height:number}):PanelPlacement {
  const margin=Math.min(12,viewport.width/4,viewport.height/4);
  const width=Math.max(0,Math.min(370,viewport.width-margin*2));
  const side=anchor.edge==='left'||anchor.edge==='right';
  const preferredLeft=anchor.edge==='left'?anchor.right+12:anchor.edge==='right'?(anchor.left??anchor.right)-width-12:anchor.right-width;
  const left=Math.max(margin,Math.min(viewport.width-width-margin,preferredLeft));
  if(anchor.edge==='top'||side){
    const top=Math.max(margin,Math.min(Math.max(margin,viewport.height-140),anchor.edge==='top'?(anchor.bottom??anchor.top)+12:anchor.top));
    return {width,left,top,maxHeight:Math.max(0,viewport.height-top-margin)};
  }
  const bottom=Math.max(margin,Math.min(Math.max(margin,viewport.height-140),viewport.height-anchor.top+12));
  return {width,left,bottom,maxHeight:Math.max(0,viewport.height-bottom-margin)};
}
