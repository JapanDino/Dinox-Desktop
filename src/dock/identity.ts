export interface DockIdentityApp {
 path:string; name:string; executable?:string; hwnd?:number;
 all_hwnds?:[number,string][];
}
// Titles describe windows, not applications. AUMIDs distinguish PWAs/Store apps;
// a native exe path identifies an ordinary application across title changes.
export function appIdentity(path:string,_executable?:string,_name?:string){
 return path.trim().replace(/^shell:AppsFolder[\\/]/i,'').toLowerCase().replace(/\\/g,'/');
}
export function mergeWindowGroups<T extends DockIdentityApp>(apps:T[]):T[]{
 const grouped=new Map<string,T>();
 for(const app of apps){
  const key=appIdentity(app.path);if(!key)continue;
  const existing=grouped.get(key);
  const windows=app.all_hwnds?.length?app.all_hwnds:app.hwnd?[[app.hwnd,app.name] as [number,string]]:[];
  const merged=new Map<number,string>((existing?.all_hwnds??[]));
  for(const [hwnd,title] of windows)if(Number.isSafeInteger(hwnd)&&hwnd!==0)merged.set(hwnd,title);
  grouped.set(key,{...(existing??app),all_hwnds:[...merged],hwnd:existing?.hwnd??app.hwnd});
 }
 return [...grouped.values()];
}
