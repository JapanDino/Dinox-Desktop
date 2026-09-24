//! Separate personal pins; Windows taskbar state is read only.
use crate::types::AppInfo;
use tauri::{AppHandle,Emitter,Manager};
use std::sync::Mutex;
static WRITE:Mutex<()>=Mutex::new(());

#[tauri::command]
pub async fn windows_taskbar_pins()->Result<Vec<AppInfo>,String>{
    tauri::async_runtime::spawn_blocking(||{
        use windows::{core::{Interface,PCWSTR},Win32::{System::Com::{CoInitializeEx,CoUninitialize,CoCreateInstance,IPersistFile,COINIT_APARTMENTTHREADED,CLSCTX_INPROC_SERVER,STGM_READ},UI::Shell::{IShellLinkW,ShellLink}}};
        struct Com(bool);impl Drop for Com{fn drop(&mut self){if self.0{unsafe{CoUninitialize()}}}}
        let _com=Com(unsafe{CoInitializeEx(None,COINIT_APARTMENTTHREADED).is_ok()});
        let root=std::path::PathBuf::from(std::env::var_os("APPDATA").ok_or("APPDATA unavailable")?).join("Microsoft/Internet Explorer/Quick Launch/User Pinned/TaskBar");
        if !root.exists(){return Ok(vec![])}
        let entries=std::fs::read_dir(root).map_err(|_|"Cannot read Windows taskbar shortcuts")?;
        let mut apps=Vec::new();
        for entry in entries.flatten().take(256){
            let path=entry.path();if !path.extension().is_some_and(|x|x.eq_ignore_ascii_case("lnk")){continue}
            let name=path.file_stem().unwrap_or_default().to_string_lossy().to_string();
            let mut executable=None;
            // Load only. Do not Resolve, launch or modify any Windows shortcut.
            unsafe {
                if let Ok(link)=CoCreateInstance::<_,IShellLinkW>(&ShellLink,None,CLSCTX_INPROC_SERVER){
                    if let Ok(persist)=link.cast::<IPersistFile>(){
                        let wide:Vec<u16>=path.to_string_lossy().encode_utf16().chain(Some(0)).collect();
                        if persist.Load(PCWSTR(wide.as_ptr()),STGM_READ).is_ok(){
                            let mut target=[0u16;32768];let mut args=[0u16;2048];
                            if link.GetPath(&mut target,std::ptr::null_mut(),0).is_ok()&&link.GetArguments(&mut args).is_ok()&&args[0]==0{
                                let value=String::from_utf16_lossy(&target[..target.iter().position(|x|*x==0).unwrap_or(target.len())]);
                                if !value.is_empty(){executable=std::path::Path::new(&value).file_name().map(|s|s.to_string_lossy().to_string());}
                            }
                        }
                    }
                }
            }
            apps.push(AppInfo{name,path:path.to_string_lossy().to_string(),icon:None,is_running:false,hwnd:None,executable,all_hwnds:None});
        }
        apps.sort_by_key(|x|x.name.to_lowercase());Ok(apps)
    }).await.map_err(|_|"Windows pins import interrupted".to_string())?
}

#[tauri::command]
pub async fn load_personal_pins(app:AppHandle)->Result<Vec<AppInfo>,String>{
    let path=app.path().app_config_dir().map_err(|e|e.to_string())?.join("personal_pinned_apps.json");
    match std::fs::read_to_string(&path){
        Ok(raw)=>serde_json::from_str(&raw).map_err(|_|"Could not read personal pins; existing file preserved".into()),
        Err(e) if e.kind()==std::io::ErrorKind::NotFound=>{
            // Initial inheritance only. An intentionally empty list stays empty.
            let apps=windows_taskbar_pins().await?;
            let _guard=WRITE.lock().map_err(|_|"Pins lock unavailable")?;
            if path.exists(){return serde_json::from_str(&std::fs::read_to_string(path).map_err(|e|e.to_string())?).map_err(|e|e.to_string())}
            write(&path,&apps)?;Ok(apps)
        },
        Err(e)=>Err(e.to_string())
    }
}
fn write(path:&std::path::Path,apps:&[AppInfo])->Result<(),String>{
    if apps.len()>128||apps.iter().any(|a|a.path.is_empty()||a.path.len()>32768||a.name.len()>2048){return Err("Invalid pinned application list".into())}
    if let Some(parent)=path.parent(){std::fs::create_dir_all(parent).map_err(|e|e.to_string())?;}
    let clean:Vec<AppInfo>=apps.iter().cloned().map(|mut a|{a.icon=None;a.hwnd=None;a.all_hwnds=None;a.is_running=false;a}).collect();
    let tmp=path.with_extension("json.pending");
    std::fs::write(&tmp,serde_json::to_vec(&clean).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    std::fs::rename(tmp,path).map_err(|e|e.to_string())
}
pub fn save_classic(app:AppHandle,apps:Vec<AppInfo>)->Result<(),String>{
    let _guard=WRITE.lock().map_err(|_|"Pins lock unavailable")?;
    let path=app.path().app_config_dir().map_err(|e|e.to_string())?.join("pinned_apps.json");
    write(&path,&apps)?;let _=app.emit("dock-pins-changed","classic");Ok(())
}
#[tauri::command]
pub fn save_personal_pins(app:AppHandle,apps:Vec<AppInfo>)->Result<(),String>{
    let _guard=WRITE.lock().map_err(|_|"Pins lock unavailable")?;
    let path=app.path().app_config_dir().map_err(|e|e.to_string())?.join("personal_pinned_apps.json");
    write(&path,&apps)?;let _=app.emit("dock-pins-changed","personal");Ok(())
}

