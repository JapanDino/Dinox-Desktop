//! The sole owner of native taskbar replacement. Compatibility is the default.
//! All dock operations read current settings under one lock; delayed callers never carry old state.
use std::{path::{Path, PathBuf}, sync::{Mutex, OnceLock, atomic::{AtomicBool, AtomicU64, Ordering}}, time::{Duration, SystemTime, UNIX_EPOCH}};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use windows::{core::{BOOL, PCWSTR}, Win32::{Foundation::{HWND, LPARAM, RECT}, UI::{Shell::*, WindowsAndMessaging::*}}};
use crate::{state::{DOCK_APPBAR_REGISTERED, NATIVE_TASKBAR_HIDDEN}, utils::get_setting_str};

static LOCK: Mutex<()> = Mutex::new(());
static DIR: OnceLock<PathBuf> = OnceLock::new();
static APP: OnceLock<AppHandle> = OnceLock::new();
static STOPPING: AtomicBool = AtomicBool::new(false);
static MAIN_BEAT: AtomicU64 = AtomicU64::new(0);
static DOCK_BEAT: AtomicU64 = AtomicU64::new(0);
static GUARDIAN_STARTED: AtomicBool = AtomicBool::new(false);
static QUEUED: AtomicBool = AtomicBool::new(false);
static SNAPSHOT: Mutex<Option<Snapshot>> = Mutex::new(None);
static PLACEMENT: Mutex<Option<(isize, i32, i32, i32, i32, bool)>> = Mutex::new(None);

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Tray { hwnd: isize, pid: u32, visible: bool, primary: bool }
#[derive(Clone, Debug, Serialize, Deserialize)]
struct Snapshot { owner: u32, state: usize, trays: Vec<Tray>, heartbeat: u64 }

fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64 }
fn path(name: &str) -> Option<PathBuf> { DIR.get().map(|d| d.join(name)) }
fn enabled(app: &AppHandle) -> bool { get_setting_str(app,"bloom-dock-enabled").as_deref() != Some("false") }
fn requested(app: &AppHandle) -> bool { get_setting_str(app,"bloom-shell-mode").as_deref() == Some("replace") }
fn journal(dir: &Path) -> PathBuf { dir.join("shell-recovery.json") }
fn wide(path: &Path) -> Vec<u16> { use std::os::windows::ffi::OsStrExt; path.as_os_str().encode_wide().chain(Some(0)).collect() }

fn persist(dir: &Path, data: &Snapshot) -> Result<(), String> {
    use std::io::Write;
    use windows::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH};
    std::fs::create_dir_all(dir).map_err(|e|e.to_string())?;
    let temp=dir.join(format!("shell-recovery.{}.tmp",std::process::id()));
    let mut file=std::fs::File::create(&temp).map_err(|e|e.to_string())?;
    file.write_all(&serde_json::to_vec(data).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    file.sync_all().map_err(|e|e.to_string())?; drop(file);
    unsafe { MoveFileExW(PCWSTR(wide(&temp).as_ptr()),PCWSTR(wide(&journal(dir)).as_ptr()),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH).map_err(|e|e.to_string()) }
}

unsafe extern "system" fn enumerate(hwnd: HWND, arg: LPARAM) -> BOOL {
    let mut name=[0u16;96]; let n=GetClassNameW(hwnd,&mut name);
    let class=String::from_utf16_lossy(&name[..n.max(0) as usize]);
    if class=="Shell_TrayWnd" || class=="Shell_SecondaryTrayWnd" {
        let mut pid=0; GetWindowThreadProcessId(hwnd,Some(&mut pid));
        (&mut *(arg.0 as *mut Vec<Tray>)).push(Tray{hwnd:hwnd.0 as isize,pid,visible:IsWindowVisible(hwnd).as_bool(),primary:class=="Shell_TrayWnd"});
    }
    BOOL(1)
}
fn trays() -> Vec<Tray> { let mut result=Vec::new(); unsafe { let _=EnumWindows(Some(enumerate),LPARAM(&mut result as *mut Vec<Tray> as isize)); } result }
fn same_window(tray: &Tray) -> bool { unsafe { let mut pid=0; GetWindowThreadProcessId(HWND(tray.hwnd as *mut _),Some(&mut pid)); pid!=0 && pid==tray.pid } }

