export interface PinnedApp {
  name: string; path: string; icon: string | null; is_running: boolean;
  executable?: string | null; hwnd?: number | null; all_hwnds?: [number,string][] | null;
}
export const contentDefaults = {mode:'classic', showRunning:true};
export function parseDockContent(raw: string) {
  try { const v=JSON.parse(raw); return {mode:v?.mode==='personal'?'personal':'classic',showRunning:v?.showRunning!==false}; }
  catch { return {...contentDefaults}; }
}
export const pinKey=(app: Pick<PinnedApp,'path'>)=>app.path.replace(/\//g,'\\').toLowerCase();
export function mergePins(current:PinnedApp[],incoming:PinnedApp[]) {
  const seen=new Set(current.map(pinKey));
  return [...current,...incoming.filter(app=>{const key=pinKey(app);if(!key||seen.has(key))return false;seen.add(key);return true;})];
}
export function movePin(apps:PinnedApp[],index:number,delta:number) {
  const to=index+delta;if(index<0||index>=apps.length||to<0||to>=apps.length)return apps;
  const next=[...apps];[next[index],next[to]]=[next[to],next[index]];return next;
}
