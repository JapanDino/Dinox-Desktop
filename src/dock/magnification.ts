/** Bound expansion by available spacing, so adjacent artwork cannot collide. */
export function magnification(distance:number,size:number,gap:number){
 if(!Number.isFinite(distance)||!Number.isFinite(size)||!Number.isFinite(gap)||size<=0)return 1;
 const boost=Math.min(.22,Math.max(0,(gap-2)/Math.max(1,size)));
 const proximity=Math.max(0,1-Math.abs(distance)/(size*2.5));
 return 1+boost*proximity*proximity;
}
