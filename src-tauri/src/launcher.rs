use tauri::{Manager,Emitter};
use serde::{Serialize,Deserialize};
use std::{sync::{Mutex,atomic::{AtomicU64,AtomicBool,AtomicIsize,Ordering}},process::{Command,Stdio},os::windows::process::CommandExt,time::{Instant,Duration}};
pub static HOTKEY_AVAILABLE:AtomicBool=AtomicBool::new(false);
pub static HOTKEY_WINDOW:AtomicIsize=AtomicIsize::new(0);
pub const REFRESH_HOTKEY:u32=0x8000+0x44;
static RECORDING:AtomicBool=AtomicBool::new(false);
static RECORDING_GENERATION:AtomicU64=AtomicU64::new(0);
pub fn parse_shortcut(choice:&str)->Result<Option<(u32,u32)>,String>{
 if choice=="off"{return Ok(None);}
 if choice=="alt-space"{return Ok(Some((1,32)));}
 if choice=="ctrl-alt-space"{return Ok(Some((3,32)));}
 let parts:Vec<_>=choice.split(':').collect();
 if parts.len()!=3||parts[0]!="custom"{return Err("Invalid search shortcut".into());}
 let mods=parts[1].parse::<u32>().map_err(|_|"Invalid modifiers")?;
 let key=parts[2].parse::<u32>().map_err(|_|"Invalid key")?;
 let key_ok=(65..=90).contains(&key)||(48..=57).contains(&key)||((112..=135).contains(&key)&&key!=123)||[8,9,13,32,33,34,35,36,37,38,39,40,45,46].contains(&key);
 let reserved=(key==9&&mods&1!=0)||(key==115&&mods&1!=0)||(key==46&&mods&3==3)||(key==66&&mods&3==3);
 if mods==0||mods>7||mods&3==0||!key_ok||reserved{return Err("Unsupported or reserved search shortcut".into());}
 Ok(Some((mods,key)))
}
pub unsafe fn register_hotkey(hwnd:windows::Win32::Foundation::HWND,app:&tauri::AppHandle){
 use windows::Win32::UI::Input::KeyboardAndMouse::*;
 let _=UnregisterHotKey(Some(hwnd),0xB101);
 if RECORDING.load(Ordering::SeqCst){return;}
 let choice=crate::utils::get_setting_str(app,"dinox-search-shortcut").unwrap_or_else(||"alt-space".into());
 let available=match parse_shortcut(&choice){Ok(Some((mods,key)))=>RegisterHotKey(Some(hwnd),0xB101,HOT_KEY_MODIFIERS(mods)|MOD_NOREPEAT,key).is_ok(),_=>false};
 HOTKEY_AVAILABLE.store(available,Ordering::Relaxed);
 let _=app.emit("launcher-shortcut-status",available);
 if available {crate::diagnostics::record(&format!("Search shortcut registered: {choice}"));}
 if !available&&choice!="off"{crate::diagnostics::record("Search shortcut unavailable; choose another shortcut or use dock search");}
}
#[tauri::command]
pub async fn launcher_record_shortcut(recording:bool)->Result<(),String>{
 let generation=RECORDING_GENERATION.fetch_add(1,Ordering::SeqCst)+1;
 RECORDING.store(recording,Ordering::SeqCst);
 if recording {tauri::async_runtime::spawn(async move {
  tokio::time::sleep(Duration::from_secs(60)).await;
  if RECORDING_GENERATION.load(Ordering::SeqCst)==generation {RECORDING.store(false,Ordering::SeqCst);refresh_hotkey();}
 });}
 tauri::async_runtime::spawn_blocking(||unsafe {
  use windows::Win32::UI::WindowsAndMessaging::{SendMessageTimeoutW,SMTO_ABORTIFHUNG};
  use windows::Win32::Foundation::{HWND,WPARAM,LPARAM};
  let hwnd=HOTKEY_WINDOW.load(Ordering::Relaxed);
  if hwnd==0{return Err("Search shortcut service unavailable".to_string());}
  let result=SendMessageTimeoutW(HWND(hwnd as *mut _),REFRESH_HOTKEY,WPARAM(0),LPARAM(0),SMTO_ABORTIFHUNG,2000,None);
  if result.0==0{Err("Search shortcut service did not respond".to_string())}else{Ok(())}
 }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub fn launcher_retry_shortcut(){refresh_hotkey();}
pub fn refresh_hotkey(){
 let hwnd=HOTKEY_WINDOW.load(Ordering::Relaxed);
 if hwnd!=0 {unsafe{let _=windows::Win32::UI::WindowsAndMessaging::PostMessageW(Some(windows::Win32::Foundation::HWND(hwnd as *mut _)),REFRESH_HOTKEY,windows::Win32::Foundation::WPARAM(0),windows::Win32::Foundation::LPARAM(0));}}
}
static SEARCH_LOCK:Mutex<()>=Mutex::new(());
static GENERATION:AtomicU64=AtomicU64::new(0);
#[derive(Serialize,Deserialize)]
pub struct FileResult {name:String,path:String}
#[tauri::command]
pub fn launcher_hotkey_status()->bool{HOTKEY_AVAILABLE.load(Ordering::Relaxed)}
fn shell_app_target(target:&str)->Result<String,String>{
 let prefix="shell:AppsFolder\\";
 let id=if target.get(..prefix.len()).is_some_and(|p|p.eq_ignore_ascii_case(prefix)){&target[prefix.len()..]}else{target};
 // Desktop AppUserModelIDs (for example Microsoft.Windows.Explorer) need not contain '!'.
 if id.len()<3||id.to_ascii_lowercase().ends_with(".exe")||id.chars().any(|c|c.is_control()||matches!(c,'/'|'\\'|':'|'"')){return Err("Invalid application ID".into());}
 Ok(format!("shell:AppsFolder\\{id}"))
}
#[tauri::command]
pub async fn launcher_files(query:String)->Result<Vec<FileResult>,String>{
 let query=query.trim().to_string();
 let generation=GENERATION.fetch_add(1,Ordering::SeqCst)+1;
 if query.chars().count()<2{return Ok(vec![]);}
 if query.len()>512||query.contains('\0'){return Err("Search query is too long".into());}
 tauri::async_runtime::spawn_blocking(move||{
  let _lock=SEARCH_LOCK.lock().map_err(|_|"Search is unavailable")?;
  if GENERATION.load(Ordering::SeqCst)!=generation{return Ok(vec![]);}
  let script=include_str!("launcher_search.ps1");
  let powershell=std::path::PathBuf::from(std::env::var_os("SystemRoot").ok_or("Windows directory unavailable")?).join("System32/WindowsPowerShell/v1.0/powershell.exe");
  let mut child=Command::new(powershell).args(["-NoProfile","-NonInteractive","-Command",script]).env("DINOX_SEARCH_TERM",query).creation_flags(0x08000000).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().map_err(|_|"File search could not start")?;
  // Drain concurrently: long indexed paths must never fill the pipe and deadlock.
  let mut stdout=child.stdout.take().ok_or("File search output unavailable")?;
  let reader=std::thread::spawn(move||{use std::io::Read;let mut bytes=vec![];let _=stdout.read_to_end(&mut bytes);bytes});
  let start=Instant::now();
  loop{
   if GENERATION.load(Ordering::SeqCst)!=generation||start.elapsed()>Duration::from_secs(5){let _=child.kill();let _=child.wait();let _=reader.join();return Err("Windows Search timed out. Try a more specific name.".into());}
   match child.try_wait(){Ok(Some(status))=>{let bytes=reader.join().unwrap_or_default();if !status.success(){return Err("Windows Search is unavailable. Check Windows indexing.".into());}let text=String::from_utf8_lossy(&bytes);return serde_json::from_str(text.trim_start_matches('\u{feff}').trim()).map_err(|_|"Windows Search returned an unreadable result".into());},Ok(None)=>std::thread::sleep(Duration::from_millis(40)),Err(_)=>{let _=child.kill();let _=child.wait();let _=reader.join();return Err("File search failed".into());}}
  }
 }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn launcher_show(app:tauri::AppHandle)->Result<(),String>{
 let win=match app.get_webview_window("launcher"){
  Some(win)=>win,
  None=>{let config=app.config().app.windows.iter().find(|c|c.label=="launcher").ok_or("Search configuration unavailable")?;tauri::WebviewWindowBuilder::from_config(&app,config).map_err(|e|e.to_string())?.build().map_err(|e|e.to_string())?}
 };
 win.center().map_err(|e|e.to_string())?;
 win.show().map_err(|e|e.to_string())?;
 win.set_focus().map_err(|e|e.to_string())?;
 let _=win.emit("launcher-open",());
 Ok(())
}
pub fn toggle(app:&tauri::AppHandle){
 let app=app.clone();
 // Called from a Win32 message callback: defer all Wry window operations.
 tauri::async_runtime::spawn(async move{if let Some(win)=app.get_webview_window("launcher"){if win.is_visible().unwrap_or(false){GENERATION.fetch_add(1,Ordering::SeqCst);let _=win.hide();return;}}let _=launcher_show(app).await;});
}
#[tauri::command]
pub async fn launcher_open(app:tauri::AppHandle,kind:String,target:String,engine:Option<String>)->Result<(),String>{
 if target.contains('\0'){return Err("Invalid target".into());}
 let uri=match kind.as_str(){
  "web"=>{
   let base=match engine.as_deref(){Some("yandex")=>"https://yandex.ru/search/",Some("bing")=>"https://www.bing.com/search",_=>"https://www.google.com/search"};
   let key=if engine.as_deref()==Some("yandex"){"text"}else{"q"};
   reqwest::Url::parse_with_params(base,[(key,target.as_str())]).map_err(|e|e.to_string())?.to_string()
  },
  "file"|"app"=>{
   let path=std::path::Path::new(&target);
   if path.is_absolute()&&path.exists(){target.clone()}
   else if kind=="app" {
    // Only launch shell app IDs actually enumerated by Dinox.
    let known=crate::commands::get_installed_apps().await;
    if !known.iter().any(|a|a.path==target){return Err("Application is no longer available".into());}
    shell_app_target(&target)?
   }else{return Err("File no longer exists".into());}
  },
  "command"=>{match target.as_str(){
   "settings"=>crate::commands::open_settings_window(app.clone()),
   "calendar"=>crate::commands::open_calendar_settings(app.clone()),
   "notifications"=>crate::notifications::open_bloom_notifications(app.clone()),
   _=>return Err("Unknown command".into())
  }return Ok(());},
  _=>return Err("Unknown result type".into())
 };
 tauri::async_runtime::spawn_blocking(move||crate::system_launch::launch(&uri)).await.map_err(|e|e.to_string())?
}
#[cfg(test)] mod tests{
 use super::*;
 #[test] fn shortcut_parser_matches_frontend_fixtures(){
  let cases:Vec<serde_json::Value>=serde_json::from_str(include_str!("../../tests/shortcut-cases.json")).unwrap();
  for case in cases {
   let value=case["value"].as_str().unwrap();let parsed=parse_shortcut(value);
   assert_eq!(parsed.is_ok(),case["valid"].as_bool().unwrap(),"{value}");
   if let Ok(Some((mods,key)))=parsed {assert_eq!(mods as u64,case["mods"].as_u64().unwrap());assert_eq!(key as u64,case["key"].as_u64().unwrap());}
  }
 }
 #[test] fn accepts_enumerated_desktop_and_packaged_app_id_forms(){
  assert_eq!(shell_app_target("Microsoft.Windows.Explorer").unwrap(),"shell:AppsFolder\\Microsoft.Windows.Explorer");
  assert_eq!(shell_app_target("SHELL:APPSFOLDER\\Example_pkg!App").unwrap(),"shell:AppsFolder\\Example_pkg!App");
 }
 #[test] fn rejects_protocols_and_command_paths_as_app_ids(){for id in ["https://example.com","cmd.exe","C:\\app.exe","shell:Something","app\nother"]{assert!(shell_app_target(id).is_err());}}
}
