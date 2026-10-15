export type DockEdge='bottom'|'left'|'right';
export const dockEdge=(value:unknown):DockEdge=>value==='left'||value==='right'?value:'bottom';
export function clampPopup(anchor:{x:number;y:number},size:{width:number;height:number},viewport:{width:number;height:number},margin=8){
 return {x:Math.max(margin,Math.min(anchor.x,viewport.width-size.width-margin)),y:Math.max(margin,Math.min(anchor.y,viewport.height-size.height-margin))};
}
/** Replace only the visible permutation, preserving pins on every other page. */
export function reorderVisible<T extends {path:string}>(all:T[],paths:string[]):T[]{
 const wanted=new Set(paths),old=all.filter(a=>wanted.has(a.path));
 if(old.length!==paths.length||wanted.size!==paths.length)return all;
 const ordered=paths.map(p=>old.find(a=>a.path===p)!);let index=0;
 return all.map(a=>wanted.has(a.path)?ordered[index++]:a);
}
/** Move across the full list, independent of dock pagination. */
export function moveTo<T>(all:T[],from:number,to:number):T[]{
 if(from<0||from>=all.length||to<0||to>=all.length||from===to)return all;
 const next=[...all];const [item]=next.splice(from,1);next.splice(to,0,item);return next;
}
