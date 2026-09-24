// Identity only. Message contents never cross into the dock window.
export interface NoticeApp {app_id:string;app_name:string}
export interface DockApp {path?:string;executable?:string|null;name?:string}
const normalize=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const file=(s:string)=>s.replace(/\//g,'\\').split('\\').pop()?.toLowerCase()||'';
const messengers:Record<string,string[]>={telegram:['telegram.exe'],whatsapp:['whatsapp.exe'],signal:['signal.exe'],discord:['discord.exe'],viber:['viber.exe'],slack:['slack.exe'],microsoftteams:['ms-teams.exe','teams.exe']};
export function noticeMatchesApp(notice:NoticeApp,app:DockApp) {
  if(notice.app_id==='bloom-demo')return false;
  const id=notice.app_id.toLowerCase(),path=app.path?.toLowerCase();
  if(path&&id===path)return true;
  const name=normalize(notice.app_name.replace(/ desktop$/i,''));
  const executables=messengers[name];
  if(executables&&(executables.includes(file(app.path||''))||executables.includes(file(app.executable||''))))return true;
  // Exact app names only; never search arbitrary window titles for a substring.
  return !!name&&!!app.name&&name===normalize(app.name.replace(/ desktop$/i,''));
}
