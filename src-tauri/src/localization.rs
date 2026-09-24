use std::sync::OnceLock;
use tauri::{AppHandle, Manager, menu::MenuItem};
static MENU: OnceLock<[MenuItem<tauri::Wry>;3]>=OnceLock::new();
pub fn register_menu(items:[MenuItem<tauri::Wry>;3]) {let _=MENU.set(items);}
pub fn apply(app:&AppHandle) {
    let en=crate::utils::get_setting_str(app,"bloom-language").as_deref()==Some("en");
    if let Some(items)=MENU.get(){
        for (item,text) in items.iter().zip(if en {["Dinox Settings","Restart Dinox","Quit"]}else{["Настройки Dinox","Перезапустить Dinox","Выйти"]}) {let _=item.set_text(text);}
    }
    if let Some(window)=app.get_webview_window("settings"){let _=window.set_title(if en {"Dinox Settings"}else{"Настройки Dinox"});}
}
pub fn startup_english()->bool {
    let Some(dir)=std::env::var_os("APPDATA") else{return false};
    let path=std::path::PathBuf::from(dir).join("com.japandino.bloompersonal").join("settings.json");
    std::fs::read(path).ok().and_then(|b|serde_json::from_slice::<serde_json::Value>(&b).ok()).is_some_and(|v|v["bloom-language"].as_str()==Some("en"))
}