// We never move Explorer windows off-screen or change their transparency/styles.
fn restore_snapshot(data: &Snapshot) -> bool {
    unsafe {
        let current=trays(); if current.is_empty() { return false; }
        let mut abd=APPBARDATA{cbSize:std::mem::size_of::<APPBARDATA>() as u32,lParam:LPARAM(data.state as isize),..Default::default()};
        SHAppBarMessage(ABM_SETSTATE,&mut abd);
        for tray in &current {
            // A recreated Explorer window has a new identity: let it be visible.
            let visible=data.trays.iter().find(|t|t.hwnd==tray.hwnd && t.pid==tray.pid).map(|t|t.visible).unwrap_or(true);
            if visible { let _=ShowWindowAsync(HWND(tray.hwnd as *mut _),SW_SHOW); }
        }
        std::thread::sleep(Duration::from_millis(100));
        let state=SHAppBarMessage(ABM_GETSTATE,&mut abd);
        state==data.state && current.iter().all(|t| {
            let was_visible=data.trays.iter().find(|old|old.hwnd==t.hwnd && old.pid==t.pid).map(|old|old.visible).unwrap_or(true);
            !was_visible || IsWindowVisible(HWND(t.hwnd as *mut _)).as_bool()
        })
    }
}

fn restore_locked() -> bool {
    NATIVE_TASKBAR_HIDDEN.store(false,Ordering::SeqCst);
    let Some(dir)=DIR.get() else { return true };
    let data=SNAPSHOT.lock().unwrap_or_else(|e|e.into_inner()).clone().or_else(||std::fs::read(journal(dir)).ok().and_then(|b|serde_json::from_slice(&b).ok()));
    let Some(data)=data else { return true };
    if restore_snapshot(&data) {
        let _=std::fs::remove_file(journal(dir));
        *SNAPSHOT.lock().unwrap_or_else(|e|e.into_inner())=None;
        true
    } else { crate::diagnostics::record("shell restore incomplete; recovery journal retained"); false }
}

pub fn restore() { let _guard=LOCK.lock().unwrap_or_else(|e|e.into_inner()); restore_locked(); }
pub fn shutdown() { STOPPING.store(true,Ordering::SeqCst); restore(); }

