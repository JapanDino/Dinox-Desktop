//! Optional per-user Telegram transport. All process I/O runs off the UI thread.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{io::{BufRead, BufReader, Write}, path::PathBuf, process::{Child, Command, Stdio}, sync::{mpsc, Mutex, OnceLock}, time::{Duration, Instant}};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize, Deserialize)]
#[serde(default)]
struct Config { enabled: bool, port: u16, secret: String }
impl Default for Config {
    fn default() -> Self { Self { enabled: false, port: 1443, secret: uuid::Uuid::new_v4().simple().to_string() } }
}
impl Config {
    fn validate(&self) -> Result<(), String> {
        if self.port < 1024 || self.secret.len() != 32 || !self.secret.bytes().all(|b| b.is_ascii_hexdigit()) { return Err("invalid_config".into()); }
        Ok(())
    }
    fn link(&self) -> String { format!("tg://proxy?server=127.0.0.1&port={}&secret={}", self.port, self.secret) }
}
#[derive(Clone, Default, Serialize)]
pub struct Status {
    enabled: bool, available: bool, running: bool, port: u16,
    active: u64, up: u64, down: u64, errors: u64, ws: u64, tcp: u64,
    error: Option<String>,
}
#[derive(Default)]
struct Runtime { child: Option<Child>, messages: Option<mpsc::Receiver<Value>>, status: Status }
static RUNTIME: OnceLock<Mutex<Runtime>> = OnceLock::new();
fn runtime() -> &'static Mutex<Runtime> { RUNTIME.get_or_init(|| Mutex::new(Runtime::default())) }
fn path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|_| "storage_failed")?.join("telegram-proxy.bin"))
}
fn load(app: &AppHandle) -> Result<Config, String> {
    let path = path(app)?;
    if !path.exists() { return Ok(Config::default()); }
    let data = std::fs::read(path).map_err(|_| "storage_failed")?;
    if data.len() > 16384 { return Err("invalid_config".into()); }
    let data = crate::calendar::protect(&data, false).map_err(|_| "storage_failed")?;
    let config: Config = serde_json::from_slice(&data).map_err(|_| "invalid_config")?;
    config.validate()?;
    Ok(config)
}
fn save(app: &AppHandle, config: &Config) -> Result<(), String> {
    config.validate()?;
    let path = path(app)?;
    std::fs::create_dir_all(path.parent().ok_or("storage_failed")?).map_err(|_| "storage_failed")?;
    let data = serde_json::to_vec(config).map_err(|_| "storage_failed")?;
    let data = crate::calendar::protect(&data, true).map_err(|_| "storage_failed")?;
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, data).map_err(|_| "storage_failed")?;
    std::fs::rename(tmp, path).map_err(|_| "storage_failed")?;
    Ok(())
}
fn helper(app: &AppHandle) -> Result<PathBuf, String> {
    let relative = "telegram-proxy/dinox-telegram-proxy/dinox-telegram-proxy.exe";
    let path = app.path().resource_dir().map_err(|_| "helper_missing")?.join(relative);
    if path.is_file() { return Ok(path); }
    #[cfg(debug_assertions)] {
        let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(relative);
        if dev.is_file() { return Ok(dev); }
    }
    Err("helper_missing".into())
}
impl Runtime {
    fn stop(&mut self) {
        if let Some(mut child) = self.child.take() {
            drop(child.stdin.take()); // graceful EOF also works if the parent crashes
            let deadline = Instant::now() + Duration::from_secs(2);
            loop {
                match child.try_wait() {
                    Ok(Some(_)) => break,
                    _ if Instant::now() >= deadline => { let _ = child.kill(); let _ = child.wait(); break; }
                    _ => std::thread::sleep(Duration::from_millis(30)),
                }
            }
        }
        self.messages = None;
        self.status.running = false;
        self.status.active = 0;
    }
    fn refresh(&mut self) {
        if let Some(rx) = &self.messages {
            for msg in rx.try_iter() {
                if let Some(error) = msg.get("error").and_then(Value::as_str) { self.status.error = Some(safe_error(error)); }
                if msg.get("active").is_some() {
                    self.status.active = msg["active"].as_u64().unwrap_or(0);
                    self.status.up = msg["up"].as_u64().unwrap_or(0);
                    self.status.down = msg["down"].as_u64().unwrap_or(0);
                    self.status.errors = msg["errors"].as_u64().unwrap_or(0);
                    self.status.ws = msg["ws"].as_u64().unwrap_or(0);
                    self.status.tcp = msg["tcp"].as_u64().unwrap_or(0);
                }
            }
        }
        if let Some(child) = self.child.as_mut() {
            if !matches!(child.try_wait(), Ok(None)) {
                self.stop();
                self.status.error.get_or_insert("helper_stopped".into());
            }
        }
    }
    fn start(&mut self, app: &AppHandle, config: &Config) -> Result<(), String> {
        self.refresh();
        if self.status.running && self.status.port == config.port { return Ok(()); }
        self.stop();
        self.status = Status { enabled: config.enabled, port: config.port, available: helper(app).is_ok(), ..Status::default() };
        let mut cmd = Command::new(helper(app)?);
        cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
        #[cfg(windows)] { use std::os::windows::process::CommandExt; cmd.creation_flags(0x08000000); }
        let mut child = cmd.spawn().map_err(|_| "helper_failed")?;
        let result = (|| -> Result<mpsc::Receiver<Value>, String> {
            let input = child.stdin.as_mut().ok_or("helper_failed")?;
            writeln!(input, "{}", json!({"port": config.port, "secret": config.secret})).map_err(|_| "helper_failed")?;
            input.flush().map_err(|_| "helper_failed")?;
            let stdout = child.stdout.take().ok_or("helper_failed")?;
            let (tx, rx) = mpsc::sync_channel(8);
            std::thread::spawn(move || {
                let mut reader = BufReader::new(stdout);
                loop {
                    // Bound each IPC frame before allocating; status telemetry may be dropped.
                    let mut bytes = Vec::new();
                    let mut limited = std::io::Read::take(&mut reader, 4097);
                    if limited.read_until(b'\n', &mut bytes).unwrap_or(0) == 0 || bytes.len() > 4096 { break; }
                    if let Ok(value) = serde_json::from_slice::<Value>(&bytes) {
                        match tx.try_send(value) { Err(mpsc::TrySendError::Disconnected(_)) => break, _ => {} }
                    }
                }
            });
            let first = rx.recv_timeout(Duration::from_secs(15)).map_err(|_| "start_timeout")?;
            if first["ready"] != true { return Err(safe_error(first["error"].as_str().unwrap_or("helper_failed"))); }
            Ok(rx)
        })();
        match result {
            Ok(rx) => { self.child = Some(child); self.messages = Some(rx); self.status.running = true; Ok(()) }
            Err(error) => { let _ = child.kill(); let _ = child.wait(); Err(error) }
        }
    }
}
fn safe_error(value: &str) -> String {
    match value { "invalid_config" | "port_unavailable" => value.to_owned(), _ => "helper_failed".into() }
}
#[tauri::command]
pub async fn telegram_proxy_status(app: AppHandle) -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = load(&app)?;
        let mut state = runtime().lock().map_err(|_| "helper_failed")?;
        state.refresh();
        state.status.enabled = config.enabled;
        state.status.port = config.port;
        state.status.available = helper(&app).is_ok();
        Ok(state.status.clone())
    }).await.map_err(|_| "helper_failed")?
}
#[tauri::command]
pub async fn telegram_proxy_set(app: AppHandle, enabled: bool, port: u16) -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut state = runtime().lock().map_err(|_| "helper_failed")?;
        let mut config = load(&app)?;
        config.enabled = enabled;
        config.port = port;
        config.validate()?;
        if enabled {
            if let Err(error) = state.start(&app, &config) { state.status.error = Some(error.clone()); return Err(error); }
            if let Err(error) = save(&app, &config) { state.stop(); return Err(error); }
        } else {
            save(&app, &config)?;
            state.stop();
        }
        state.status.enabled = enabled;
        state.status.port = port;
        state.status.error = None;
        Ok(state.status.clone())
    }).await.map_err(|_| "helper_failed")?
}
#[tauri::command]
pub async fn telegram_proxy_connect(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut state = runtime().lock().map_err(|_| "helper_failed")?;
        state.refresh();
        if !state.status.running { return Err("not_running".into()); }
        let config = load(&app)?;
        // Only this generated loopback MTProto link is permitted, never a UI-supplied URL.
        app.opener().open_url(config.link(), None::<&str>).map_err(|_| "telegram_missing".into())
    }).await.map_err(|_| "helper_failed")?
}
pub fn init(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        if let Ok(mut state) = runtime().lock() {
            match load(&app) {
                Ok(config) if config.enabled => { if let Err(error) = state.start(&app, &config) { state.status.error = Some(error); } }
                Err(error) => state.status.error = Some(error),
                _ => {},
            }
        }
    });
}
pub fn shutdown() { if let Ok(mut state) = runtime().lock() { state.stop(); } }

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn config_limits_and_link() {
        let mut c = Config::default(); assert!(!c.enabled); assert!(c.validate().is_ok());
        assert!(c.link().starts_with("tg://proxy?server=127.0.0.1&port=1443&secret="));
        c.secret = "x&server=evil.example".into(); assert!(c.validate().is_err());
        c = Config::default(); c.port = 80; assert!(c.validate().is_err());
    }
    #[test] fn status_never_contains_secret() {
        let s = serde_json::to_string(&Status::default()).unwrap(); assert!(!s.contains("secret"));
        assert_eq!(safe_error("secret=private"), "helper_failed");
    }
}
