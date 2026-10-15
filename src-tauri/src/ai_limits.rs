//! Read-only quotas via the official Codex app-server and Claude Code statusLine.
//! Never reads browser cookies, prompts, transcripts, or raw account credentials.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::HashMap, io::{BufRead, BufReader, Read, Write}, path::{Path,PathBuf}, process::{Child,Command,Stdio}, sync::{mpsc,Mutex,OnceLock}, time::{Duration,Instant,SystemTime,UNIX_EPOCH}};
use std::os::windows::process::CommandExt;
use std::sync::atomic::{AtomicU64,Ordering};
use tauri::{AppHandle,Manager};
use tauri_plugin_opener::OpenerExt;

#[derive(Clone,Serialize,Deserialize,Debug)]
pub struct QuotaWindow { id:String, label:String, used:f64, minutes:Option<u64>, resets:Option<u64> }
#[derive(Clone,Serialize,Deserialize,Debug)]
pub struct ProviderLimits { provider:String, available:bool, connected:bool, bridge:bool, checked:Option<u64>, windows:Vec<QuotaWindow>, error:Option<String> }
impl ProviderLimits {
 fn empty(provider:&str)->Self { Self {provider:provider.into(),available:false,connected:false,bridge:false,checked:None,windows:vec![],error:None} }
}
#[derive(Serialize)]
pub struct Snapshot { codex:ProviderLimits, claude:ProviderLimits }
static CODEX:OnceLock<Mutex<ProviderLimits>>=OnceLock::new();
static CODEX_FETCH:Mutex<()>=Mutex::new(());
static CLAUDE_WRITE:Mutex<()>=Mutex::new(());
static LAST_CODEX_ATTEMPT:AtomicU64=AtomicU64::new(0);
fn now()->u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() }
fn cache()->&'static Mutex<ProviderLimits>{CODEX.get_or_init(||Mutex::new(ProviderLimits::empty("codex")))}
fn root(app:&AppHandle)->Result<PathBuf,String>{Ok(app.path().app_config_dir().map_err(|_|"storage_failed")?.join("ai-limits"))}
fn bounded_json(path:&Path)->Result<Value,String>{
 let file=std::fs::File::open(path).map_err(|_|"storage_failed")?;
 let mut bytes=vec![];file.take(1024*1024+1).read_to_end(&mut bytes).map_err(|_|"storage_failed")?;
 if bytes.len()>1024*1024{return Err("invalid_data".into())}
 serde_json::from_slice(&bytes).map_err(|_|"invalid_data".into())
}
fn cli()->Option<PathBuf>{
 // Native executable only: no cmd.exe wrappers, shell interpolation, or model calls.
 if let Some(path)=std::env::var_os("PATH") {for dir in std::env::split_paths(&path){let p=dir.join("codex.exe");if p.is_file(){return Some(p)}}}
 let npm=PathBuf::from(std::env::var_os("APPDATA")?).join("npm/node_modules/@openai/codex");
 for arch in ["x64","arm64"] {
  let triple=if arch=="x64"{"x86_64-pc-windows-msvc"}else{"aarch64-pc-windows-msvc"};
  for relative in [format!("node_modules/@openai/codex-win32-{arch}/vendor/{triple}/bin/codex.exe"),format!("vendor/{triple}/codex/codex.exe"),format!("vendor/{triple}/bin/codex.exe")] {
   let p=npm.join(relative);if p.is_file(){return Some(p)}
  }
 }
 None
}
struct Server { child:Child, messages:mpsc::Receiver<Value> }
impl Drop for Server {fn drop(&mut self){let _=self.child.kill();let _=self.child.wait();}}
impl Server {
 fn start(directory:&Path,login:bool)->Result<Self,String>{
  let executable=cli().ok_or("codex_missing")?;
  std::fs::create_dir_all(directory).map_err(|_|"storage_failed")?;
  let home=directory.join("codex-home");
  let mut command=Command::new(executable);
  command.arg("app-server").current_dir(directory).creation_flags(0x08000000).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
  if login||home.join("auth.json").is_file(){std::fs::create_dir_all(&home).map_err(|_|"storage_failed")?;command.env("CODEX_HOME",home);}
  let mut child=command.spawn().map_err(|_|"codex_start_failed")?;
  let output=child.stdout.take().ok_or("codex_start_failed")?;
  let (tx,rx)=mpsc::sync_channel(16);
  std::thread::spawn(move||{
   let mut reader=BufReader::new(output);
   loop {
    let mut bytes=vec![];
    let result=(&mut reader).take(1024*1024+1).read_until(b'\n',&mut bytes);
    if !matches!(result,Ok(n) if n>0)||bytes.len()>1024*1024{break}
    if let Ok(value)=serde_json::from_slice(&bytes){if tx.send(value).is_err(){break}}
   }
  });
  let mut server=Self{child,messages:rx};
  server.request(1,"initialize",json!({"clientInfo":{"name":"dinox-limits","version":env!("CARGO_PKG_VERSION")},"capabilities":{"experimentalApi":false}}),Duration::from_secs(15))?;
  server.send(json!({"method":"initialized"}))?;
  Ok(server)
 }
 fn send(&mut self,value:Value)->Result<(),String>{
  let input=self.child.stdin.as_mut().ok_or("codex_unavailable")?;
  serde_json::to_writer(&mut *input,&value).map_err(|_|"codex_unavailable")?;
  input.write_all(b"\n").and_then(|_|input.flush()).map_err(|_|"codex_unavailable".into())
 }
 fn request(&mut self,id:u64,method:&str,params:Value,timeout:Duration)->Result<Value,String>{
  self.send(json!({"id":id,"method":method,"params":params}))?;
  let deadline=Instant::now()+timeout;
  loop {
   let message=self.messages.recv_timeout(deadline.saturating_duration_since(Instant::now())).map_err(|_|"codex_timeout")?;
   if message.get("id").and_then(Value::as_u64)==Some(id) {
    return message.get("result").cloned().ok_or_else(||"codex_request_failed".into());
   }
  }
 }
}
fn quota(id:String,label:String,value:&Value,minutes:Option<u64>)->Option<QuotaWindow>{
 let used=value.get("usedPercent").or_else(||value.get("used_percentage"))?.as_f64()?;
 if !used.is_finite()||!(0.0..=100.0).contains(&used){return None}
 Some(QuotaWindow{id,label,used,minutes,resets:value.get("resetsAt").or_else(||value.get("resets_at")).and_then(Value::as_u64)})
}
fn codex_windows(result:&Value)->Vec<QuotaWindow>{
 let mut windows=vec![];
 let mut bucket=|id:&str,value:&Value|{
  for key in ["primary","secondary"] {
   if let Some(w)=value.get(key).and_then(|w|quota(format!("{id}-{key}"),value.get("limitName").and_then(Value::as_str).unwrap_or(id).chars().take(80).collect(),w,w.get("windowDurationMins").and_then(Value::as_u64))){windows.push(w)}
  }
 };
 if let Some(map)=result.get("rateLimitsByLimitId").and_then(Value::as_object).filter(|m|!m.is_empty()) {for(id,value)in map.iter().take(16){bucket(id,value)}}
 else if let Some(value)=result.get("rateLimits"){bucket(value.get("limitId").and_then(Value::as_str).unwrap_or("codex"),value)}
 windows
}
fn fetch_codex(directory:&Path,enabled:bool,force:bool)->ProviderLimits{
 let mut previous=cache().lock().unwrap_or_else(|e|e.into_inner()).clone();
 previous.available=cli().is_some();
 if !enabled{return previous}
 let Ok(_guard)=CODEX_FETCH.try_lock()else{return previous};
 let elapsed=now().saturating_sub(LAST_CODEX_ATTEMPT.load(Ordering::Relaxed));
 if elapsed<if force{10}else{300}{return previous}
 LAST_CODEX_ATTEMPT.store(now(),Ordering::Relaxed);
 let result=(||{
  let mut server=Server::start(directory,false)?;
  let account=server.request(2,"account/read",json!({"refreshToken":false}),Duration::from_secs(15))?;
  if account.pointer("/account/type").and_then(Value::as_str)!=Some("chatgpt"){return Err("login_required".into())}
  server.request(3,"account/rateLimits/read",Value::Null,Duration::from_secs(15))
 })();
 match result {
  Ok(value)=>{previous.connected=true;previous.windows=codex_windows(&value);previous.checked=Some(now());previous.error=None;}
  Err(e)=>{if e=="login_required"{previous.connected=false;previous.windows.clear();}previous.error=Some(e);}
 }
 *cache().lock().unwrap_or_else(|e|e.into_inner())=previous.clone();previous
}
fn claude_settings()->Result<PathBuf,String>{
 let dir=std::env::var_os("CLAUDE_CONFIG_DIR").map(PathBuf::from).or_else(||std::env::var_os("USERPROFILE").map(|p|PathBuf::from(p).join(".claude"))).ok_or("storage_failed")?;
 Ok(dir.join("settings.json"))
}
fn bridge_command(directory:&Path)->Value{
 let script=directory.join("claude-status.ps1").to_string_lossy().replace('\\',"/");
 json!({"type":"command","command":format!("powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"{script}\"")})
}
fn read_claude(directory:&Path)->ProviderLimits{
 let mut result=ProviderLimits::empty("claude");
 result.bridge=claude_settings().ok().and_then(|p|bounded_json(&p).ok()).and_then(|v|v.get("statusLine").cloned()).is_some_and(|v|v==bridge_command(directory));
 result.available=result.bridge;
 // Only the explicit bridge's sanitized payload, never Claude's credential files.
 if let Ok(value)=bounded_json(&directory.join("claude-usage.json")) {
  if result.bridge {
   result.checked=value.get("checked").and_then(Value::as_u64).filter(|v|*v<=now()+30);
   if result.checked.is_some(){result.connected=true;
    for(key,minutes)in [("five_hour",300),("seven_day",10080)] {
     if let Some(w)=value.get("rate_limits").and_then(|v|v.get(key)).and_then(|w|quota(key.into(),String::new(),w,Some(minutes))){result.windows.push(w)}
    }
   }
  }
 }
 result
}
#[tauri::command]
pub async fn ai_limits_snapshot(app:AppHandle,codex:bool,refresh:bool)->Result<Snapshot,String>{
 let directory=root(&app)?;
 tauri::async_runtime::spawn_blocking(move||Snapshot{codex:fetch_codex(&directory,codex,refresh),claude:read_claude(&directory)}).await.map_err(|_|"source_failed".into())
}
#[tauri::command]
pub async fn ai_limits_connect_codex(app:AppHandle)->Result<(),String>{
 let directory=root(&app)?;
 tauri::async_runtime::spawn_blocking(move||{
  let _guard=CODEX_FETCH.try_lock().map_err(|_|"codex_busy")?;
  let mut server=Server::start(&directory,true)?;
  let response=server.request(2,"account/login/start",json!({"type":"chatgpt"}),Duration::from_secs(20))?;
  let url=response.get("authUrl").and_then(Value::as_str).ok_or("login_failed")?;
  let parsed=reqwest::Url::parse(url).map_err(|_|"login_failed")?;
  if parsed.scheme()!="https"||!matches!(parsed.host_str(),Some("auth.openai.com"|"chatgpt.com"|"auth.chatgpt.com")){return Err("login_failed".into())}
  app.opener().open_url(url,None::<&str>).map_err(|_|"login_failed")?;
  let login_id=response.get("loginId").and_then(Value::as_str).ok_or("login_failed")?.to_owned();
  let deadline=Instant::now()+Duration::from_secs(300);
  loop {
   let message=server.messages.recv_timeout(deadline.saturating_duration_since(Instant::now())).map_err(|_|"login_timeout")?;
   if message.get("method").and_then(Value::as_str)==Some("account/login/completed")&&message.pointer("/params/loginId").and_then(Value::as_str)==Some(&login_id) {
    if message.pointer("/params/success").and_then(Value::as_bool)!=Some(true){return Err("login_failed".into())}
    let mut connected=ProviderLimits::empty("codex");connected.available=true;connected.connected=true;
    *cache().lock().unwrap_or_else(|e|e.into_inner())=connected;LAST_CODEX_ATTEMPT.store(0,Ordering::Relaxed);return Ok(());
   }
  }
 }).await.map_err(|_|"source_failed".to_string())?
}
#[tauri::command]
pub async fn ai_limits_claude_bridge(app:AppHandle,enabled:bool)->Result<(),String>{
 let directory=root(&app)?;
 tauri::async_runtime::spawn_blocking(move||{
  let _guard=CLAUDE_WRITE.lock().map_err(|_|"storage_failed")?;
  let path=claude_settings()?;
  configure_bridge(&directory,&path,enabled)
 }).await.map_err(|_|"source_failed".to_string())?
}
fn configure_bridge(directory:&Path,path:&Path,enabled:bool)->Result<(),String>{
  let wrapper=bridge_command(directory);
  let mut settings:HashMap<String,Value>=if path.exists(){serde_json::from_value(bounded_json(&path)?).map_err(|_|"invalid_data")?}else{HashMap::new()};
  let current=settings.get("statusLine").cloned();
  std::fs::create_dir_all(&directory).map_err(|_|"storage_failed")?;
  let backup=directory.join("claude-status-backup.json");
  if enabled {
   if current.as_ref()==Some(&wrapper){return Ok(())}
   std::fs::write(&backup,serde_json::to_vec(&json!({"had":current.is_some(),"value":current})).map_err(|_|"storage_failed")?).map_err(|_|"storage_failed")?;
   std::fs::write(directory.join("claude-status.ps1"),include_str!("claude_status.ps1")).map_err(|_|"storage_failed")?;
   settings.insert("statusLine".into(),wrapper);
  } else {
   if current.as_ref()!=Some(&wrapper){return Err("claude_settings_changed".into())}
   let original=bounded_json(&backup)?;
   if original.get("had").and_then(Value::as_bool)==Some(true){settings.insert("statusLine".into(),original.get("value").cloned().unwrap_or(Value::Null));}else{settings.remove("statusLine");}
  }
  crate::settings_store::commit(&path,&settings)?;
  if !enabled{let _=std::fs::remove_file(directory.join("claude-usage.json"));}
  Ok(())
}

