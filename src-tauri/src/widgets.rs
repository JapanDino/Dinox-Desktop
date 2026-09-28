use tauri::{Emitter, Manager};
use std::sync::atomic::{AtomicBool, Ordering};

static AVAILABLE: AtomicBool = AtomicBool::new(false);
static WINDOW_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static MEDIA: std::sync::Mutex<Option<crate::types::MediaInfo>> = std::sync::Mutex::new(None);
pub fn update_media(info: &crate::types::MediaInfo) { if let Ok(mut state)=MEDIA.lock(){*state=Some(info.clone());} }
#[tauri::command]
pub fn widgets_media_snapshot()->Result<Option<crate::types::MediaInfo>,String>{MEDIA.lock().map(|s|s.clone()).map_err(|_|"Media unavailable".into())}
#[tauri::command]
pub fn widgets_media_control(action:String)->Result<(),String>{
    use crate::types::SystemCommand::*;
    let command=match action.as_str(){"toggle"=>MediaPlayPause,"next"=>MediaNext,"previous"=>MediaPrevious,_=>return Err("Unknown media action".into())};
    crate::state::COMMAND_SENDER.get().ok_or("Media unavailable")?.send(command).map_err(|_|"Media unavailable".into())
}
fn checked_target(target:&str)->Result<String,String>{
    let target=target.trim();
    if target.is_empty()||target.len()>8192||target.chars().any(char::is_control){return Err("Invalid target".into());}
    if target.to_ascii_lowercase().starts_with("https://")||target.to_ascii_lowercase().starts_with("http://"){
        let url=reqwest::Url::parse(target).map_err(|_|"Invalid URL")?;
        if url.host_str().is_none()||!url.username().is_empty()||url.password().is_some(){return Err("Invalid URL".into());}
        return Ok(url.to_string());
    }
    let path=std::path::Path::new(target);
    if !path.is_absolute()||!path.exists(){return Err("File no longer exists".into());}
    Ok(target.to_owned())
}
#[tauri::command]
pub async fn widgets_open_target(target:String)->Result<(),String>{
    tauri::async_runtime::spawn_blocking(move||crate::system_launch::launch(&checked_target(&target)?)).await.map_err(|e|e.to_string())?
}

#[tauri::command]
pub async fn notes_open_window(app:tauri::AppHandle,id:String)->Result<(),String>{
    if id.is_empty()||id.len()>64||!id.bytes().all(|c|c.is_ascii_alphanumeric()||c==b'-'){return Err("Invalid note ID".into());}
    let _guard=WINDOW_LOCK.lock().await;
    let label=format!("sticky-{id}");
    if let Some(win)=app.get_webview_window(&label){win.show().map_err(|e|e.to_string())?;return win.set_focus().map_err(|e|e.to_string());}
    if app.webview_windows().keys().filter(|label|label.starts_with("sticky-")).count()>=12{return Err("Close a sticky note window first (maximum 12)".into());}
    tauri::WebviewWindowBuilder::new(&app,label,tauri::WebviewUrl::App(format!("widgets.html?note={id}").into()))
        .title("Dinox · Notes").inner_size(440.,560.).min_inner_size(320.,360.)
        .decorations(false).resizable(true).center().build().map_err(|e|e.to_string())?;
    Ok(())
}
#[tauri::command]
pub fn notes_set_top(window:tauri::WebviewWindow,top:bool)->Result<(),String>{
    if !window.label().starts_with("sticky-"){return Err("Not a note window".into());}
    window.set_always_on_top(top).map_err(|e|e.to_string())
}
#[tauri::command]
pub fn notes_close_window(window:tauri::WebviewWindow)->Result<(),String>{
    if !window.label().starts_with("sticky-"){return Err("Not a note window".into());}
    window.destroy().map_err(|e|e.to_string())
}
#[tauri::command]
pub async fn notes_export_backup(app:tauri::AppHandle,contents:String)->Result<(),String>{
    use tauri_plugin_dialog::DialogExt;
    if contents.len()>100_000_000{return Err("Backup too large".into());}
    tauri::async_runtime::spawn_blocking(move||{
        let path=app.dialog().file().set_file_name("dinox-notes-backup.json").add_filter("JSON",&["json"]).blocking_save_file();
        if let Some(path)=path{let path=path.into_path().map_err(|e|e.to_string())?;std::fs::write(path,contents).map_err(|e|e.to_string())?;}
        Ok(())
    }).await.map_err(|e|e.to_string())?
}