pub fn init(app: &AppHandle) {
    let _=APP.set(app.clone());
    if let Ok(dir)=app.path().app_config_dir() { let _=std::fs::create_dir_all(&dir); let _=DIR.set(dir); }
    let recover_journal=path("shell-recovery.json").is_some_and(|p|p.exists());
    let recover_old=path("taskbar_hidden.flag").is_some_and(|p|p.exists());
    if recover_journal {
        if let Some(p)=path("shell-recovered.flag") { let _=std::fs::write(p,b"Previous session did not restore the taskbar"); }
    }
    // Legacy versions saved only a flag. Show the existing Explorer windows;
    // exact pre-crash state from those versions cannot be reconstructed.
    if recover_old {
        if let Some(p)=path("shell-recovered.flag") { let _=std::fs::write(p,b"Legacy recovery: select compatibility mode"); }
    }
    let app=app.clone();
    // Explorer appbar calls can synchronously notify our windows. During Tauri
    // setup the UI message loop is not ready to service that round trip.
    // Mark compatibility above, but perform all native recovery on this worker.
    std::thread::spawn(move || {
        if recover_journal {
            let _operation=crate::diagnostics::Operation::start("startup shell recovery");
            restore();
        }
        if recover_old {
            let _operation=crate::diagnostics::Operation::start("startup legacy recovery");
            let _guard=LOCK.lock().unwrap_or_else(|e|e.into_inner());
            recover_legacy();
        }
        'watch: loop {
        std::thread::sleep(Duration::from_secs(2));
        if STOPPING.load(Ordering::SeqCst) { break; }
        let _guard=LOCK.lock().unwrap_or_else(|e|e.into_inner());
        if NATIVE_TASKBAR_HIDDEN.load(Ordering::SeqCst) {
            let beat=MAIN_BEAT.load(Ordering::SeqCst).min(DOCK_BEAT.load(Ordering::SeqCst));
            let recovered=path("shell-recovered.flag").is_some_and(|p|p.exists());
            if recovered || crate::shell_policy::should_recover(true,now(),beat) {
                if !recovered {
                    crate::diagnostics::record(&format!("shell recovery: heartbeat timeout; main={}ms dock={}ms",now().saturating_sub(MAIN_BEAT.load(Ordering::SeqCst)),now().saturating_sub(DOCK_BEAT.load(Ordering::SeqCst))));
                    if let Some(p)=path("shell-recovered.flag") { let _=std::fs::write(p,b"Interface heartbeat stopped"); }
                }
                restore_locked();
                drop(_guard); request_refresh(&app); continue;
            }
            // Explorer can show its existing auto-hide window after a work-area
            // notification. This is not a renderer hang. Keep the requested mode
            // while both renderers respond; a recreated Explorer is handled below.
            for tray in trays().iter().filter(|t|t.primary && t.visible) {
                let owned=SNAPSHOT.lock().unwrap_or_else(|e|e.into_inner()).as_ref()
                    .is_some_and(|s|s.trays.iter().any(|old|old.hwnd==tray.hwnd && old.pid==tray.pid));
                if owned { unsafe {let _=ShowWindowAsync(HWND(tray.hwnd as *mut _),SW_HIDE);} }
                else {
                    if let Some(p)=path("shell-recovered.flag") {let _=std::fs::write(p,b"Explorer window replaced");}
                    restore_locked(); drop(_guard); request_refresh(&app); continue 'watch;
                }
            }
            let mut snapshot=SNAPSHOT.lock().unwrap_or_else(|e|e.into_inner());
            if let Some(data)=snapshot.as_mut() {
                data.heartbeat=beat;
                if DIR.get().is_some_and(|d|persist(d,data).is_err()) { drop(snapshot); restore_locked(); }
            }
        } else if path("shell-recovery.json").is_some_and(|p|p.exists()) { restore_locked(); }
        }
    });
}

fn recover_legacy() {
    // Older versions did not persist their original geometry. Repair only their
    // off-screen/transparency artifacts, then keep replacement disabled.
    use windows::Win32::Graphics::Gdi::{MonitorFromWindow,GetMonitorInfoW,MONITORINFO,MONITOR_DEFAULTTONEAREST};
    unsafe {
        let list=trays();
        for t in &list {
            let hwnd=HWND(t.hwnd as *mut _);
            let mut rect=RECT::default();let mut info=MONITORINFO{cbSize:std::mem::size_of::<MONITORINFO>() as u32,..Default::default()};
            if GetWindowRect(hwnd,&mut rect).is_ok() && GetMonitorInfoW(MonitorFromWindow(hwnd,MONITOR_DEFAULTTONEAREST),&mut info).as_bool() {
                let m=info.rcMonitor;
                if rect.right<=m.left || rect.left>=m.right || rect.bottom<=m.top || rect.top>=m.bottom {
                    let height=(rect.bottom-rect.top).clamp(24,100);
                    let _=SetWindowPos(hwnd,None,m.left,m.bottom-height,m.right-m.left,height,SWP_NOZORDER|SWP_NOACTIVATE|SWP_ASYNCWINDOWPOS);
                }
            }
            let ex=GetWindowLongPtrW(hwnd,GWL_EXSTYLE);
            let _=SetWindowLongPtrW(hwnd,GWL_EXSTYLE,ex & !((WS_EX_LAYERED.0|WS_EX_TRANSPARENT.0) as isize));
            let _=ShowWindowAsync(hwnd,SW_SHOW);
        }
        std::thread::sleep(Duration::from_millis(100));
        if !list.is_empty() && list.iter().all(|t|IsWindowVisible(HWND(t.hwnd as *mut _)).as_bool()) {
            if let Some(p)=path("taskbar_hidden.flag") {let _=std::fs::remove_file(p);}
        }
    }
}

