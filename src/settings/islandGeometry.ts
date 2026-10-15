export const islandPositions = ['top-left','top-center','top-right','left','right','bottom'] as const;
export type IslandPosition = typeof islandPositions[number];
export function islandPosition(raw:unknown):IslandPosition {return islandPositions.includes(raw as IslandPosition)?raw as IslandPosition:'top-center';}
export function islandEdge(position:IslandPosition){return position.startsWith('top')?'top':position;}
export function islandInsets(position:IslandPosition,dockRaw:unknown,dockEnabled=true,viewportHeight?:number,measuredDock?:{edge:string;thickness:number}){
 let dock:{edge?:string;size?:number;padding?:number;offset?:number;labels?:boolean}={};
 try{const parsed=typeof dockRaw==='string'?JSON.parse(dockRaw):dockRaw;if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))dock=parsed;}catch{}
 const number=(v:unknown,fallback:number,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)?Math.min(max,Math.max(min,v)):fallback;
 const requestedThickness=number(dock.size,44,28,64)+2*number(dock.padding,10,4,18)+number(dock.offset,12,0,28)+(dock.labels?17:2)+12;
 const edge=islandEdge(position),dockEdge=['left','right'].includes(dock.edge??'')?dock.edge:'bottom';
 const thickness=measuredDock&&measuredDock.edge===dockEdge&&Number.isFinite(measuredDock.thickness)&&measuredDock.thickness>0?measuredDock.thickness:requestedThickness;
 return {left:(edge==='left'||position==='top-left'?12:0)+(dockEnabled&&dockEdge==='left'?thickness:0),right:(edge==='right'||position==='top-right'?12:0)+(dockEnabled&&dockEdge==='right'?thickness:0),bottom:(edge==='bottom'?12:0)+(dockEnabled&&dockEdge==='bottom'?thickness:0),top:edge==='top'?0:viewportHeight&&(edge==='left'||edge==='right')?Math.min(viewportHeight*.2,180):12};
}
export function clampIslandSize(width:number,height:number,viewport:{width:number;height:number},insets:{left:number;right:number;top:number;bottom:number}){return {width:Math.max(1,Math.min(width,viewport.width-insets.left-insets.right-12)),height:Math.max(1,Math.min(height,viewport.height-insets.top-insets.bottom-12))};}
