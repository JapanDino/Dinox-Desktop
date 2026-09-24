//! Optional Windows notification reader. No history persistence or remote calls.
use serde::Serialize;
use tauri::{AppHandle, Manager, Emitter};
use windows::{core::HSTRING, ApplicationModel::Package, UI::Notifications::{Management::{UserNotificationListener,UserNotificationListenerAccessStatus},NotificationKinds}};

fn status()->&'static str {
    // Tauri commands and diagnostics may run on threads without a WinRT apartment.
    let _apartment=Apartment::new();
    if Package::Current().is_err() { return "package_required" }
    match UserNotificationListener::Current().and_then(|x|x.GetAccessStatus()) {
        Ok(UserNotificationListenerAccessStatus::Allowed)=>"allowed",
        Ok(UserNotificationListenerAccessStatus::Denied)=>"denied",
        Ok(_)=>"not_requested",Err(_)=>"unavailable",
    }
}
struct Apartment(bool);
impl Apartment {fn new()->Self{Self(unsafe{windows::Win32::System::WinRT::RoInitialize(windows::Win32::System::WinRT::RO_INIT_MULTITHREADED).is_ok()})}}
impl Drop for Apartment {fn drop(&mut self){if self.0 {unsafe{windows::Win32::System::WinRT::RoUninitialize();}}}}
pub fn access_probe()->serde_json::Value {
    let _apartment=Apartment::new();
    serde_json::json!({"packageIdentity":Package::Current().is_ok(),"access":status()})
}
#[tauri::command]
pub fn notification_access_status()->String {status().into()}

static WATCH:std::sync::Mutex<Option<(UserNotificationListener,i64)>>=std::sync::Mutex::new(None);
#[tauri::command]
pub fn notification_watch(app:AppHandle,watch:bool)->Result<(),String>{
    let _apartment=Apartment::new();
    let mut state=WATCH.lock().map_err(|_|"Notification watcher unavailable")?;
    if let Some((listener,token))=state.take(){let _=listener.RemoveNotificationChanged(token);}
    if !watch||!enabled(&app){return Ok(())}
    if status()!="allowed"{return Err("Windows notification permission unavailable".into())}
    let listener=UserNotificationListener::Current().map_err(|e|e.to_string())?;
    let handler=windows::Foundation::TypedEventHandler::<UserNotificationListener,windows::UI::Notifications::UserNotificationChangedEventArgs>::new(move|_,_|{
        if enabled(&app){let _=app.emit_to("main","bloom-notifications-changed",());}Ok(())
    });
    let token=listener.NotificationChanged(&handler).map_err(|e|e.to_string())?;
    *state=Some((listener,token));Ok(())
}

#[tauri::command]
pub async fn notification_request_access(app:AppHandle)->Result<String,String> {
    if status()=="package_required" { return Ok("package_required".into()) }
    let (send,receive)=tokio::sync::oneshot::channel();
    // Request must originate on the UI thread; await its completion elsewhere.
    app.run_on_main_thread(move|| {
        let operation=UserNotificationListener::Current().and_then(|x|x.RequestAccessAsync());
        std::thread::spawn(move|| {
            let result=operation.and_then(|x|x.get()).map(|s|match s {UserNotificationListenerAccessStatus::Allowed=>"allowed",UserNotificationListenerAccessStatus::Denied=>"denied",_=>"not_requested"}.to_string()).map_err(|_|"Windows не смогла запросить доступ. Проверьте установку MSIX и разрешение «Уведомления».".to_string());
            let _=send.send(result);
        });
    }).map_err(|_|"Не удалось открыть запрос Windows")?;
    receive.await.map_err(|_|"Запрос Windows был закрыт".to_string())?
}
#[derive(Serialize)]
pub struct Notice {id:u32,app_id:String,app_name:String,title:String,body:String,created:i64}

fn enabled(app:&AppHandle)->bool {
    let raw=crate::utils::get_setting_str(app,"bloom-notifications").unwrap_or_default();
    let value:serde_json::Value=serde_json::from_str(&raw).unwrap_or_default();
    value["enabled"].as_bool()==Some(true)&&value["windowsEnabled"].as_bool()==Some(true)
}
#[tauri::command]
pub async fn notification_snapshot(app:AppHandle)->Result<Vec<Notice>,String> {
    if !enabled(&app) {return Ok(vec![])}
    tauri::async_runtime::spawn_blocking(move|| {
        struct Apartment(bool);
        impl Drop for Apartment {fn drop(&mut self){if self.0 {unsafe {windows::Win32::System::WinRT::RoUninitialize();}}}}
        let _apartment=Apartment(unsafe {windows::Win32::System::WinRT::RoInitialize(windows::Win32::System::WinRT::RO_INIT_MULTITHREADED).is_ok()});
        if status()!="allowed" {return Err("Нет доступа к уведомлениям Windows. Включите разрешение в настройках Dinox.".into())}
        let listener=UserNotificationListener::Current().map_err(|_|"Служба уведомлений недоступна")?;
        let items=listener.GetNotificationsAsync(NotificationKinds::Toast).and_then(|x|x.get()).map_err(|_|"Не удалось получить уведомления Windows")?;
        let mut output=Vec::new();
        for i in 0..items.Size().unwrap_or(0).min(512) {
            // A broken notification must not prevent reading the others.
            let read=||->windows::core::Result<Notice>{
                let n=items.GetAt(i)?;let info=n.AppInfo()?;
                let binding=n.Notification()?.Visual()?.GetBinding(&HSTRING::from("ToastGeneric"))?;
                let text=binding.GetTextElements()?;
                let mut lines=Vec::new();
                for j in 0..text.Size()?.min(12) { lines.push(text.GetAt(j)?.Text()?.to_string().chars().take(1500).collect::<String>()); }
                let title=lines.first().cloned().unwrap_or_default();
                let body=lines.into_iter().skip(1).collect::<Vec<_>>().join("\n").chars().take(4000).collect();
                Ok(Notice{id:n.Id()?,app_id:info.AppUserModelId()?.to_string(),app_name:info.DisplayInfo()?.DisplayName()?.to_string(),title,body,created:n.CreationTime()?.UniversalTime/10000-11644473600000})
            };
            if let Ok(notice)=read() {output.push(notice)}
        }
        output.sort_by_key(|n|std::cmp::Reverse(n.created));output.truncate(50);Ok(output)
    }).await.map_err(|_|"Обработка уведомлений прервалась".to_string())?
}

#[tauri::command]
pub fn open_bloom_notifications(app:AppHandle) {
    use tauri::Emitter;
    if let Some(main)=app.get_webview_window("main") {let _=main.show();}
    let _=app.emit_to("main","bloom-open-notifications",());
}
#[cfg(test)]
mod tests {
    #[test]fn unpackaged_access_is_explicit(){assert!(matches!(super::status(),"package_required"|"allowed"|"denied"|"not_requested"|"unavailable"));}
}