#[cfg(test)] mod tests {
 use super::*;
 #[test]fn codex_multiple_windows_keep_real_durations_and_reset(){let windows=codex_windows(&json!({"rateLimitsByLimitId":{"codex":{"primary":{"usedPercent":20,"windowDurationMins":300,"resetsAt":10},"secondary":{"usedPercent":90,"windowDurationMins":10080,"resetsAt":20}}}}));assert_eq!(windows.len(),2);assert_eq!(windows[0].minutes,Some(300));assert_eq!(windows[1].minutes,Some(10080));assert_eq!(windows[1].resets,Some(20));}
 #[test]fn missing_is_not_zero_and_other_windows_survive(){let w=codex_windows(&json!({"rateLimits":{"primary":{"windowDurationMins":300},"secondary":{"usedPercent":0,"windowDurationMins":60}}}));assert_eq!(w.len(),1);assert_eq!(w[0].used,0.0);assert_eq!(w[0].minutes,Some(60));}
 #[test]fn invalid_percent_is_rejected(){for used in [-1.0,101.0]{assert!(quota("x".into(),"".into(),&json!({"used_percentage":used}),Some(300)).is_none())}}
 #[test]fn legacy_view_and_unknown_reset_are_supported(){let w=codex_windows(&json!({"rateLimits":{"primary":{"usedPercent":25}}}));assert_eq!(w.len(),1);assert_eq!(w[0].resets,None);assert_eq!(w[0].minutes,None);}
 fn fixture()->PathBuf{let path=std::env::temp_dir().join(format!("dinox-ai-limits-test-{}",uuid::Uuid::new_v4()));std::fs::create_dir_all(&path).unwrap();path}
 #[test]fn bridge_restores_original_and_preserves_unrelated_settings(){let dir=fixture();let path=dir.join("settings.json");let original=json!({"statusLine":{"type":"command","command":"echo original","padding":3},"other":{"enabled":true}});std::fs::write(&path,serde_json::to_vec(&original).unwrap()).unwrap();configure_bridge(&dir,&path,true).unwrap();configure_bridge(&dir,&path,true).unwrap();assert_eq!(bounded_json(&path).unwrap()["other"],original["other"]);configure_bridge(&dir,&path,false).unwrap();assert_eq!(bounded_json(&path).unwrap(),original);std::fs::remove_dir_all(dir).unwrap();}
 #[test]fn disconnect_does_not_overwrite_an_external_change(){let dir=fixture();let path=dir.join("settings.json");configure_bridge(&dir,&path,true).unwrap();let changed=json!({"statusLine":{"type":"command","command":"echo changed"},"other":12});std::fs::write(&path,serde_json::to_vec(&changed).unwrap()).unwrap();assert_eq!(configure_bridge(&dir,&path,false).unwrap_err(),"claude_settings_changed");assert_eq!(bounded_json(&path).unwrap(),changed);std::fs::remove_dir_all(dir).unwrap();}
 #[test]fn corrupt_claude_settings_are_preserved(){let dir=fixture();let path=dir.join("settings.json");std::fs::write(&path,b"broken").unwrap();assert!(configure_bridge(&dir,&path,true).is_err());assert_eq!(std::fs::read(&path).unwrap(),b"broken");std::fs::remove_dir_all(dir).unwrap();}
}