#[tauri::command]
pub fn shell_heartbeat(window: tauri::WebviewWindow) {
    let first=match window.label() { "main"=>MAIN_BEAT.swap(now(),Ordering::SeqCst)==0, "dock"=>DOCK_BEAT.swap(now(),Ordering::SeqCst)==0, _=>false };
    if first {request_refresh(window.app_handle());}
}

fn start_guardian() -> bool {
    let Some(dir)=DIR.get() else{return false};
    let ready=dir.join(format!("shell-guardian-{}.ready",std::process::id()));
    if GUARDIAN_STARTED.load(Ordering::SeqCst) && ready.exists() { return true; }
    use std::os::windows::process::CommandExt;
    let Ok(exe)=std::env::current_exe() else{return false};
    let _=std::fs::remove_file(&ready);
    if std::process::Command::new(exe).arg("--shell-guardian").arg(std::process::id().to_string()).arg(dir).creation_flags(0x08000000).spawn().is_err(){return false}
    for _ in 0..40 { if ready.exists() {GUARDIAN_STARTED.store(true,Ordering::SeqCst);return true} std::thread::sleep(Duration::from_millis(50)); }
    false
}

/// Runs before Tauri, hooks, singleton mutex, or any WebView. Same signed/package binary.
pub fn guardian_entry() -> bool {
    let args:Vec<_>=std::env::args_os().collect();
    if args.get(1).and_then(|s|s.to_str())!=Some("--shell-guardian") {return false}
    let Some(pid)=args.get(2).and_then(|s|s.to_str()).and_then(|s|s.parse::<u32>().ok()) else{return true};
    let Some(dir)=args.get(3).map(PathBuf::from) else{return true};
    use windows::Win32::{System::Threading::{OpenProcess,WaitForSingleObject,PROCESS_SYNCHRONIZE},Foundation::{CloseHandle,WAIT_TIMEOUT}};
    let Ok(process)=(unsafe{OpenProcess(PROCESS_SYNCHRONIZE,false,pid)}) else{return true};
    let ready=dir.join(format!("shell-guardian-{pid}.ready"));
    let _=std::fs::write(&ready,b"ready");
    loop {
        std::thread::sleep(Duration::from_secs(1));
        let alive=unsafe{WaitForSingleObject(process,0)}==WAIT_TIMEOUT;
        let data=std::fs::read(journal(&dir)).ok().and_then(|b|serde_json::from_slice::<Snapshot>(&b).ok());
        if let Some(data)=data.filter(|s|s.owner==pid) {
            if crate::shell_policy::should_recover(alive,now(),data.heartbeat) {
                let _=std::fs::write(dir.join("shell-recovered.flag"),b"Recovered after process exit or interface timeout");
                // Retry if Explorer itself is restarting. Never launch or kill Explorer.
                for _ in 0..30 { if restore_snapshot(&data) {let _=std::fs::remove_file(journal(&dir));break} std::thread::sleep(Duration::from_secs(1)); }
                break;
            }
        }
        if !alive {break}
    }
    let _=std::fs::remove_file(ready); unsafe{let _=CloseHandle(process);} true
}

pub fn request_refresh(app:&AppHandle) {
    if STOPPING.load(Ordering::SeqCst) || QUEUED.swap(true,Ordering::SeqCst) {return}
    let app=app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(150)).await;
        QUEUED.store(false,Ordering::SeqCst);
        tauri::async_runtime::spawn_blocking(move ||refresh(&app)).await.ok();
    });
}

