export const systemDefaults = { enabled:true, layout:true, wifi:true, volume:true, battery:true, percent:true, tray:true, compact:false };
export type SystemOptions = typeof systemDefaults;
export interface SystemStatus {volume:number|null;muted:boolean;brightness:number|null;battery:number|null;charging:boolean;plugged_in:boolean;language:string}
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
export function panelPosition(anchor:{right:number;top:number},viewport:{width:number;height:number}) {
  const width=Math.max(220,Math.min(370,viewport.width-24));
  const bottom=Math.max(12,Math.min(viewport.height-140,viewport.height-anchor.top+12));
  return {width,left:Math.max(12,Math.min(viewport.width-width-12,anchor.right-width)),bottom,maxHeight:Math.max(120,viewport.height-bottom-12)};
}
