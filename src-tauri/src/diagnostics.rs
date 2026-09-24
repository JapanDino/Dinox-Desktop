use std::{fs::OpenOptions, io::Write, path::PathBuf, sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex, OnceLock}, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};
use tauri::{AppHandle, Manager};

static LOG_PATH: OnceLock<PathBuf> = OnceLock::new();
static LOG_LOCK: Mutex<()> = Mutex::new(());

pub fn record(message: &str) {
    let Some(path) = LOG_PATH.get() else { return };
    let Ok(_lock) = LOG_LOCK.lock() else { return };
    if std::fs::metadata(path).map(|m| m.len() > 512 * 1024).unwrap_or(false) {
        let old = path.with_extension("previous.log");
        let _ = std::fs::remove_file(&old);
        let _ = std::fs::rename(path, old);
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
        let _ = writeln!(file, "{time} {message}");
    }
}

pub struct Operation { name: &'static str, start: Instant }
impl Operation {
    pub fn start(name: &'static str) -> Self {
        record(&format!("begin {name}"));
        Self { name, start: Instant::now() }
    }
}
impl Drop for Operation {
    fn drop(&mut self) { record(&format!("end {} {}ms", self.name, self.start.elapsed().as_millis())); }
}

pub fn init(app: &AppHandle) {
    if let Ok(dir) = app.path().app_config_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = LOG_PATH.set(dir.join("diagnostics.log"));
    }
    record(concat!("start Dinox ", env!("CARGO_PKG_VERSION")));
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        // Log the code location only; a panic payload can contain private data.
        if let Some(location) = info.location() { record(&format!("panic at {}:{}", location.file(), location.line())); }
        previous(info);
    }));
    let app = app.clone();
    std::thread::spawn(move || {
        let pending = Arc::new(AtomicBool::new(false));
        let mut sent = Instant::now();
        let mut reported = false;
        loop {
            std::thread::sleep(Duration::from_secs(5));
            if pending.load(Ordering::Acquire) {
                if sent.elapsed() >= Duration::from_secs(15) && !reported {
                    record("UI heartbeat delayed at least 15s (hang, suspension or heavy load)");
                    reported = true;
                }
                continue; // At most one queued heartbeat, even during a hang.
            }
            if reported { record("UI heartbeat recovered"); reported = false; }
            pending.store(true, Ordering::Release);
            sent = Instant::now();
            let ack = pending.clone();
            if app.run_on_main_thread(move || ack.store(false, Ordering::Release)).is_err() { break; }
        }
    });
}
