use std::{collections::HashMap,io::Write,os::windows::ffi::OsStrExt};
use tauri::{Manager,Emitter};
use serde_json::Value;
const KEYS:&[&str]=&["bloom-status-widgets","bloom-island-date","bloom-island-battery","bloom-island-cpu","bloom-dock-design","bloom-notch-mode","bloom-dock-mode","bloom-dock-enabled","bloom-unified-appearance"];
fn validate(values:&HashMap<String,String>)->Result<(),String>{
 if values.is_empty()||values.keys().any(|key|!KEYS.contains(&key.as_str()))||values.values().any(|v|v.len()>8192){return Err("Invalid layout".into());}
 for (key,value) in values{
  let valid=match key.as_str(){
   "bloom-notch-mode"=>matches!(value.as_str(),"fixed"|"smart"|"peek"|"hover"),
   "bloom-dock-mode"=>matches!(value.as_str(),"fixed"|"smart"|"peek"),
   "bloom-dock-design"=>serde_json::from_str::<Value>(value).is_ok_and(|v|v.is_object()),
   "bloom-status-widgets"=>{
    let v=serde_json::from_str::<Value>(value).map_err(|_|"Invalid widgets")?;
    let mut seen=std::collections::HashSet::new();
    ["left","right"].iter().all(|side|v.get(side).and_then(Value::as_array).is_some_and(|items|items.len()<=2&&items.iter().all(|id|id.as_str().is_some_and(|id|matches!(id,"weather"|"battery"|"cpu"|"ram"|"disk"|"net")&&seen.insert(id.to_string())))))
   },
   _=>matches!(value.as_str(),"true"|"false")
  };
  if !valid{return Err(format!("Invalid layout value: {key}"));}
 }
 Ok(())
}
#[tauri::command]
pub fn save_layout(app:tauri::AppHandle,values:HashMap<String,String>,expected:HashMap<String,Value>)->Result<(),String>{
 validate(&values)?;
 let guard=crate::commands::SETTINGS_WRITE_LOCK.lock().map_err(|_|"Settings unavailable")?;
 let path=app.path().app_config_dir().map_err(|e|e.to_string())?.join("settings.json");
 let mut settings:HashMap<String,Value>=if path.exists(){serde_json::from_slice(&std::fs::read(&path).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?}else{HashMap::new()};
 for key in values.keys(){if settings.get(key).unwrap_or(&Value::Null)!=expected.get(key).unwrap_or(&Value::Null){return Err("Layout changed in another window. Reload before saving.".into());}}
 for (key,value) in &values{settings.insert(key.clone(),Value::String(value.clone()));}
 if let Some(parent)=path.parent(){std::fs::create_dir_all(parent).map_err(|e|e.to_string())?;}
 let temp=path.with_extension("json.tmp");
 let mut file=std::fs::File::create(&temp).map_err(|e|e.to_string())?;
 file.write_all(&serde_json::to_vec(&settings).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
 file.sync_all().map_err(|e|e.to_string())?;drop(file);
 let from:Vec<u16>=temp.as_os_str().encode_wide().chain(Some(0)).collect();let to:Vec<u16>=path.as_os_str().encode_wide().chain(Some(0)).collect();
 unsafe{use windows::Win32::Storage::FileSystem::*;MoveFileExW(windows::core::PCWSTR(from.as_ptr()),windows::core::PCWSTR(to.as_ptr()),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH).map_err(|e|e.to_string())?;}
 crate::utils::replace_settings_cache(settings);drop(guard);
 for (key,value) in values{let _=app.emit("settings-changed",serde_json::json!({"key":key,"value":value}));}
 crate::shell_controller::request_refresh(&app);
 tauri::async_runtime::spawn(crate::commands::sync_appbar(app));
 Ok(())
}
#[cfg(test)] mod tests{
 use super::*;
 fn one(key:&str,value:&str)->HashMap<String,String>{HashMap::from([(key.into(),value.into())])}
 #[test] fn layout_rejects_unrelated_settings(){assert!(validate(&one("bloom-shell-mode","replace")).is_err());}
 #[test] fn layout_rejects_invalid_modes_and_booleans(){assert!(validate(&one("bloom-notch-mode","broken")).is_err());assert!(validate(&one("bloom-island-date","yes")).is_err());assert!(validate(&one("bloom-notch-mode","hover")).is_ok());}
 #[test] fn layout_rejects_duplicate_and_overfull_widgets(){assert!(validate(&one("bloom-status-widgets",r#"{"left":["cpu"],"right":["cpu"]}"#)).is_err());assert!(validate(&one("bloom-status-widgets",r#"{"left":["cpu","ram","disk"],"right":[]}"#)).is_err());assert!(validate(&one("bloom-status-widgets",r#"{"left":["cpu","ram"],"right":["battery"]}"#)).is_ok());}
}