pub fn refresh(app:&AppHandle) {
    let _operation=crate::diagnostics::Operation::start("shell refresh");
    let _guard=LOCK.lock().unwrap_or_else(|e|e.into_inner());
    if STOPPING.load(Ordering::SeqCst) {return}
    if let Some(main)=app.get_webview_window("main") { crate::services::register_appbar(main); }
    let Some(dock)=app.get_webview_window("dock") else{restore_locked();return};
    let Ok(hwnd)=dock.hwnd() else{restore_locked();return};
    if !enabled(app) {
        let _=dock.hide(); crate::services::unregister_appbar_native(hwnd);
        DOCK_APPBAR_REGISTERED.store(false,Ordering::SeqCst); restore_locked(); return;
    }
    let ready=MAIN_BEAT.load(Ordering::SeqCst)>0 && DOCK_BEAT.load(Ordering::SeqCst)>0
        && now().saturating_sub(MAIN_BEAT.load(Ordering::SeqCst))<6000 && now().saturating_sub(DOCK_BEAT.load(Ordering::SeqCst))<6000;
    let recovered=path("shell-recovered.flag").is_some_and(|p|p.exists());
    // This dock lives on the primary monitor. Secondary taskbars stay usable.
    let replace=crate::shell_policy::replacement_allowed(requested(app),true,ready,recovered);
    if !replace {restore_locked();}
    let Ok(Some(monitor))=app.primary_monitor() else{restore_locked();return};
    let Ok(size)=dock.outer_size() else{restore_locked();return};
    if size.height<=10 {restore_locked();return}
    let pos=monitor.position(); let screen=monitor.size();
    let design:serde_json::Value=serde_json::from_str(&get_setting_str(app,"bloom-dock-design").unwrap_or_default()).unwrap_or_default();
    let n=|key:&str,default:f64,min:f64,max:f64|design[key].as_f64().filter(|v|v.is_finite()).unwrap_or(default).clamp(min,max);
    let reserved=n("size",44.,28.,64.)+2.*n("padding",10.,4.,18.)+n("offset",12.,0.,28.)+if design["labels"].as_bool().unwrap_or(false){17.}else{2.};
    let height=(reserved*crate::utils::get_bloom_scale(app)*monitor.scale_factor()).ceil() as i32;
    let fixed=get_setting_str(app,"bloom-dock-mode").as_deref().unwrap_or("fixed")=="fixed";
    unsafe {
        let mut abd=APPBARDATA{cbSize:std::mem::size_of::<APPBARDATA>() as u32,hWnd:hwnd,uCallbackMessage:crate::services::appbar_callback_message(),uEdge:ABE_BOTTOM,rc:RECT{left:pos.x,top:pos.y+screen.height as i32-height,right:pos.x+screen.width as i32,bottom:pos.y+screen.height as i32},..Default::default()};
        crate::services::install_appbar_callback(hwnd);
        if fixed && !DOCK_APPBAR_REGISTERED.load(Ordering::SeqCst) {
            if SHAppBarMessage(ABM_NEW,&mut abd)==0 {restore_locked();return}
            DOCK_APPBAR_REGISTERED.store(true,Ordering::SeqCst);
            *PLACEMENT.lock().unwrap_or_else(|e|e.into_inner())=None;
        } else if !fixed && DOCK_APPBAR_REGISTERED.swap(false,Ordering::SeqCst) {crate::services::unregister_appbar_native(hwnd);}
        SHAppBarMessage(ABM_QUERYPOS,&mut abd);
        abd.rc.top=abd.rc.bottom-height;
        let placement=(hwnd.0 as isize,abd.rc.left,abd.rc.top,abd.rc.right,abd.rc.bottom,fixed);
        let changed=PLACEMENT.lock().unwrap_or_else(|e|e.into_inner()).as_ref()!=Some(&placement);
        if fixed && changed {SHAppBarMessage(ABM_SETPOS,&mut abd);}
        let mut current=RECT::default();
        let positioned=GetWindowRect(hwnd,&mut current).is_ok()
            && current.left==abd.rc.left && current.top==abd.rc.bottom-size.height as i32
            && current.right==abd.rc.right && current.bottom==abd.rc.bottom;
        if !positioned && SetWindowPos(hwnd,None,abd.rc.left,abd.rc.bottom-size.height as i32,abd.rc.right-abd.rc.left,size.height as i32,SWP_NOZORDER|SWP_NOACTIVATE).is_err() {restore_locked();return}
        if !dock.is_visible().unwrap_or(false) && dock.show().is_err() {restore_locked();return}
        if crate::state::CURRENT_FOREGROUND_FULLSCREEN.load(Ordering::Relaxed) {
            let _=SetWindowPos(hwnd,Some(HWND_BOTTOM),0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE);
        } else { crate::utils::re_assert_topmost(hwnd); }
        *PLACEMENT.lock().unwrap_or_else(|e|e.into_inner())=Some(placement);
        if replace && !NATIVE_TASKBAR_HIDDEN.load(Ordering::SeqCst) {
            // Guard is ready, WebViews are responding, and dock placement succeeded.
            if path("shell-recovery.json").is_some_and(|p|p.exists()) && !restore_locked() {return}
            if !start_guardian(){return}
            let list=trays(); if list.is_empty(){return}
            let state=SHAppBarMessage(ABM_GETSTATE,&mut abd);
            let data=Snapshot{owner:std::process::id(),state,trays:list,heartbeat:now()};
            let Some(dir)=DIR.get() else{return};
            if persist(dir,&data).is_err(){return}
            *SNAPSHOT.lock().unwrap_or_else(|e|e.into_inner())=Some(data.clone());
            abd.lParam=LPARAM((state|1) as isize);SHAppBarMessage(ABM_SETSTATE,&mut abd);
            for t in &data.trays { if t.primary && same_window(t) { let _=ShowWindowAsync(HWND(t.hwnd as *mut _),SW_HIDE); } }
            NATIVE_TASKBAR_HIDDEN.store(true,Ordering::SeqCst);
            if path("shell-recovered.flag").is_some_and(|p|p.exists()) {restore_locked();}
            request_refresh(app);
        }
    }
    crate::services::sync_overlays(app);
}

