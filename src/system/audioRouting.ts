export interface RoutingSession {
 id:string; name:string; process_id?:number; process_started_at?:string|null;
 route_supported?:boolean; route_device_id?:string|null; route_error?:string|null;
}
export interface RouteResult {state:'preference_confirmed'; device_id:string|null; stream_on_target:boolean; process_id:number}
export function canRoute(session:RoutingSession):boolean {
 return session.route_supported===true && Number.isInteger(session.process_id) && (session.process_id??0)>0 && !!session.process_started_at;
}
export function routeKey(session:RoutingSession):string {return `${session.process_id??0}:${session.process_started_at??''}`;}
// An IPC response is confirmation only when it matches the exact requested app
// and preference. Observing a stream is separate from persisting its preference.
export function confirmRoute(value:unknown,pid:number,target:string|null):RouteResult {
 const result=value as Partial<RouteResult>|null;
 if(!result||result.state!=='preference_confirmed'||result.process_id!==pid||result.device_id!==target||typeof result.stream_on_target!=='boolean')throw new Error('Windows did not confirm the requested app output');
 return result as RouteResult;
}
