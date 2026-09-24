use serde::Serialize;
use std::{sync::{Mutex, atomic::{AtomicBool, Ordering}}, time::Duration};
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Clone, Default, Serialize)]
pub struct UpdateCheckResult {
    pub available: bool,
    pub version: Option<String>,
    pub date: Option<String>,
    pub body: Option<String>,
}
static PENDING: Mutex<Option<Update>> = Mutex::new(None);
static CHECK_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static INSTALLING: AtomicBool = AtomicBool::new(false);

fn view(update: Option<&Update>) -> UpdateCheckResult {
    update.map(|u| UpdateCheckResult { available: true, version: Some(u.version.clone()),
        date: u.date.map(|d| d.to_string()), body: u.body.clone() }).unwrap_or_default()
}
fn status(app: &AppHandle, state: &str, progress: Option<u64>) {
    let _ = app.emit("auto-update-status", serde_json::json!({"status":state,"progress":progress}));
}
fn valid_release(update: &Update) -> bool {
    let url = &update.download_url;
    url.scheme() == "https" && url.host_str() == Some("github.com") &&
        url.path().starts_with("/JapanDino/Dinox-Desktop/releases/download/") &&
        url.path().ends_with(".exe") && url.username().is_empty() && url.password().is_none() &&
        update.version.split('.').count() == 3 && update.version.split('.').all(|s| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()))
}

fn builder(app: &AppHandle) -> tauri_plugin_updater::UpdaterBuilder {
    let exit_app = app.clone();
    let mut builder = app.updater_builder().timeout(Duration::from_secs(25)).on_before_exit(move || {
        // Windows updater exits without the normal RunEvent::Exit path.
        crate::shell_controller::shutdown();
        exit_app.cleanup_before_exit();
    });
    #[cfg(windows)]
    if let Ok(exe) = std::env::current_exe() {
        // Keep the existing directory and sparse package identity during migration.
        if let Some(parent) = exe.parent() { builder = builder.installer_arg(format!("/D={}", parent.display())); }
    }
    builder
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle, force: bool) -> Result<UpdateCheckResult, String> {
    let _guard = CHECK_LOCK.try_lock().map_err(|_| "Проверка обновлений уже выполняется")?;
    if !force {
        let pending = PENDING.lock().map_err(|_| "Update state unavailable")?;
        if pending.is_some() { return Ok(view(pending.as_ref())); }
    }
    let result = builder(&app).build().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    if result.as_ref().is_some_and(|u| !valid_release(u)) { return Err("Недопустимый источник обновления Dinox".into()); }
    let summary = view(result.as_ref());
    *PENDING.lock().map_err(|_| "Update state unavailable")? = result;
    let _ = app.emit("update-available", summary.clone());
    Ok(summary)
}

#[tauri::command]
pub fn get_update_state(_app: AppHandle) -> UpdateCheckResult {
    PENDING.lock().map(|state| view(state.as_ref())).unwrap_or_default()
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    if INSTALLING.swap(true, Ordering::SeqCst) { return Err("Обновление уже устанавливается".into()); }
    struct Reset;
    impl Drop for Reset { fn drop(&mut self) { INSTALLING.store(false, Ordering::SeqCst); } }
    let _reset = Reset;
    let result: Result<(), String> = async {
        // Recheck immediately: a withdrawn release must not be installed from stale metadata.
        check_for_updates(app.clone(), true).await?;
        let mut update = PENDING.lock().map_err(|_| "Update state unavailable")?.clone().ok_or("Новых обновлений нет")?;
        update.timeout = Some(Duration::from_secs(300));
        status(&app, "downloading", Some(0));
        let mut downloaded = 0u64;
        let mut last_percent = 101u64;
        let bytes = update.download(|chunk, total| {
            downloaded += chunk as u64;
            let percent = total.filter(|n| *n > 0).map(|n| (downloaded.saturating_mul(100) / n).min(100));
            if let Some(value) = percent { if value != last_percent { last_percent = value; status(&app, "downloading", Some(value)); } }
        }, || {}).await.map_err(|e| e.to_string())?;
        // download() checks the cryptographic signature BEFORE install().
        status(&app, "installing", Some(100));
        update.install(bytes).map_err(|e| e.to_string())?;
        status(&app, "done", Some(100));
        Ok(())
    }.await;
    if result.is_err() { status(&app, "error", None); }
    result
}

pub async fn run_startup_check(app: AppHandle) {
    tokio::time::sleep(Duration::from_secs(15)).await;
    if let Ok(result) = check_for_updates(app.clone(), true).await {
        if result.available && crate::utils::get_setting_str(&app, "dinox-auto-update").as_deref() == Some("true") {
            let _ = install_update(app.clone()).await;
        }
    }
    loop {
        tokio::time::sleep(Duration::from_secs(6 * 60 * 60)).await;
        // During a session notify only; automatic installation is startup-only.
        let _ = check_for_updates(app.clone(), true).await;
    }
}

/// Read-only verification against our published release. Never installs or changes settings.
pub async fn verify_release(app: AppHandle, tamper: bool) -> serde_json::Value {
    let result: Result<serde_json::Value, String> = async {
        let mut update = builder(&app).version_comparator(|_, _| true).build().map_err(|e| e.to_string())?
            .check().await.map_err(|e| e.to_string())?.ok_or("No release metadata")?;
        if !valid_release(&update) { return Err("Unexpected release URL".into()); }
        if tamper { update.signature = "invalid-signature".into(); }
        update.timeout = Some(Duration::from_secs(300));
        let bytes = update.download(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
        Ok(serde_json::json!({"version":update.version,"signatureVerified":true,"bytes":bytes.len(),"installed":false}))
    }.await;
    match result { Ok(value) => value, Err(error) => serde_json::json!({"error":error,"signatureVerified":false,"installed":false}) }
}