pub unsafe fn register_hotkey(hwnd: windows::Win32::Foundation::HWND, app: &tauri::AppHandle) {
    use windows::Win32::UI::Input::KeyboardAndMouse::*;
    let _ = UnregisterHotKey(Some(hwnd), 0xB102);
    let enabled = crate::utils::get_setting_str(app, "dinox-widgets-enabled").as_deref() == Some("true");
    let choice = crate::utils::get_setting_str(app, "dinox-widgets-shortcut").unwrap_or_else(|| "custom:3:87".into());
    let available = enabled && !crate::launcher::recording_shortcut() && match crate::launcher::parse_shortcut(&choice) {
        Ok(Some((mods, key))) => RegisterHotKey(Some(hwnd), 0xB102, HOT_KEY_MODIFIERS(mods) | MOD_NOREPEAT, key).is_ok(),
        _ => false,
    };
    AVAILABLE.store(available, Ordering::Relaxed);
    let _ = app.emit("widgets-shortcut-status", available);
}

#[tauri::command]
pub fn widgets_hotkey_status() -> bool { AVAILABLE.load(Ordering::Relaxed) }
#[tauri::command]
pub fn widgets_retry_shortcut() { crate::launcher::refresh_hotkey(); }

pub fn hide(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("widgets") {
        win.hide().map_err(|e| e.to_string())?;
        let _ = win.emit("widgets-visibility", false);
    }
    Ok(())
}
#[tauri::command]
pub fn widgets_hide(app: tauri::AppHandle) -> Result<(), String> { hide(&app) }

async fn show(app: &tauri::AppHandle) -> Result<(), String> {
    if crate::utils::get_setting_str(app, "dinox-widgets-enabled").as_deref() != Some("true") {
        return Err("Enable widgets in Workspace settings first".into());
    }
    let win = match app.get_webview_window("widgets") {
        Some(win) => win,
        None => {
            let config = app.config().app.windows.iter().find(|c| c.label == "widgets").ok_or("Widgets configuration unavailable")?;
            tauri::WebviewWindowBuilder::from_config(app, config).map_err(|e| e.to_string())?.build().map_err(|e| e.to_string())?
        }
    };
    // A regular overlay: never register an AppBar or reserve desktop work area.
    let under_cursor = app.cursor_position().ok().and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten());
    if let Some(monitor) = under_cursor.or(win.current_monitor().map_err(|e| e.to_string())?) {
        // Cover this monitor, including the taskbar area, without changing its
        // work area or entering exclusive fullscreen. Physical coordinates also
        // support mixed-DPI monitors and monitors to the left of the primary.
        win.set_position(*monitor.position()).map_err(|e| e.to_string())?;
        win.set_size(*monitor.size()).map_err(|e| e.to_string())?;
    } else { win.center().map_err(|e| e.to_string())?; }
    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())?;
    let _ = win.emit("widgets-visibility", true);
    Ok(())
}
#[tauri::command]
pub async fn widgets_show(app: tauri::AppHandle) -> Result<(), String> {
    let _guard = WINDOW_LOCK.lock().await;
    show(&app).await
}
pub fn toggle(app: &tauri::AppHandle) {
    let app = app.clone();
    // Hotkey callback runs on the Win32 message thread; defer WebView operations.
    tauri::async_runtime::spawn(async move {
        let _guard = WINDOW_LOCK.lock().await;
        if app.get_webview_window("widgets").is_some_and(|w| w.is_visible().unwrap_or(false)) { if let Err(error)=hide(&app){crate::diagnostics::record(&format!("Hide widget board: {error}"));} }
        else if let Err(error) = show(&app).await { crate::diagnostics::record(&format!("Widget board: {error}")); }
    });
}