pub fn explorer_restarted(app:&AppHandle) {
    // Do not immediately seize a recreated shell. Return to compatibility until explicitly reset.
    if requested(app) { if let Some(p)=path("shell-recovered.flag") {let _=std::fs::write(p,b"Explorer restarted; compatibility mode active");} }
    crate::state::MAIN_APPBAR_REGISTERED.store(false,Ordering::SeqCst);
    DOCK_APPBAR_REGISTERED.store(false,Ordering::SeqCst);
    request_refresh(app);
}

pub fn reset_recovery() {if let Some(p)=path("shell-recovered.flag"){let _=std::fs::remove_file(p);}}

#[tauri::command]
pub fn shell_status() -> serde_json::Value {
    let replacing=NATIVE_TASKBAR_HIDDEN.load(Ordering::SeqCst);
    serde_json::json!({"recovered":path("shell-recovered.flag").is_some_and(|p|p.exists()),"replacing":replacing,"restorePending":!replacing && path("shell-recovery.json").is_some_and(|p|p.exists())})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recovery_record_survives_restart_and_atomic_replacement() {
        let dir=std::env::temp_dir().join(format!("bloom-shell-journal-test-{}-{}",std::process::id(),now()));
        let mut snapshot=Snapshot{owner:123,state:2,trays:vec![Tray{hwnd:55,pid:88,visible:true,primary:true},Tray{hwnd:66,pid:88,visible:false,primary:false}],heartbeat:100};
        persist(&dir,&snapshot).unwrap();
        snapshot.heartbeat=200;persist(&dir,&snapshot).unwrap();
        let loaded:Snapshot=serde_json::from_slice(&std::fs::read(journal(&dir)).unwrap()).unwrap();
        assert_eq!(loaded.state,2); assert_eq!(loaded.heartbeat,200);
        assert_eq!(loaded.trays.len(),2);assert!(!loaded.trays[1].visible);
        assert_eq!(loaded.trays[0].pid,88);
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(),1);
        std::fs::remove_file(journal(&dir)).unwrap();std::fs::remove_dir(&dir).unwrap();
    }
    #[test]
    fn partial_recovery_record_is_not_treated_as_valid_state() {
        assert!(serde_json::from_str::<Snapshot>(r#"{"owner":123,"state":1}"#).is_err());
        assert!(serde_json::from_str::<Snapshot>("1").is_err());
    }
}
