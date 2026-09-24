use tauri::{AppHandle, Emitter, Manager, Window};
use windows::Win32::Foundation::{HWND, LPARAM};
use windows::Win32::UI::WindowsAndMessaging::EnumWindows;
use std::sync::atomic::Ordering;

use crate::types::{IntRect, AppInfo, BrightnessChangeEvent};
use crate::state::*;
use crate::utils::*;
use crate::services::{register_appbar, sync_overlays, unregister_appbar_native, enum_windows_proc};
use std::collections::HashMap;
static SETTINGS_WRITE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[tauri::command]
pub async fn set_menu_open(app: AppHandle, open: bool, rect: Option<IntRect>) {
    let was_open = MENU_IS_OPEN.swap(open, Ordering::Relaxed);
    if let Ok(mut r) = MENU_RECT.lock() {
        *r = rect;
    }
    // NOACTIVATE keeps ordinary dock clicks from stealing application focus.
    // A deliberately opened panel needs keyboard input (including Wi-Fi passwords).
    // Bounds updates must never activate it again after the user switches apps.
    if open && !was_open {
        if let Some(dock) = app.get_webview_window("dock") {
            if let Err(error) = dock.set_focus() {
                crate::diagnostics::record(&format!("dock panel focus failed: {error}"));
            }
        }
    }
}

#[tauri::command]
pub async fn set_dock_hovered(hovered: bool) {
    DOCK_IS_HOVERED.store(hovered, Ordering::Relaxed);
}

#[tauri::command]
pub async fn set_notch_hovered(hovered: bool) {
    NOTCH_IS_HOVERED.store(hovered, Ordering::Relaxed);
}

#[tauri::command]
pub async fn update_dock_rect(rect: IntRect) {
    if let Ok(mut r) = DOCK_RECT.lock() {
        *r = Some(rect);
    }
}

#[tauri::command]
pub async fn update_notch_rect(rect: IntRect) {
    if let Ok(mut r) = NOTCH_RECT.lock() {
        *r = Some(rect);
    }
}

#[tauri::command]
pub fn set_window_height(window: Window, height: f64) {
    if let Ok(scale_factor) = window.scale_factor() {
        if let Ok(physical_size) = window.inner_size() {
            let logical_width = physical_size.width as f64 / scale_factor;
            let _ = window.set_size(tauri::LogicalSize::new(logical_width, height));
        }
    }
}

#[tauri::command]
pub fn resize_settings_window(app: AppHandle, width: f64, height: f64) {
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.set_size(tauri::LogicalSize::new(width, height));
    }
}

#[tauri::command]
pub fn set_ignore_cursor_events(window: Window, ignore: bool) {
    let _ = window.set_ignore_cursor_events(ignore);
}

#[tauri::command]
pub async fn init_dock(app: AppHandle, mode: String) {
    let _ = mode;
    crate::shell_controller::request_refresh(&app);
}

#[tauri::command]
pub async fn toggle_dock(app: AppHandle, enable: bool) {
    // Settings are already persisted by the caller; never echo settings-changed.
    let _ = enable;
    crate::shell_controller::request_refresh(&app);
}

#[tauri::command]
pub async fn sync_appbar(app: AppHandle) {
    if let Some(win)=app.get_webview_window("main") {
        register_appbar(win);
    }
    crate::shell_controller::request_refresh(&app);
    sync_overlays(&app);
}

#[tauri::command]
pub async fn change_dock_mode(app: AppHandle, mode: String) {
    let _ = mode;
    crate::shell_controller::request_refresh(&app);
}

#[tauri::command]
pub async fn change_notch_mode(app: AppHandle, mode: String) {
    if let Some(main_win) = app.get_webview_window("main") {
        if mode == "fixed" {
            register_appbar(main_win.clone());
        } else {
            let _ = main_win.show();
            if let Ok(hwnd) = main_win.hwnd() {
                let hwnd_val = hwnd.0 as isize;
                tauri::async_runtime::spawn_blocking(move || {
                    unregister_appbar_native(HWND(hwnd_val as *mut _));
                });
                MAIN_APPBAR_REGISTERED.store(false, Ordering::Relaxed);
                
                let main_clone = main_win.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                    if !MAIN_APPBAR_REGISTERED.load(Ordering::Relaxed) {
                        if let Ok(hwnd) = main_clone.hwnd() { re_assert_topmost(hwnd); }
                    }
                });
            }
        }
        // Reposition window to span the full primary monitor so CSS justify-content:center works
        if let Ok(Some(monitor)) = main_win.primary_monitor() {
            let m_pos = monitor.position();
            let m_size = monitor.size();
            let scale = monitor.scale_factor();
            let bloom_scale = crate::utils::get_bloom_scale(&app);
            let target_height = ((760.0 * bloom_scale * scale) as u32).min(m_size.height);
            let _ = main_win.set_position(tauri::PhysicalPosition::new(m_pos.x, m_pos.y));
            let _ = main_win.set_size(tauri::PhysicalSize::new(m_size.width, target_height));
        }
        
        let current = CURRENT_NOTCH_OVERLAP.load(Ordering::Relaxed);
        if current != -1 {
            let _ = app.emit("notch-overlap", current == 1);
        }
    }
}

fn get_uwp_launch_cmd(exe_path: &str) -> Option<String> {
    let path = std::path::Path::new(exe_path);
    let mut is_windows_apps = false;
    let mut package_folder = String::new();
    
    for component in path.components() {
        if let std::path::Component::Normal(s) = component {
            let s_str = s.to_string_lossy();
            if is_windows_apps {
                package_folder = s_str.to_string();
                break;
            }
            if s_str.eq_ignore_ascii_case("WindowsApps") {
                is_windows_apps = true;
            }
        }
    }
    
    if !package_folder.is_empty() {
        // package_folder format: PackageName_Version_Architecture__PublisherId
        // We want: PackageName_PublisherId!App
        if let Some(publisher_idx) = package_folder.rfind("__") {
            let publisher_id = &package_folder[publisher_idx + 2..];
            if let Some(first_underscore) = package_folder.find('_') {
                let package_name = &package_folder[..first_underscore];
                return Some(format!("shell:AppsFolder\\{}_{}!App", package_name, publisher_id));
            }
        }
    }
    None
}

/// Duplicate-event guard. Kept well below the double-click interval so a
/// double-click still toggles twice.
const START_TOGGLE_DEBOUNCE_MS: i64 = 80;
/// Hold time for the Windows key so the shell registers a deliberate tap.
/// A zero-length tap is dropped by the shell and never opens Start.
const START_WIN_KEY_HOLD_MS: u64 = 40;

fn send_key_tap(vk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY, hold_ms: u64) {
    use windows::Win32::UI::Input::KeyboardAndMouse::{SendInput, INPUT, INPUT_0, KEYBDINPUT, KEYEVENTF_KEYUP};
    let down = [INPUT {
        r#type: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT { wVk: vk, wScan: 0, dwFlags: Default::default(), time: 0, dwExtraInfo: 0 },
        },
    }];
    let up = [INPUT {
        r#type: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT { wVk: vk, wScan: 0, dwFlags: KEYEVENTF_KEYUP, time: 0, dwExtraInfo: 0 },
        },
    }];
    unsafe {
        SendInput(&down, std::mem::size_of::<INPUT>() as i32);
        if hold_ms > 0 {
            std::thread::sleep(std::time::Duration::from_millis(hold_ms));
        }
        SendInput(&up, std::mem::size_of::<INPUT>() as i32);
    }
}

/// True while the native Start menu owns the foreground window.
/// Depending on the Windows build it is hosted by StartMenuExperienceHost
/// (older) or SearchHost (Windows 11 24H2+), so match both. The dock is
/// WS_EX_NOACTIVATE, so clicking it never steals focus from an open menu.
fn is_start_menu_open() -> bool {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    unsafe {
        let fg = GetForegroundWindow();
        if fg.0.is_null() {
            return false;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(fg, Some(&mut pid));
        if pid == 0 {
            return false;
        }
        if let Ok(process) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            let mut buf = [0u16; 260];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, windows::core::PWSTR(buf.as_mut_ptr()), &mut len);
            let _ = CloseHandle(process);
            if ok.is_ok() {
                let path = String::from_utf16_lossy(&buf[..len as usize]);
                let file = path.rsplit('\\').next().unwrap_or("").to_lowercase();
                return file == "startmenuexperiencehost.exe" || file == "searchhost.exe";
            }
        }
        false
    }
}

/// Toggle the native Start menu. Checks whether the menu currently owns the
/// foreground window instead of blindly tapping Win: rapid Win taps are ignored
/// by the shell while the menu animates, which made a second click replay the
/// open animation. When the menu is open it is dismissed with Escape, which is
/// deterministic. The tiny debounce only coalesces duplicate events; it must
/// stay well below the double-click interval so a double-click still closes.
fn toggle_start_menu() {
    let now = get_now_ms();
    if now - LAST_START_TOGGLE_MS.load(Ordering::Relaxed) < START_TOGGLE_DEBOUNCE_MS {
        return;
    }
    LAST_START_TOGGLE_MS.store(now, Ordering::Relaxed);

    tauri::async_runtime::spawn_blocking(move || {
        use windows::Win32::UI::Input::KeyboardAndMouse::{VK_ESCAPE, VK_LWIN};
        if is_start_menu_open() {
            send_key_tap(VK_ESCAPE, 0);
        } else {
            send_key_tap(VK_LWIN, START_WIN_KEY_HOLD_MS);
        }
    });
}

#[tauri::command]
pub async fn open_app(app: AppHandle, app_name: String) {
    if app_name == "start" {
        toggle_start_menu();
        return;
    }

    if app_name == "bloom-settings" {
        open_settings_window(app);
        return;
    }
    
    let path = app_name;
    tauri::async_runtime::spawn_blocking(move || unsafe {
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        let wide_open: Vec<u16> = "open".encode_utf16().chain(std::iter::once(0)).collect();

        // Shortcuts and shell app ids must be launched through the shell itself so
        // that arguments (Chrome/Edge PWAs) and package identities (Store apps) survive.
        let shell_target = if path.to_lowercase().ends_with(".lnk") {
            Some(path.clone())
        } else if is_aumid_path(&path) {
            let id = path.trim().trim_start_matches("shell:AppsFolder\\");
            Some(format!("shell:AppsFolder\\{}", id))
        } else {
            None
        };

        if let Some(target) = shell_target {
            let wide_target: Vec<u16> = target.encode_utf16().chain(std::iter::once(0)).collect();
            let res = ShellExecuteW(
                None,
                windows::core::PCWSTR(wide_open.as_ptr()),
                windows::core::PCWSTR(wide_target.as_ptr()),
                None,
                None,
                SW_SHOWNORMAL,
            );
            if res.0 as usize <= 32 {
                eprintln!("Failed to open {}: error code {}", target, res.0 as usize);
            }
            return;
        }

        let actual_path = path.clone();

        if let Some(uwp_cmd) = crate::commands::get_uwp_launch_cmd(&actual_path) {
            let wide_cmd: Vec<u16> = uwp_cmd.encode_utf16().chain(std::iter::once(0)).collect();
            
            let res = ShellExecuteW(
                None,
                windows::core::PCWSTR(wide_open.as_ptr()),
                windows::core::PCWSTR(wide_cmd.as_ptr()),
                None,
                None,
                SW_SHOWNORMAL,
            );
            
            if res.0 as usize <= 32 {
                eprintln!("Failed to open UWP app {}: error code {}", uwp_cmd, res.0 as usize);
            }
            return;
        }

        use std::path::Path;
        let mut final_path = actual_path.clone();
        
        if !Path::new(&final_path).exists() {
            let file_name = Path::new(&final_path).file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
            
            // Handle Discord/Slack style auto-updaters (app-x.x.x folder structure)
            if file_name == "discord.exe" || file_name == "slack.exe" || file_name == "githubdesktop.exe" || file_name == "zentwilight.exe" {
                if let Some(parent) = Path::new(&final_path).parent().and_then(|p| p.parent()) {
                    if parent.exists() {
                        if let Ok(entries) = std::fs::read_dir(parent) {
                            let mut app_dirs = Vec::new();
                            for entry in entries.flatten() {
                                let name = entry.file_name().to_string_lossy().to_string();
                                if (name.starts_with("app-") || name.starts_with("current")) && entry.path().is_dir() {
                                    app_dirs.push(entry.path());
                                }
                            }
                            app_dirs.sort();
                            if let Some(latest) = app_dirs.last() {
                                let exe = latest.join(Path::new(&final_path).file_name().unwrap());
                                if exe.exists() {
                                    final_path = exe.to_string_lossy().to_string();
                                }
                            }
                        }
                    }
                }
            }
        }

        let wide_path: Vec<u16> = final_path.encode_utf16().chain(std::iter::once(0)).collect();
        let wide_open: Vec<u16> = "open".encode_utf16().chain(std::iter::once(0)).collect();
        
        let res = ShellExecuteW(
            None,
            windows::core::PCWSTR(wide_open.as_ptr()),
            windows::core::PCWSTR(wide_path.as_ptr()),
            None,
            None,
            SW_SHOWNORMAL,
        );
        
        if res.0 as usize <= 32 {
            eprintln!("Failed to open app {}: error code {}", final_path, res.0 as usize);
        }
    });
}

#[tauri::command]
pub async fn get_active_windows() -> Vec<AppInfo> {
    tauri::async_runtime::spawn_blocking(move || {
        use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};
        // COM is required while enumerating: each window's AppUserModelID is read
        // through the shell property store.
        let com_initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).is_ok() };

        let mut apps: Vec<AppInfo> = Vec::new();
        unsafe {
            let _ = EnumWindows(Some(enum_windows_proc), LPARAM(&mut apps as *mut Vec<AppInfo> as isize));
        }

        let mut grouped: HashMap<String, AppInfo> = HashMap::new();
        
        for app in apps {
            let path = app.path.to_lowercase();
            let name = app.name.to_lowercase();
            
            // For host processes (Edge, Chrome, ApplicationFrameHost), use path + name 
            // so that different PWAs/UWP apps are separate dock items.
            let key = if path.contains("msedge.exe") || path.contains("chrome.exe") || path.contains("applicationframehost.exe") {
                format!("{}:{}", path, name)
            } else if let Some(ref exe) = app.executable {
                format!("{}:{}", path, exe.to_lowercase())
            } else {
                path.clone()
            };

            if let Some(existing) = grouped.get_mut(&key) {
                if let Some(ref mut hwnds) = existing.all_hwnds {
                    hwnds.push((app.hwnd.unwrap_or(0), app.name.clone()));
                } else {
                    existing.all_hwnds = Some(vec![
                        (existing.hwnd.unwrap_or(0), existing.name.clone()),
                        (app.hwnd.unwrap_or(0), app.name.clone())
                    ]);
                }
            } else {
                let mut new_app = app.clone();
                new_app.all_hwnds = Some(vec![(app.hwnd.unwrap_or(0), app.name.clone())]);
                grouped.insert(key, new_app);
            }
        }

        let focus_guard = if let Some(map) = crate::state::FOCUS_TIMESTAMPS.get() {
            map.lock().ok()
        } else {
            None
        };

        let mut result_apps: Vec<AppInfo> = grouped.into_values().collect();

        for app in &mut result_apps {
            if let Some(ref mut hwnds) = app.all_hwnds {
                hwnds.sort_by(|a, b| {
                    let ts_a = focus_guard.as_ref()
                        .and_then(|g| g.get(&a.0))
                        .copied()
                        .unwrap_or(0);
                    let ts_b = focus_guard.as_ref()
                        .and_then(|g| g.get(&b.0))
                        .copied()
                        .unwrap_or(0);
                    ts_b.cmp(&ts_a)
                });
            }
        }

        if com_initialized {
            unsafe { CoUninitialize(); }
        }

        result_apps
    }).await.unwrap_or_default()
}

#[tauri::command]
pub async fn focus_window(hwnd: isize) {
    tauri::async_runtime::spawn_blocking(move || unsafe {
        use windows::Win32::UI::WindowsAndMessaging::{SetForegroundWindow, ShowWindow, SW_RESTORE, SW_SHOW, SW_MINIMIZE, IsIconic, IsWindowVisible, GetForegroundWindow, GetWindowThreadProcessId};
        let hwnd = HWND(hwnd as *mut _);
        let my_pid = std::process::id();

        if !IsWindowVisible(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_SHOW);
            let _ = ShowWindow(hwnd, SW_RESTORE);
            let _ = SetForegroundWindow(hwnd);
        } else if IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
            let _ = SetForegroundWindow(hwnd);
        } else {
            // Minimize if: window is foreground, OR same process as foreground (not Bloom), OR recently focused
            let fg = GetForegroundWindow();
            let mut should_minimize = false;

            if !fg.is_invalid() && fg == hwnd {
                should_minimize = true;
            } else if !fg.is_invalid() {
                let mut fg_pid = 0u32;
                let mut target_pid = 0u32;
                GetWindowThreadProcessId(fg, Some(&mut fg_pid));
                GetWindowThreadProcessId(hwnd, Some(&mut target_pid));
                if fg_pid == target_pid && fg_pid != 0 && fg_pid != my_pid {
                    should_minimize = true;
                }
            }

            if !should_minimize {
                let now = crate::utils::get_now_ms();
                should_minimize = if let Some(map) = crate::state::FOCUS_TIMESTAMPS.get() {
                    if let Ok(guard) = map.lock() {
                        guard.get(&(hwnd.0 as *mut () as isize))
                            .map(|ts| now - ts < 2000)
                            .unwrap_or(false)
                    } else { false }
                } else { false };
            }

            if should_minimize {
                let _ = ShowWindow(hwnd, SW_MINIMIZE);
            } else {
                let _ = SetForegroundWindow(hwnd);
            }
        }
    }).await.unwrap_or_default();
}

fn get_cache_key(path: &str, name: Option<&str>) -> String {
    let path_lc = path.to_lowercase();
    let name_lc = name.map(|n| n.to_lowercase()).unwrap_or_default();
    if path_lc.contains("msedge.exe") || path_lc.contains("chrome.exe") || path_lc.contains("applicationframehost.exe") {
        format!("{}:{}", path, name_lc)
    } else {
        path.to_string()
    }
}

fn get_custom_icons_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?.join("custom_icons");
    let _ = std::fs::create_dir_all(&dir);
    Ok(dir)
}

fn sanitize_filename(key: &str) -> String {
    key.replace(|c: char| c == ':' || c == '\\' || c == '/' || c == '*' || c == '?' || c == '"' || c == '<' || c == '>' || c == '|', "_")
}

/// Reads a `--flag=value` style argument from a command line, honoring quotes.
fn extract_arg(args: &str, key: &str) -> Option<String> {
    let idx = args.find(key)?;
    let rest = &args[idx + key.len()..];
    let value = if let Some(stripped) = rest.strip_prefix('"') {
        stripped.split('"').next().unwrap_or("")
    } else {
        rest.split_whitespace().next().unwrap_or("")
    };
    let value = value.trim().trim_matches('"');
    if value.is_empty() { None } else { Some(value.to_string()) }
}

/// True for shell application ids (`PackageFamily!App`, `Company.Product`, ...)
/// that are not real file system paths.
pub fn is_aumid_path(path: &str) -> bool {
    let p = path.trim().trim_matches('"');
    if p.is_empty() || p.len() < 3 { return false; }
    if p.to_lowercase().starts_with("shell:appsfolder\\") { return true; }
    if p.contains('\\') || p.contains('/') || p.contains(':') { return false; }
    if p.to_lowercase().ends_with(".exe") { return false; }
    if std::path::Path::new(p).exists() { return false; }
    true
}

fn is_browser_host_process(path: &str) -> bool {
    let p = path.to_lowercase();
    p.contains("msedge.exe") || p.contains("chrome.exe") || p.contains("brave.exe") || p.contains("vivaldi.exe") || p.contains("firefox.exe")
}

/// Resolves the icon of a shell application id (Store/UWP/packaged PWA) through
/// `shell:AppsFolder`. `SHGetFileInfoW` cannot handle these; `IShellItemImageFactory` can.
fn icon_from_aumid(aumid: &str) -> Option<String> {
    unsafe {
        use windows::Win32::Foundation::SIZE;
        use windows::Win32::UI::Shell::{IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF, SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY};

        let id = aumid.trim().trim_start_matches("shell:AppsFolder\\");
        if id.is_empty() { return None; }

        let parsing_name = format!("shell:AppsFolder\\{}", id);
        let wide: Vec<u16> = parsing_name.encode_utf16().chain(std::iter::once(0)).collect();
        let factory: IShellItemImageFactory = SHCreateItemFromParsingName(windows::core::PCWSTR(wide.as_ptr()), None).ok()?;

        let size = SIZE { cx: 256, cy: 256 };
        let hbitmap = factory.GetImage(size, SIIGBF(SIIGBF_ICONONLY.0 | SIIGBF_BIGGERSIZEOK.0))
            .or_else(|_| factory.GetImage(size, SIIGBF_BIGGERSIZEOK))
            .ok()?;
        if hbitmap.0.is_null() { return None; }

        let result = crate::utils::hbitmap_to_base64(hbitmap);
        let _ = windows::Win32::Graphics::Gdi::DeleteObject(hbitmap.into());
        result
    }
}

/// Derives the package family name (`Name_PublisherId`) from a WindowsApps exe path.
/// Package folders look like `Name_Version_Architecture__PublisherId`.
fn package_family_from_windows_apps_path(path: &str) -> Option<String> {
    let lower = path.to_lowercase();
    let idx = lower.find("\\windowsapps\\")?;
    let rest = &path[idx + "\\windowsapps\\".len()..];
    let folder = rest.split(['\\', '/']).next()?;
    let (before_publisher, publisher) = folder.rsplit_once("__")?;
    let name = before_publisher.split('_').next()?;
    if name.is_empty() || publisher.is_empty() { return None; }
    Some(format!("{}_{}", name, publisher))
}

/// Finds the exact AppUserModelID of an installed app from its package family name
/// by enumerating `shell:AppsFolder` (the `!App` suffix is not guaranteed).
fn find_aumid_by_family(family: &str) -> Option<String> {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::{SHGetKnownFolderIDList, FOLDERID_AppsFolder, SHGetDesktopFolder, IShellFolder, IEnumIDList, SHGetNameFromIDList, ILCombine, ILFree, SIGDN_DESKTOPABSOLUTEPARSING, SHCONTF_FOLDERS, SHCONTF_NONFOLDERS};

    unsafe {
        let pidl_apps = SHGetKnownFolderIDList(&FOLDERID_AppsFolder, 0, None).ok()?;
        let result = (|| -> Option<String> {
            let desktop = SHGetDesktopFolder().ok()?;
            let apps_folder: IShellFolder = desktop.BindToObject(pidl_apps, None).ok()?;
            let mut enum_id: Option<IEnumIDList> = None;
            if apps_folder.EnumObjects(HWND(std::ptr::null_mut()), (SHCONTF_FOLDERS.0 | SHCONTF_NONFOLDERS.0) as u32, &mut enum_id).is_err() { return None; }
            let enum_id = enum_id?;

            let prefix = format!("{}!", family);
            let mut pidl_buf: [*mut windows::Win32::UI::Shell::Common::ITEMIDLIST; 1] = [std::ptr::null_mut()];
            let mut fetched = 0;
            while enum_id.Next(&mut pidl_buf, Some(&mut fetched)).is_ok() && fetched > 0 {
                let pidl_item = pidl_buf[0];
                pidl_buf[0] = std::ptr::null_mut();
                if pidl_item.is_null() { continue; }

                let absolute_pidl = ILCombine(Some(pidl_apps as *const _), Some(pidl_item as *const _));
                if absolute_pidl.is_null() {
                    CoTaskMemFree(Some(pidl_item as *const _));
                    continue;
                }

                let mut found = None;
                if let Ok(p_ptr) = SHGetNameFromIDList(absolute_pidl, SIGDN_DESKTOPABSOLUTEPARSING) {
                    let s = String::from_utf16_lossy(windows::core::PCWSTR(p_ptr.0).as_wide());
                    CoTaskMemFree(Some(p_ptr.0 as *const _));
                    if s.starts_with(&prefix) { found = Some(s); }
                }
                ILFree(Some(absolute_pidl as *const _));
                CoTaskMemFree(Some(pidl_item as *const _));
                if found.is_some() { return found; }
            }
            None
        })();
        CoTaskMemFree(Some(pidl_apps as *const _));
        result
    }
}

/// Icon for executables that live inside an MSIX package (`\WindowsApps\...`).
/// Those exes carry no app icon; the package manifest logo is the real icon.
fn packaged_exe_icon(path: &str) -> Option<String> {
    let family = package_family_from_windows_apps_path(path)?;
    let aumid = find_aumid_by_family(&family)?;
    icon_from_aumid(&aumid)
}

/// Command line of a process, via WMI. Used to identify PWAs hosted inside browser processes.
fn process_command_line(pid: u32) -> Option<String> {
    use serde::Deserialize;
    #[derive(Deserialize)]
    #[serde(rename_all = "PascalCase")]
    struct Win32Process {
        command_line: Option<String>,
    }

    let com = wmi::COMLibrary::new().ok()?;
    let connection = wmi::WMIConnection::new(com).ok()?;
    let results: Vec<Win32Process> = connection
        .raw_query(format!("SELECT CommandLine FROM Win32_Process WHERE ProcessId = {}", pid))
        .ok()?;
    results.into_iter().next().and_then(|p| p.command_line)
}

fn pwa_icon_from_command_line(process_path: &str, command_line: &str) -> Option<String> {
    // Store PWAs launched by Edge carry their package identity inline.
    if let Some(aumid) = extract_arg(command_line, "--ip-aumid=") {
        if let Some(icon) = icon_from_aumid(&aumid) { return Some(icon); }
    }
    // Chrome/Edge/Brave "installed app" windows carry the web app id.
    if command_line.contains("--app-id=") {
        if let Some(icon_path) = find_browser_pwa_icon(process_path, command_line) {
            if let Some(icon) = crate::utils::image_file_to_base64(&icon_path) { return Some(icon); }
        }
    }
    None
}

/// Browser web app ids are 32 characters from the range a-p.
fn browser_web_app_id_from_aumid(id: &str) -> Option<String> {
    let is_web_app_id = |s: &str| s.len() == 32 && s.bytes().all(|b| (b'a'..=b'p').contains(&b));
    if let Some(segment) = id.rsplit('.').next() {
        if is_web_app_id(segment) { return Some(segment.to_string()); }
    }
    if let Some(idx) = id.find("_crx_") {
        if let Some(segment) = id[idx + 5..].split('.').next() {
            if is_web_app_id(segment) { return Some(segment.to_string()); }
        }
    }
    None
}

unsafe fn pwa_icon_for_window(hwnd: HWND, process_path: &str) -> Option<String> {
    // The window's own AppUserModelID is the most reliable identity: it is always
    // present, unlike the process command line (Edge reuses its browser process).
    if let Some(id) = crate::utils::get_window_app_user_model_id(hwnd) {
        if id.contains('!') {
            if let Some(icon) = icon_from_aumid(&id) { return Some(icon); }
        } else if let Some(app_id) = browser_web_app_id_from_aumid(&id) {
            if let Some(icon_path) = find_browser_pwa_icon(process_path, &format!("--app-id={}", app_id)) {
                if let Some(icon) = crate::utils::image_file_to_base64(&icon_path) { return Some(icon); }
            }
        }
    }
    // Fall back to the process command line for hosts that don't stamp the window.
    let mut pid = 0u32;
    windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if pid == 0 { return None; }
    let command_line = process_command_line(pid)?;
    pwa_icon_from_command_line(process_path, &command_line)
}

/// Finds the icon Chromium stores for an installed web app in the browser profile.
///
/// Current layout: `<profile>/Web Applications/Manifest Resources/<app-id>/Icons/*.png`.
/// Older Chrome builds used `Web Applications/<app-id>` / `_crx_<app-id>` with an `icon_256.png`.
fn find_browser_pwa_icon(executable_path: &str, args: &str) -> Option<String> {
    let app_id = extract_arg(args, "--app-id=")?;
    let local = std::env::var("LOCALAPPDATA").ok()?;

    let chrome_base = format!("{}\\Google\\Chrome\\User Data", local);
    let edge_base = format!("{}\\Microsoft\\Edge\\User Data", local);
    let brave_base = format!("{}\\BraveSoftware\\Brave-Browser\\User Data", local);
    let vivaldi_base = format!("{}\\Vivaldi\\User Data", local);
    let browser_path = executable_path.to_lowercase();
    let bases = if browser_path.contains("msedge") {
        vec![edge_base, chrome_base]
    } else if browser_path.contains("brave") {
        vec![brave_base, chrome_base]
    } else if browser_path.contains("vivaldi") {
        vec![vivaldi_base, chrome_base]
    } else {
        vec![chrome_base, edge_base]
    };

    let profile = extract_arg(args, "--profile-directory=").unwrap_or_else(|| "Default".to_string());

    for base in bases {
        if !std::path::Path::new(&base).is_dir() { continue; }

        let mut profiles = vec![profile.clone()];
        if let Ok(entries) = std::fs::read_dir(&base) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if !profiles.iter().any(|p| p.eq_ignore_ascii_case(&name)) { profiles.push(name); }
                }
            }
        }

        for prof in profiles {
            let web_apps = std::path::Path::new(&base).join(&prof).join("Web Applications");
            if !web_apps.is_dir() { continue; }

            let candidates = [
                web_apps.join("Manifest Resources").join(&app_id),
                web_apps.join(&app_id),
                web_apps.join(format!("_crx_{}", app_id)),
            ];
            for dir in candidates {
                if let Some(icon) = find_largest_image_in_dir(&dir) { return Some(icon); }
            }
        }
    }
    None
}

fn find_largest_image_in_dir(dir: &std::path::Path) -> Option<String> {
    if !dir.is_dir() { return None; }
    let mut best: Option<(u64, String)> = None;
    collect_images(dir, 0, &mut best);
    best.map(|(_, path)| path)
}

fn collect_images(dir: &std::path::Path, depth: u32, best: &mut Option<(u64, String)>) {
    if depth > 3 { return; }
    let Ok(entries) = std::fs::read_dir(dir) else { return; };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_images(&path, depth + 1, best);
            continue;
        }
        let Some(ext) = path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()) else { continue; };
        if !matches!(ext.as_str(), "png" | "ico" | "jpg" | "jpeg" | "bmp" | "webp") { continue; }
        let score = image_size_score(&path);
        let is_better = match best.as_ref() {
            Some((best_score, _)) => score > *best_score,
            None => true,
        };
        if is_better {
            *best = Some((score, path.to_string_lossy().to_string()));
        }
    }
}

/// Scores an icon file by the pixel dimensions encoded in its name (e.g. `256.png`, `192x192.png`).
fn image_size_score(path: &std::path::Path) -> u64 {
    let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
    let mut score: u64 = 0;
    for token in name.split(|c: char| !c.is_ascii_digit() && c != 'x') {
        if token.is_empty() { continue; }
        if let Some(idx) = token.find('x') {
            let (w, h) = token.split_at(idx);
            let h = &h[1..];
            if let (Ok(w), Ok(h)) = (w.parse::<u64>(), h.parse::<u64>()) {
                score = score.max(w * h);
            }
        } else if let Ok(n) = token.parse::<u64>() {
            score = score.max(n * n);
        }
    }
    score
}

static LAST_ICON_SAVE_REQUEST: std::sync::atomic::AtomicI64 = std::sync::atomic::AtomicI64::new(0);

pub fn schedule_icon_cache_save(app: AppHandle) {
    let now = crate::utils::get_now_ms();
    LAST_ICON_SAVE_REQUEST.store(now, Ordering::Relaxed);

    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
        let last = LAST_ICON_SAVE_REQUEST.load(Ordering::Relaxed);
        if now == last || crate::utils::get_now_ms() - last >= 950 {
            if let Ok(dir) = app.path().app_config_dir() {
                let cache_path = dir.join("icons_cache.json");
                if let Some(c) = crate::state::ICON_CACHE.get() {
                    let snapshot = if let Ok(lock) = c.lock() {
                        serde_json::to_string(&*lock).unwrap_or_default()
                    } else {
                        String::new()
                    };
                    if !snapshot.is_empty() {
                        let _ = tauri::async_runtime::spawn_blocking(move || {
                            let _ = std::fs::write(&cache_path, snapshot);
                        }).await;
                    }
                }
            }
        }
    });
}

#[tauri::command]
pub async fn get_app_icon(app: AppHandle, path: String, name: Option<String>, hwnd: Option<isize>) -> Result<Option<String>, String> {
    let cache_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let cache_path = cache_dir.join("icons_cache.json");
    let cache_key = get_cache_key(&path, name.as_deref());

    // Strategy 0: Check for custom icon first
    let custom_icons_dir = cache_dir.join("custom_icons");
    let custom_file = custom_icons_dir.join(format!("{}.png", sanitize_filename(&cache_key)));
    if custom_file.exists() {
        if let Ok(data) = std::fs::read(&custom_file) {
            use base64::Engine;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
            return Ok(Some(format!("data:image/png;base64,{}", b64)));
        }
    }

    let cache = ICON_CACHE.get_or_init(|| {
        let mut map = std::collections::HashMap::new();
        if let Ok(content) = std::fs::read_to_string(&cache_path) {
            if let Ok(existing) = serde_json::from_str::<std::collections::HashMap<String, String>>(&content) {
                map = existing;
            }
        }
        std::sync::Mutex::new(map)
    });

    // Strategy 1: Check persistent in-memory cache
    if let Ok(c) = cache.lock() {
        if let Some(icon) = c.get(&cache_key) {
            return Ok(Some(icon.clone()));
        }
    }

    // Bare executable names (default pins such as "notepad.exe") are resolved first,
    // so a Store-package resolution can use the package logo instead of a System32 stub.
    let mut path = path;
    if !path.contains('\\') && !path.contains('/') {
        if let Some(resolved) = resolve_executable_path(&path) {
            path = resolved;
        }
    }

    // Strategy 2: Shell-resolved app icons (Store/UWP/PWA packages) and executables
    // inside an MSIX package. Neither has a usable icon on disk; the shell resolves
    // the package logo through `shell:AppsFolder`.
    let aumid_opt = if is_aumid_path(&path) {
        Some(path.trim().trim_start_matches("shell:AppsFolder\\").to_string())
    } else {
        None
    };
    let packaged_exe = path.to_lowercase().contains("\\windowsapps\\");
    if aumid_opt.is_some() || packaged_exe {
        let path_owned = path.clone();
        let result = tauri::async_runtime::spawn_blocking(move || {
            let _ = unsafe { windows::Win32::System::Com::CoInitializeEx(None, windows::Win32::System::Com::COINIT_MULTITHREADED) };
            let icon = match aumid_opt {
                Some(aumid) => icon_from_aumid(&aumid),
                None => packaged_exe_icon(&path_owned),
            };
            unsafe { windows::Win32::System::Com::CoUninitialize(); }
            icon
        }).await.unwrap_or(None);

        if let Some(base64) = result {
            if let Ok(mut c) = cache.lock() { c.insert(cache_key.clone(), base64.clone()); }
            schedule_icon_cache_save(app);
            return Ok(Some(base64));
        }
    }

    // Strategy 3: Extract icon from live window HWND
    if let Some(h) = hwnd {
        let path_owned = path.clone();
        let result = tauri::async_runtime::spawn_blocking(move || unsafe {
            use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED, CoUninitialize};
            use windows::Win32::UI::WindowsAndMessaging::{GetClassLongPtrW, GCLP_HICON, WM_GETICON, ICON_BIG, SendMessageTimeoutW, SMTO_ABORTIFHUNG};
            
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

            // Browser-hosted PWAs (Store apps, installed web apps) only expose the
            // browser icon on the window itself; resolve the app identity from the
            // window's AppUserModelID (or the process command line as fallback).
            if is_browser_host_process(&path_owned) {
                if let Some(icon) = pwa_icon_for_window(HWND(h as *mut _), &path_owned) {
                    CoUninitialize();
                    return Some(icon);
                }
            }

            let h_hwnd = HWND(h as *mut _);
            
            let mut h_icon = windows::Win32::UI::WindowsAndMessaging::HICON(GetClassLongPtrW(h_hwnd, GCLP_HICON) as *mut _);
            if h_icon.is_invalid() {
                h_icon = windows::Win32::UI::WindowsAndMessaging::HICON(GetClassLongPtrW(h_hwnd, windows::Win32::UI::WindowsAndMessaging::GCL_HICON) as *mut _);
            }

            if h_icon.is_invalid() {
                let mut res = 0usize;
                let _ = SendMessageTimeoutW(h_hwnd, WM_GETICON, windows::Win32::Foundation::WPARAM(ICON_BIG as usize), windows::Win32::Foundation::LPARAM(0), SMTO_ABORTIFHUNG, 250, Some(&mut res));
                if res != 0 { h_icon = windows::Win32::UI::WindowsAndMessaging::HICON(res as *mut _); }
            }
            
            let res = if !h_icon.is_invalid() { icon_to_base64(h_icon) } else { None };
            
            CoUninitialize();
            res
        }).await.unwrap_or(None);

        if let Some(base64) = result {
            if let Ok(mut c) = cache.lock() {
                c.insert(cache_key.clone(), base64.clone());
            }
            schedule_icon_cache_save(app);
            return Ok(Some(base64));
        }
    }

    // Strategy 4: Extract icon from file path
    let path_clone = path.clone();
    let ck_clone = cache_key.clone();
    let file_icon = tauri::async_runtime::spawn_blocking(move || unsafe {
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED, CoUninitialize};
        use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
        use windows::Win32::UI::WindowsAndMessaging::DestroyIcon;
        
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let result = {
            let ((actual_path, args), is_lnk) = if path_clone.to_lowercase().ends_with(".lnk") {
                (resolve_shortcut(&path_clone).unwrap_or((path_clone.clone(), String::new())), true)
            } else {
                ((path_clone.clone(), String::new()), false)
            };

            // A shortcut can carry its own icon file (Firefox web apps, user edits).
            let mut icon_data = if is_lnk {
                get_shortcut_icon_location(&path_clone).and_then(|p| image_file_to_base64(&p))
            } else {
                None
            };

            // Chrome/Edge/Brave installed web apps keep the site icon in the browser profile.
            if icon_data.is_none() {
                if let Some(pwa_icon_path) = find_browser_pwa_icon(&actual_path, &args) {
                    icon_data = image_file_to_base64(&pwa_icon_path);
                }
            }

            // UWP shortcuts launch `explorer.exe shell:AppsFolder\<AUMID>`.
            if icon_data.is_none() {
                if let Some(aumid) = extract_arg(&args, "shell:AppsFolder\\") {
                    icon_data = icon_from_aumid(&aumid);
                }
            }

            if icon_data.is_none() {
                let mut shfi: SHFILEINFOW = std::mem::zeroed();
                let path_u16: Vec<u16> = actual_path.encode_utf16().chain(std::iter::once(0)).collect();
                let res = SHGetFileInfoW(windows::core::PCWSTR(path_u16.as_ptr()), Default::default(), Some(&mut shfi), std::mem::size_of::<SHFILEINFOW>() as u32, SHGFI_ICON | SHGFI_LARGEICON);

                if res != 0 && !shfi.hIcon.is_invalid() {
                    icon_data = icon_to_base64(shfi.hIcon);
                    let _ = DestroyIcon(shfi.hIcon);
                }
            }

            if let Some(ref base64) = icon_data {
                if let Ok(mut lock) = ICON_CACHE.get().unwrap().lock() { lock.insert(ck_clone, base64.clone()); }
            }
            icon_data
        };
        CoUninitialize();
        result
    }).await.map_err(|e| e.to_string())?;

    if file_icon.is_some() {
        schedule_icon_cache_save(app);
    }
    Ok(file_icon)
}

#[tauri::command]
pub fn save_pinned_apps(app: AppHandle, apps: Vec<AppInfo>) -> Result<(), String> {
    crate::dock_content::save_classic(app,apps)
}

#[tauri::command]
pub async fn load_pinned_apps(app: AppHandle) -> Vec<AppInfo> {
    let path = app.path().app_config_dir().unwrap_or_default().join("pinned_apps.json");
    if let Ok(content) = std::fs::read_to_string(path) {
        if let Ok(apps) = serde_json::from_str(&content) { return apps; }
    }
    vec![
        AppInfo { name: "File Explorer".into(), path: "C:\\Windows\\explorer.exe".into(), icon: None, is_running: false, hwnd: None, executable: Some("explorer.exe".into()), all_hwnds: None },
        AppInfo { name: "Microsoft Edge".into(), path: "msedge".into(), icon: None, is_running: false, hwnd: None, executable: Some("msedge.exe".into()), all_hwnds: None },
        AppInfo { name: "Notepad".into(), path: "notepad.exe".into(), icon: None, is_running: false, hwnd: None, executable: Some("notepad.exe".into()), all_hwnds: None },
        AppInfo { name: "Settings".into(), path: "bloom-settings".into(), icon: None, is_running: false, hwnd: None, executable: None, all_hwnds: None },
    ]
}

#[tauri::command]
pub async fn clear_icon_cache(app: AppHandle) -> Result<(), String> {
    let cache_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let cache_path = cache_dir.join("icons_cache.json");
    let _ = std::fs::remove_file(&cache_path);
    if let Some(c) = ICON_CACHE.get() {
        if let Ok(mut lock) = c.lock() {
            lock.clear();
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn set_custom_icon(app: AppHandle, cache_key: String, icon_data: String) -> Result<String, String> {
    use base64::Engine;
    use image::GenericImageView;

    // Validate and decode the base64 data URI
    let b64_str = if icon_data.starts_with("data:") {
        icon_data.split(',').nth(1).ok_or("Invalid data URI")?
    } else {
        &icon_data
    };

    let raw_bytes = base64::engine::general_purpose::STANDARD
        .decode(b64_str)
        .map_err(|e| format!("Invalid base64: {}", e))?;

    // Decode image to validate and get dimensions
    let img = image::load_from_memory(&raw_bytes)
        .map_err(|e| format!("Invalid image: {}", e))?;

    let (w, h) = img.dimensions();
    if w < 16 || h < 16 {
        return Err("Icon must be at least 16x16 pixels".into());
    }

    // Resize to fit within 256x256 preserving aspect ratio, then center on transparent canvas
    let target = 256u32;
    let final_img = if w > target || h > target {
        let scaled = img.resize(target, target, image::imageops::FilterType::Lanczos3);
        let (sw, sh) = scaled.dimensions();
        let mut canvas = image::RgbaImage::new(target, target);
        let ox = (target - sw) / 2;
        let oy = (target - sh) / 2;
        image::imageops::overlay(&mut canvas, &scaled, ox as i64, oy as i64);
        image::DynamicImage::ImageRgba8(canvas)
    } else {
        img
    };

    // Encode to PNG bytes
    let mut png_bytes: Vec<u8> = Vec::new();
    final_img.write_to(&mut std::io::Cursor::new(&mut png_bytes), image::ImageFormat::Png)
        .map_err(|e| format!("Failed to encode PNG: {}", e))?;

    // Save to custom_icons directory
    let icons_dir = get_custom_icons_dir(&app)?;
    let filename = format!("{}.png", sanitize_filename(&cache_key));
    let file_path = icons_dir.join(&filename);
    std::fs::write(&file_path, &png_bytes).map_err(|e| e.to_string())?;

    // Update manifest mapping sanitized filename -> original cache key
    let manifest_path = icons_dir.join("custom_icons.json");
    let mut manifest: std::collections::HashMap<String, String> = if let Ok(content) = std::fs::read_to_string(&manifest_path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        std::collections::HashMap::new()
    };
    manifest.insert(sanitize_filename(&cache_key), cache_key);
    let _ = std::fs::write(&manifest_path, serde_json::to_string(&manifest).unwrap_or_default());

    // Return the data URI for immediate use
    let b64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);
    Ok(format!("data:image/png;base64,{}", b64))
}

#[tauri::command]
pub async fn remove_custom_icon(app: AppHandle, path: String, name: Option<String>) -> Result<(), String> {
    let cache_key = get_cache_key(&path, name.as_deref());
    let icons_dir = get_custom_icons_dir(&app)?;
    let sanitized = sanitize_filename(&cache_key);
    let filename = format!("{}.png", sanitized);
    let file_path = icons_dir.join(&filename);
    if file_path.exists() {
        std::fs::remove_file(&file_path).map_err(|e| e.to_string())?;
    }
    // Remove from manifest
    let manifest_path = icons_dir.join("custom_icons.json");
    if let Ok(content) = std::fs::read_to_string(&manifest_path) {
        if let Ok(mut manifest) = serde_json::from_str::<std::collections::HashMap<String, String>>(&content) {
            manifest.remove(&sanitized);
            let _ = std::fs::write(&manifest_path, serde_json::to_string(&manifest).unwrap_or_default());
        }
    }
    // Also remove from persistent cache so the original icon is re-fetched
    if let Some(c) = ICON_CACHE.get() {
        if let Ok(mut lock) = c.lock() {
            lock.remove(&cache_key);
        }
    }
    schedule_icon_cache_save(app);
    Ok(())
}

#[tauri::command]
pub async fn get_custom_icons(app: AppHandle) -> Result<HashMap<String, String>, String> {
    let icons_dir = get_custom_icons_dir(&app)?;
    let manifest_path = icons_dir.join("custom_icons.json");
    let manifest: std::collections::HashMap<String, String> = if let Ok(content) = std::fs::read_to_string(&manifest_path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        std::collections::HashMap::new()
    };
    let mut result = HashMap::new();
    if let Ok(entries) = std::fs::read_dir(&icons_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("png") {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    // Use original cache key from manifest, fallback to sanitized stem
                    let key = manifest.get(stem).cloned().unwrap_or_else(|| stem.to_string());
                    if let Ok(data) = std::fs::read(&path) {
                        use base64::Engine;
                        let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
                        result.insert(key, format!("data:image/png;base64,{}", b64));
                    }
                }
            }
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn get_installed_apps() -> Vec<AppInfo> {
    let cache = INSTALLED_APPS_CACHE.get_or_init(|| std::sync::Mutex::new(Vec::new()));
    let is_empty = if let Ok(lock) = cache.lock() { lock.is_empty() } else { true };
    if is_empty && !IS_SCANNING.load(Ordering::Relaxed) { crate::services::trigger_app_scan(); }
    let start = std::time::Instant::now();
    while IS_SCANNING.load(Ordering::Relaxed) && start.elapsed() < std::time::Duration::from_secs(5) { tokio::time::sleep(std::time::Duration::from_millis(100)).await; }
    if let Ok(cache_lock) = cache.lock() { cache_lock.clone() } else { Vec::new() }
}

#[tauri::command]
pub fn hide_native_osd() {
    unsafe {
        use windows::Win32::UI::WindowsAndMessaging::{FindWindowA, ShowWindow, SW_HIDE};
        let class1 = windows::core::PCSTR(c"NativeHWNDHost".as_ptr() as *const u8);
        if let Ok(hwnd) = FindWindowA(class1, windows::core::PCSTR::null()) { let _ = ShowWindow(hwnd, SW_HIDE); }
    }
}

#[tauri::command]
pub fn open_settings_window(app: AppHandle) {
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(error)=show_settings(&app) { crate::diagnostics::record(&error); }
    });
}

fn show_settings(app:&AppHandle) -> Result<(),String> {
    let win=app.get_webview_window("settings").ok_or("Окно настроек недоступно")?;
    win.show().map_err(|_|"Не удалось открыть настройки Dinox")?;
    win.unminimize().map_err(|_|"Не удалось открыть настройки Dinox")?;
    win.set_focus().map_err(|_|"Не удалось открыть настройки Dinox")?;
    Ok(())
}

#[tauri::command]
pub async fn open_dock_settings(app:AppHandle) -> Result<(),String> {
    tauri::async_runtime::spawn_blocking(move || {
        show_settings(&app)?;
        app.emit_to("settings","open-dock-settings",()).map_err(|_|"Не удалось открыть настройки Dinox".into())
    }).await.map_err(|_|"Не удалось открыть настройки Dinox".to_string())?
}

#[tauri::command]
pub fn hide_overlay(app: AppHandle) {
    if let Some(win) = app.get_webview_window("overlay") { let _ = win.hide(); }
}

#[tauri::command]
pub fn set_splash_fullscreen(app: AppHandle, fullscreen: bool) {
    crate::state::OVERLAY_IN_SPLASH.store(fullscreen, Ordering::Relaxed);
    if let Some(win) = app.get_webview_window("overlay") {
        if fullscreen {
            let _ = win.hide();
            if let Ok(Some(monitor)) = win.primary_monitor() {
                let size = monitor.size();
                let pos = monitor.position();
                let _ = win.set_position(tauri::PhysicalPosition::new(pos.x, pos.y));
                let _ = win.set_size(tauri::PhysicalSize::new(size.width, size.height));
            }
            let _ = win.show();
        } else {
            let _ = win.hide();
            crate::services::sync_overlays(&app);
        }
    }
}

#[tauri::command]
pub fn sync_overlay_position(app: AppHandle) {
    crate::services::sync_overlays(&app);
}

#[tauri::command]
pub fn open_wifi_settings() {
    unsafe {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        use windows::Win32::UI::Shell::ShellExecuteA;
        let _ = ShellExecuteA(Some(HWND(std::ptr::null_mut())), windows::core::PCSTR(c"open".as_ptr() as *const u8), windows::core::PCSTR(c"ms-availablenetworks:".as_ptr() as *const u8), windows::core::PCSTR::null(), windows::core::PCSTR::null(), SW_SHOWNORMAL);
    }
}

#[tauri::command]
pub fn open_sound_settings() {
    unsafe {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        use windows::Win32::UI::Shell::ShellExecuteA;
        let _ = ShellExecuteA(Some(HWND(std::ptr::null_mut())), windows::core::PCSTR(c"open".as_ptr() as *const u8), windows::core::PCSTR(c"ms-settings:sound".as_ptr() as *const u8), windows::core::PCSTR::null(), windows::core::PCSTR::null(), SW_SHOWNORMAL);
    }
}

#[tauri::command]
pub fn open_notification_center() {
    unsafe {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        use windows::Win32::UI::Shell::ShellExecuteA;
        let _ = ShellExecuteA(Some(HWND(std::ptr::null_mut())), windows::core::PCSTR(c"open".as_ptr() as *const u8), windows::core::PCSTR(c"ms-actioncenter:".as_ptr() as *const u8), windows::core::PCSTR::null(), windows::core::PCSTR::null(), SW_SHOWNORMAL);
    }
}

#[tauri::command]
pub async fn open_system_tray(app: AppHandle) -> Result<(),String> {
    static BUSY:std::sync::atomic::AtomicBool=std::sync::atomic::AtomicBool::new(false);
    if BUSY.swap(true,Ordering::SeqCst){return Err("Windows ещё открывает скрытые значки".into())}
    struct Guard;impl Drop for Guard{fn drop(&mut self){BUSY.store(false,Ordering::SeqCst);}}
    let guard=Guard;
    save_setting(app.clone(),"bloom-shell-mode".into(),serde_json::json!("compatible"))?;
    let worker=tauri::async_runtime::spawn_blocking(move || {
        let _guard=guard;
        crate::shell_controller::restore();
        crate::shell_controller::refresh(&app);
        crate::tray_access::open_overflow()
    });
    tokio::time::timeout(std::time::Duration::from_secs(8),worker).await
        .map_err(|_|"Windows ещё открывает скрытые значки".to_string())?
        .map_err(|_|"Не удалось открыть панель Windows".to_string())?
}

#[tauri::command]
pub fn media_play_pause() { if let Some(sender) = COMMAND_SENDER.get() { let _ = sender.send(crate::types::SystemCommand::MediaPlayPause); } }

#[tauri::command]
pub fn media_next() { if let Some(sender) = COMMAND_SENDER.get() { let _ = sender.send(crate::types::SystemCommand::MediaNext); } }

#[tauri::command]
pub fn media_previous() { if let Some(sender) = COMMAND_SENDER.get() { let _ = sender.send(crate::types::SystemCommand::MediaPrevious); } }

#[tauri::command]
pub fn media_seek(position_ms: f64) { if let Some(sender) = COMMAND_SENDER.get() { let _ = sender.send(crate::types::SystemCommand::MediaSeek(position_ms as i64)); } }

#[tauri::command]
pub fn open_media_source_app() {
    unsafe {
        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
        use windows::Win32::UI::WindowsAndMessaging::{SetForegroundWindow, ShowWindow, SW_RESTORE, IsIconic, IsWindowVisible, FindWindowW, EnumWindows, GetWindowThreadProcessId};
        use windows::Win32::Foundation::{HWND, LPARAM};
        use windows::Win32::System::Threading::OpenProcess;

        let mgr = match GlobalSystemMediaTransportControlsSessionManager::RequestAsync().and_then(|op| op.get()) {
            Ok(m) => m,
            Err(_) => return,
        };
        let session = match mgr.GetCurrentSession() {
            Ok(s) => s,
            Err(_) => return,
        };
        let app_id = match session.SourceAppUserModelId() {
            Ok(id) => id.to_string(),
            Err(_) => return,
        };
        if app_id.is_empty() { return; }

        // First try: FindWindow with the AppUserModelId directly (works for UWP)
        let h_app_id = windows::core::HSTRING::from(&app_id);
        if let Ok(hwnd) = FindWindowW(None, windows::core::PCWSTR(h_app_id.as_ptr())) {
            if !hwnd.is_invalid() {
                if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
                    let _ = ShowWindow(hwnd, SW_RESTORE);
                }
                let _ = SetForegroundWindow(hwnd);
                return;
            }
        }

        // Second try: find window by process name extracted from app_id
        let process_name = app_id.split('.').next().unwrap_or(&app_id).to_lowercase();

        struct EnumData { process_name: String, found_hwnd: Option<HWND> }

        unsafe extern "system" fn enum_callback(hwnd: HWND, lparam: LPARAM) -> windows::core::BOOL {
            let data = &mut *(lparam.0 as *mut EnumData);
            if !IsWindowVisible(hwnd).as_bool() {
                return windows::core::BOOL(1);
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == 0 { return windows::core::BOOL(1); }

            if let Ok(proc) = OpenProcess(
                windows::Win32::System::Threading::PROCESS_QUERY_LIMITED_INFORMATION,
                false,
                pid,
            ) {
                let mut buf = [0u16; 260];
                let mut size = buf.len() as u32;
                let ok = windows::Win32::System::Threading::QueryFullProcessImageNameW(
                    proc,
                    windows::Win32::System::Threading::PROCESS_NAME_FORMAT(0),
                    windows::core::PWSTR(buf.as_mut_ptr()),
                    &mut size,
                );
                let _ = windows::Win32::Foundation::CloseHandle(proc);
                if ok.is_ok() {
                    let path = String::from_utf16_lossy(&buf[..size as usize]);
                    let file_name = path.rsplit('\\').next().unwrap_or("").to_lowercase().replace(".exe", "");
                    if file_name == data.process_name {
                        data.found_hwnd = Some(hwnd);
                        return windows::core::BOOL(0);
                    }
                }
            }
            windows::core::BOOL(1)
        }

        let mut data = EnumData { process_name, found_hwnd: None };
        let callback: unsafe extern "system" fn(HWND, LPARAM) -> windows::core::BOOL = enum_callback;
        let _ = EnumWindows(Some(callback), LPARAM(&mut data as *mut EnumData as isize));

        if let Some(hwnd) = data.found_hwnd {
            if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
                let _ = ShowWindow(hwnd, SW_RESTORE);
            }
            let _ = SetForegroundWindow(hwnd);
        }
    }
}

#[tauri::command]
pub fn set_volume(volume: f32) { if let Some(sender) = COMMAND_SENDER.get() { let _ = sender.send(crate::types::SystemCommand::SetVolume(volume)); } }

/// Restore the native taskbar, unregister Bloom's appbars, and exit gracefully.
/// Shared by the tray menu, the in-app Quit button, and the window CloseRequested
/// handlers so that any shutdown path (including Task Manager's WM_CLOSE) behaves
/// identically.
pub fn restore_taskbar_and_exit(handle: &AppHandle) {
    crate::shell_controller::shutdown();
    if let Some(w) = handle.get_webview_window("main") {
        if MAIN_APPBAR_REGISTERED.load(Ordering::Relaxed) { unregister_appbar_native(w.hwnd().unwrap()); }
    }
    if let Some(w) = handle.get_webview_window("dock") {
        if DOCK_APPBAR_REGISTERED.load(Ordering::Relaxed) { unregister_appbar_native(w.hwnd().unwrap()); }
    }
    set_taskbar_visibility(true, true);
    NATIVE_TASKBAR_HIDDEN.store(false, Ordering::Relaxed);
    // Destroy all webview windows before exiting so Chromium's UnregisterClass for
    // Chrome_WidgetWin_0 finds no open windows (avoids the harmless Error=1412 log).
    for (_, w) in handle.webview_windows() {
        let _ = w.destroy();
    }
    handle.exit(0);
}

#[tauri::command]
pub async fn quit_bloom(handle: AppHandle) {
    restore_taskbar_and_exit(&handle);
}

#[tauri::command]
pub async fn restart_bloom(handle: AppHandle) {
    crate::shell_controller::shutdown();
    if let Some(w) = handle.get_webview_window("main") { unregister_appbar_native(w.hwnd().unwrap()); }
    if let Some(w) = handle.get_webview_window("dock") { unregister_appbar_native(w.hwnd().unwrap()); }
    if let Some(w) = handle.get_webview_window("settings") { let _ = w.destroy(); }
    set_taskbar_visibility(true, true);
    NATIVE_TASKBAR_HIDDEN.store(false, Ordering::Relaxed);
    close_single_instance_handles();
    handle.restart();
}

#[tauri::command]
pub async fn close_window(hwnd: isize) {
    tauri::async_runtime::spawn_blocking(move || unsafe {
        use windows::Win32::UI::WindowsAndMessaging::{PostMessageW, WM_CLOSE};
        let hwnd = HWND(hwnd as *mut _);
        let _ = PostMessageW(Some(hwnd), WM_CLOSE, windows::Win32::Foundation::WPARAM(0), windows::Win32::Foundation::LPARAM(0));
    }).await.unwrap_or_default();
}

fn re_register_appbars(app: &AppHandle, settings: &HashMap<String, serde_json::Value>) {
    if let Some(main_win) = app.get_webview_window("main") {
        let notch_fixed = settings.get("bloom-notch-mode").map(|v| v.as_str() == Some("fixed")).unwrap_or(true);
        if notch_fixed {
            crate::services::register_appbar(main_win);
        }
    }
    if let Some(dock_win) = app.get_webview_window("dock") {
        let is_fixed = settings.get("bloom-dock-mode").map(|v| v.as_str() == Some("fixed")).unwrap_or(false);
        if is_fixed {
            crate::services::register_dock_appbar(dock_win);
        }
    }
}

#[tauri::command]
pub fn save_setting(app: AppHandle, key: String, value: serde_json::Value) -> Result<(), String> {
    let guard=SETTINGS_WRITE_LOCK.lock().map_err(|_|"Settings lock unavailable".to_string())?;
    let path = app.path().app_config_dir().map_err(|e| e.to_string())?.join("settings.json");
    if let Some(parent) = path.parent() { let _ = std::fs::create_dir_all(parent); }
    let mut settings = HashMap::new();
    if let Ok(content) = std::fs::read_to_string(&path) { if let Ok(existing) = serde_json::from_str::<HashMap<String, serde_json::Value>>(&content) { settings = existing; } }
    settings.insert(key.clone(), value);
    let content = serde_json::to_string(&settings).map_err(|e| e.to_string())?;
    use std::{io::Write, os::windows::ffi::OsStrExt};
    use windows::Win32::Storage::FileSystem::{MoveFileExW,MOVEFILE_REPLACE_EXISTING,MOVEFILE_WRITE_THROUGH};
    let temp=path.with_extension("json.tmp");
    let mut file=std::fs::File::create(&temp).map_err(|e|e.to_string())?;
    file.write_all(content.as_bytes()).map_err(|e|e.to_string())?;
    file.sync_all().map_err(|e|e.to_string())?;drop(file);
    let from:Vec<u16>=temp.as_os_str().encode_wide().chain(Some(0)).collect();
    let to:Vec<u16>=path.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe {MoveFileExW(windows::core::PCWSTR(from.as_ptr()),windows::core::PCWSTR(to.as_ptr()),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH).map_err(|e|e.to_string())?;}

    crate::utils::replace_settings_cache(settings.clone());
    drop(guard);

    // Broadcast so all windows sync — emit the key as-is (bloom-prefixed)
    let _ = app.emit("settings-changed", serde_json::json!({ "key": &key, "value": &settings[&key] }));

    if key == "bloom-language" {crate::localization::apply(&app);}
    if key == "bloom-shell-mode" {
        // Explicit selection acknowledges a recovery. Background events cannot.
        crate::shell_controller::reset_recovery();
    }
    if matches!(key.as_str(), "bloom-shell-mode" | "bloom-dock-enabled" | "bloom-dock-mode" | "bloom-dock-design") {
        crate::shell_controller::request_refresh(&app);
    }
    if key == "bloom-scale" {
        re_register_appbars(&app, &settings);
    }
    Ok(())
}


#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<HashMap<String, serde_json::Value>, String> {
    let path = match app.path().app_config_dir() {
        Ok(p) => p.join("settings.json"),
        Err(_) => return Ok(HashMap::new()),
    };
    if let Ok(content) = std::fs::read_to_string(path) { if let Ok(settings) = serde_json::from_str(&content) { return Ok(settings); } }
    Ok(HashMap::new())
}

#[tauri::command]
pub async fn capture_window_thumbnail(hwnd: isize, max_width: u32, max_height: u32) -> Result<Option<(String, i64)>, String> {
    tauri::async_runtime::spawn_blocking(move || unsafe {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{IsWindow, IsIconic};

        let hwnd = HWND(hwnd as *mut _);
        if !IsWindow(Some(hwnd)).as_bool() { return None; }

        let hwnd_key = hwnd.0 as isize;
        let is_minimized = IsIconic(hwnd).as_bool();

        let mut focus_time = 0i64;
        if let Some(map) = crate::state::FOCUS_TIMESTAMPS.get() {
            if let Ok(guard) = map.lock() {
                focus_time = guard.get(&hwnd_key).copied().unwrap_or(0);
            }
        }

        if is_minimized {
            // Never restore a minimized window to capture it: that briefly
            // un-minimizes it on screen. Thumbnails are kept warm by the
            // minimize/focus window hooks, so minimized windows normally have
            // a cached image already; without one we simply show no preview.
            let cached_img = if let Some(cache) = crate::state::THUMBNAIL_CACHE.get() {
                cache.lock().ok().and_then(|g| g.get(&hwnd_key).map(|(img, _)| img.clone()))
            } else {
                None
            };
            return cached_img.map(|img| (img, focus_time));
        }

        let result = crate::utils::capture_hwnd_to_base64(hwnd, max_width, max_height);

        if let Some(ref img) = result {
            if let Some(cache) = crate::state::THUMBNAIL_CACHE.get() {
                if let Ok(mut guard) = cache.lock() {
                    guard.insert(hwnd_key, (img.clone(), crate::utils::get_now_ms()));
                    // Prune dead windows if cache size exceeds 15
                    // Minimized windows (IsWindow == true) are kept intact
                    if guard.len() > 15 {
                        guard.retain(|&k, _| {
                            IsWindow(Some(HWND(k as *mut _))).as_bool()
                        });
                    }
                }
            }
        }

        result.map(|img| (img, focus_time))
    }).await.map_err(|e| e.to_string())
}


// ── Radio helpers — Windows Runtime Windows.Devices.Radios ───────────────────
// Replaces PowerShell -ExecutionPolicy Bypass scripts for WiFi/Bluetooth state.

fn get_radio_state_sync(kind: windows::Devices::Radios::RadioKind) -> Result<bool, String> {
    use windows::Devices::Radios::{Radio, RadioState};
    unsafe {
        let _ = windows::Win32::System::Com::CoInitializeEx(
            None, windows::Win32::System::Com::COINIT_MULTITHREADED,
        );
    }
    let radios = Radio::GetRadiosAsync()
        .and_then(|op| op.get())
        .map_err(|e| e.to_string())?;
    for i in 0..radios.Size().unwrap_or(0) {
        if let Ok(radio) = radios.GetAt(i) {
            if radio.Kind().ok() == Some(kind) {
                return Ok(radio.State().ok() == Some(RadioState::On));
            }
        }
    }
    Ok(false)
}

fn set_radio_state_sync(kind: windows::Devices::Radios::RadioKind, enabled: bool) -> Result<(), String> {
    use windows::Devices::Radios::{Radio, RadioState};
    unsafe {
        let _ = windows::Win32::System::Com::CoInitializeEx(
            None, windows::Win32::System::Com::COINIT_MULTITHREADED,
        );
    }
    let radios = Radio::GetRadiosAsync()
        .and_then(|op| op.get())
        .map_err(|e| e.to_string())?;
    for i in 0..radios.Size().unwrap_or(0) {
        if let Ok(radio) = radios.GetAt(i) {
            if radio.Kind().ok() == Some(kind) {
                let target = if enabled { RadioState::On } else { RadioState::Off };
                let _ = radio.SetStateAsync(target).and_then(|op| op.get());
                return Ok(());
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_volume() -> f32 {
    crate::state::CURRENT_VOLUME.load(std::sync::atomic::Ordering::Relaxed) as f32 / 100.0
}

#[tauri::command]
pub fn get_brightness() -> u32 {
    crate::state::CURRENT_BRIGHTNESS.load(std::sync::atomic::Ordering::Relaxed)
}

#[tauri::command]
pub async fn get_wifi_state() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        get_radio_state_sync(windows::Devices::Radios::RadioKind::WiFi)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_wifi_state(enabled: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        set_radio_state_sync(windows::Devices::Radios::RadioKind::WiFi, enabled)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_bluetooth_state() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        get_radio_state_sync(windows::Devices::Radios::RadioKind::Bluetooth)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_bluetooth_state(enabled: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        set_radio_state_sync(windows::Devices::Radios::RadioKind::Bluetooth, enabled)
    }).await.map_err(|e| e.to_string())?
}

// Settings openers — use ShellExecuteA directly instead of spawning powershell

#[tauri::command]
pub fn open_bluetooth_settings() {
    unsafe {
        use windows::Win32::UI::Shell::ShellExecuteA;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        let _ = ShellExecuteA(None, windows::core::PCSTR(c"open".as_ptr() as *const u8), windows::core::PCSTR(c"ms-settings:bluetooth".as_ptr() as *const u8), windows::core::PCSTR::null(), windows::core::PCSTR::null(), SW_SHOWNORMAL);
    }
}

#[tauri::command]
pub fn open_airplane_mode_settings() {
    unsafe {
        use windows::Win32::UI::Shell::ShellExecuteA;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        let _ = ShellExecuteA(None, windows::core::PCSTR(c"open".as_ptr() as *const u8), windows::core::PCSTR(c"ms-settings:network-airplanemode".as_ptr() as *const u8), windows::core::PCSTR::null(), windows::core::PCSTR::null(), SW_SHOWNORMAL);
    }
}

#[tauri::command]
pub fn set_brightness(app: AppHandle, brightness: u32) {
    let val = brightness.min(100);
    crate::state::CURRENT_BRIGHTNESS.store(val, Ordering::Relaxed);
    crate::state::LAST_BRIGHTNESS_CHANGE.store(crate::utils::get_now_ms(), Ordering::Relaxed);
    let _ = app.emit("brightness-change", BrightnessChangeEvent { brightness: val });
    if let Some(tx) = crate::state::BRIGHTNESS_SENDER.get() {
        let _ = tx.send(val);
    }
}

#[tauri::command]
pub async fn get_battery_saver_state() -> Result<bool, String> {
    // Uses Windows Runtime PowerManager — no PowerShell required.
    tauri::async_runtime::spawn_blocking(|| {
        unsafe {
            let _ = windows::Win32::System::Com::CoInitializeEx(
                None, windows::Win32::System::Com::COINIT_MULTITHREADED,
            );
        }
        use windows::System::Power::{EnergySaverStatus, PowerManager};
        match PowerManager::EnergySaverStatus() {
            Ok(status) => Ok(status == EnergySaverStatus::On),
            Err(_) => Ok(false), // No battery / not supported on this device
        }
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn open_battery_saver_settings() {
    unsafe {
        use windows::Win32::UI::Shell::ShellExecuteA;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        let _ = ShellExecuteA(None, windows::core::PCSTR(c"open".as_ptr() as *const u8), windows::core::PCSTR(c"ms-settings:batterysaver".as_ptr() as *const u8), windows::core::PCSTR::null(), windows::core::PCSTR::null(), SW_SHOWNORMAL);
    }
}

// --- System metrics for status widgets ---

#[tauri::command]
pub fn get_cpu_usage() -> Result<u32, String> {
    use std::sync::atomic::{AtomicU64, Ordering};
    static LAST_IDLE: AtomicU64 = AtomicU64::new(0);
    static LAST_KERNEL: AtomicU64 = AtomicU64::new(0);
    static LAST_USER: AtomicU64 = AtomicU64::new(0);

    unsafe {
        let mut idle = windows::Win32::Foundation::FILETIME::default();
        let mut kernel = windows::Win32::Foundation::FILETIME::default();
        let mut user = windows::Win32::Foundation::FILETIME::default();
        windows::Win32::System::Threading::GetSystemTimes(Some(&mut idle), Some(&mut kernel), Some(&mut user))
            .map_err(|e| format!("GetSystemTimes failed: {e}"))?;

        let idle_u64 = (idle.dwHighDateTime as u64) << 32 | idle.dwLowDateTime as u64;
        let kernel_u64 = (kernel.dwHighDateTime as u64) << 32 | kernel.dwLowDateTime as u64;
        let user_u64 = (user.dwHighDateTime as u64) << 32 | user.dwLowDateTime as u64;

        let prev_idle = LAST_IDLE.swap(idle_u64, Ordering::Relaxed);
        let prev_kernel = LAST_KERNEL.swap(kernel_u64, Ordering::Relaxed);
        let prev_user = LAST_USER.swap(user_u64, Ordering::Relaxed);

        let idle_delta = idle_u64.saturating_sub(prev_idle);
        let kernel_delta = kernel_u64.saturating_sub(prev_kernel);
        let user_delta = user_u64.saturating_sub(prev_user);
        let total = kernel_delta + user_delta;

        if total == 0 {
            return Ok(0);
        }
        let usage = ((total - idle_delta) * 100) / total;
        Ok(usage as u32)
    }
}

#[tauri::command]
pub fn get_ram_usage() -> Result<f32, String> {
    unsafe {
        let mut mem = windows::Win32::System::SystemInformation::MEMORYSTATUSEX::default();
        mem.dwLength = std::mem::size_of::<windows::Win32::System::SystemInformation::MEMORYSTATUSEX>() as u32;
        windows::Win32::System::SystemInformation::GlobalMemoryStatusEx(&mut mem)
            .map_err(|e| format!("GlobalMemoryStatusEx failed: {e}"))?;
        Ok(mem.dwMemoryLoad as f32)
    }
}

#[tauri::command]
pub fn get_disk_space() -> Result<u64, String> {
    unsafe {
        let mut free_bytes = 0u64;
        let mut total_bytes = 0u64;
        let mut total_free = 0u64;
        windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW(
            windows::core::w!("C:\\"),
            Some(&mut free_bytes),
            Some(&mut total_bytes),
            Some(&mut total_free),
        ).map_err(|e| format!("GetDiskFreeSpaceEx failed: {e}"))?;
        Ok(free_bytes / (1024 * 1024 * 1024))
    }
}

#[tauri::command]
pub fn get_network_speed() -> Result<(u64, u64), String> {
    use std::sync::atomic::{AtomicU64, Ordering};
    static LAST_BYTES_SENT: AtomicU64 = AtomicU64::new(0);
    static LAST_BYTES_RECV: AtomicU64 = AtomicU64::new(0);
    static LAST_CHECK: AtomicU64 = AtomicU64::new(0);

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let last_check = LAST_CHECK.load(Ordering::Relaxed);
    let elapsed = if last_check > 0 { (now - last_check).max(1) } else { 1000 };

    let (mut total_in, mut total_out) = (0u64, 0u64);
    unsafe {
        let mut table_ptr: *mut windows::Win32::NetworkManagement::IpHelper::MIB_IF_TABLE2 = std::ptr::null_mut();
        let ret = windows::Win32::NetworkManagement::IpHelper::GetIfTable2(&mut table_ptr);
        if ret.is_ok() && !table_ptr.is_null() {
            let table = &*table_ptr;
            let num_entries = table.NumEntries;
            let rows = table.Table.as_ptr();
            for i in 0..num_entries as usize {
                let row = &*rows.add(i);
                total_in += row.InOctets;
                total_out += row.OutOctets;
            }
            windows::Win32::NetworkManagement::IpHelper::FreeMibTable(table_ptr as *const _);
        }
    }

    let prev_sent = LAST_BYTES_SENT.swap(total_out, Ordering::Relaxed);
    let prev_recv = LAST_BYTES_RECV.swap(total_in, Ordering::Relaxed);
    LAST_CHECK.store(now, Ordering::Relaxed);

    if last_check == 0 {
        return Ok((0, 0));
    }

    let sent_per_sec = if total_out > prev_sent { ((total_out - prev_sent) * 1000) / elapsed } else { 0 };
    let recv_per_sec = if total_in > prev_recv { ((total_in - prev_recv) * 1000) / elapsed } else { 0 };

    Ok((sent_per_sec, recv_per_sec))
}

#[tauri::command]
pub fn get_windows_accent_color() -> Option<String> {
    unsafe {
        use windows::Win32::System::Registry::{RegOpenKeyExW, RegQueryValueExW, RegCloseKey, HKEY_CURRENT_USER, KEY_READ, REG_BINARY, REG_DWORD};
        
        // 1. Try reading AccentPalette from Explorer\Accent for the true system accent color
        let subkey = windows::core::w!("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Accent");
        let mut hkey = windows::Win32::System::Registry::HKEY::default();
        if RegOpenKeyExW(HKEY_CURRENT_USER, subkey, Some(0), KEY_READ, &mut hkey).is_ok() {
            let mut value_type = REG_BINARY;
            let mut palette = [0u8; 32];
            let mut value_size = 32u32;
            let val_name = windows::core::w!("AccentPalette");
            if RegQueryValueExW(
                hkey,
                val_name,
                None,
                Some(&mut value_type),
                Some(palette.as_mut_ptr()),
                Some(&mut value_size)
            ).is_ok() {
                let _ = RegCloseKey(hkey);
                if value_size >= 15 {
                    // bytes 12, 13, 14 are R, G, B of the active accent color
                    let r = palette[12];
                    let g = palette[13];
                    let b = palette[14];
                    return Some(format!("#{:02x}{:02x}{:02x}", r, g, b));
                }
            } else {
                let _ = RegCloseKey(hkey);
            }
        }

        // 2. Fallback to DWM\AccentColor
        let subkey = windows::core::w!("Software\\Microsoft\\Windows\\DWM");
        let mut hkey = windows::Win32::System::Registry::HKEY::default();
        if RegOpenKeyExW(HKEY_CURRENT_USER, subkey, Some(0), KEY_READ, &mut hkey).is_ok() {
            let mut value_type = REG_DWORD;
            let mut color_val = 0u32;
            let mut value_size = std::mem::size_of::<u32>() as u32;
            let val_name = windows::core::w!("AccentColor");
            if RegQueryValueExW(
                hkey,
                val_name,
                None,
                Some(&mut value_type),
                Some(&mut color_val as *mut u32 as *mut u8),
                Some(&mut value_size)
            ).is_ok() {
                let _ = RegCloseKey(hkey);
                // color_val is AABBGGRR (ABGR format)
                let r = (color_val & 0xff) as u8;
                let g = ((color_val >> 8) & 0xff) as u8;
                let b = ((color_val >> 16) & 0xff) as u8;
                return Some(format!("#{:02x}{:02x}{:02x}", r, g, b));
            }
            let _ = RegCloseKey(hkey);
        }
    }
    None
}

#[tauri::command]
pub fn get_system_accent_color() -> Result<String, String> {
    // Try reading registry first for exact Windows accent color
    if let Some(color) = get_windows_accent_color() {
        return Ok(color);
    }

    // Fallback to DwmGetColorizationColor
    unsafe {
        let mut color = 0u32;
        let mut opaque = windows::core::BOOL(0);
        if windows::Win32::Graphics::Dwm::DwmGetColorizationColor(&mut color, &mut opaque).is_ok() {
            let r = ((color >> 16) & 0xff) as u8;
            let g = ((color >> 8) & 0xff) as u8;
            let b = (color & 0xff) as u8;
            let hex = format!("#{:02x}{:02x}{:02x}", r, g, b);
            Ok(hex)
        } else {
            Err("Failed to query colorization color".into())
        }
    }
}

#[tauri::command]
pub fn export_settings(app: AppHandle) -> Result<String, String> {
    let path = app.path().app_config_dir().map_err(|e| e.to_string())?.join("settings.json");
    if let Ok(content) = std::fs::read_to_string(&path) {
        // Validate it's valid JSON before returning
        let _settings: HashMap<String, serde_json::Value> =
            serde_json::from_str(&content).map_err(|e| format!("Invalid settings file: {}", e))?;
        Ok(content)
    } else {
        Err("No settings file found".into())
    }
}

#[tauri::command]
pub fn read_settings_from_path(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn write_settings_to_path(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
pub fn import_settings(app: AppHandle, settings: String) -> Result<(), String> {
    let imported: HashMap<String, serde_json::Value> =
        serde_json::from_str(&settings).map_err(|e| format!("Invalid JSON: {}", e))?;

    let path = app.path().app_config_dir().map_err(|e| e.to_string())?.join("settings.json");
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let content = serde_json::to_string_pretty(&imported).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())?;

    crate::utils::replace_settings_cache(imported.clone());

    // Broadcast changes for every imported key so all windows re-sync
    for (key, value) in &imported {
        let _ = app.emit("settings-changed", serde_json::json!({ "key": key, "value": value }));
    }

    if imported.get("bloom-scale").is_some() {
        re_register_appbars(&app, &imported);
    }

    Ok(())
}

pub fn setup_settings_watcher(app: AppHandle) {
    use tauri::Manager;

    let config_dir = match app.path().app_config_dir() {
        Ok(p) => p,
        Err(_) => return,
    };
    let settings_path = config_dir.join("settings.json");

    // Initialize SETTINGS_CACHE if not yet set (backup for race with init_settings_cache)
    let _ = crate::state::SETTINGS_CACHE.set(std::sync::Mutex::new(HashMap::new()));

    std::thread::spawn(move || {
        use windows::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
        use windows::Win32::Storage::FileSystem::{
            CreateFileW, FILE_FLAG_BACKUP_SEMANTICS, FILE_LIST_DIRECTORY,
            FILE_NOTIFY_CHANGE_LAST_WRITE,
            OPEN_EXISTING, ReadDirectoryChangesW,
        };
        use windows::Win32::System::IO::OVERLAPPED;
        use windows::Win32::System::Threading::{CreateEventW, WaitForSingleObject, INFINITE};

        unsafe {
            let dir_path: Vec<u16> = config_dir.to_string_lossy()
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();

            let dir_handle = match CreateFileW(
                windows::core::PCWSTR(dir_path.as_ptr()),
                FILE_LIST_DIRECTORY.0,
                windows::Win32::Storage::FileSystem::FILE_SHARE_READ
                    | windows::Win32::Storage::FileSystem::FILE_SHARE_WRITE
                    | windows::Win32::Storage::FileSystem::FILE_SHARE_DELETE,
                None,
                OPEN_EXISTING,
                FILE_FLAG_BACKUP_SEMANTICS,
                None,
            ) {
                Ok(h) if h != INVALID_HANDLE_VALUE => h,
                _ => return,
            };

            let h_event = match CreateEventW(None, false, false, None) {
                Ok(e) => e,
                Err(_) => {
                    let _ = CloseHandle(dir_handle);
                    return;
                }
            };

            let mut notify_buffer = [0u8; 4096];
            let mut bytes_returned = 0u32;
            let mut overlapped = OVERLAPPED::default();
            overlapped.hEvent = h_event;

            loop {
                let success = ReadDirectoryChangesW(
                    dir_handle,
                    notify_buffer.as_mut_ptr() as *mut _,
                    notify_buffer.len() as u32,
                    false,
                    FILE_NOTIFY_CHANGE_LAST_WRITE,
                    Some(&mut bytes_returned),
                    Some(&mut overlapped),
                    None,
                );

                if success.is_err() {
                    break;
                }

                WaitForSingleObject(h_event, INFINITE);

                std::thread::sleep(std::time::Duration::from_millis(200));

                if let Ok(new_content) = std::fs::read_to_string(&settings_path) {
                    if let Ok(new_settings) = serde_json::from_str::<HashMap<String, serde_json::Value>>(&new_content) {
                        // Collect diffs while holding the lock, then drop before emitting
                        let (changed, removed) = {
                            let mut cache = crate::state::SETTINGS_CACHE
                                .get_or_init(|| std::sync::Mutex::new(HashMap::new()))
                                .lock()
                                .unwrap();

                            let mut changed = Vec::new();
                            for (key, value) in &new_settings {
                                if cache.get(key) != Some(value) {
                                    changed.push((key.clone(), value.clone()));
                                }
                            }

                            let removed: Vec<String> = cache.keys()
                                .filter(|k| !new_settings.contains_key(*k))
                                .cloned()
                                .collect();

                            *cache = new_settings.clone();
                            (changed, removed)
                        };
                        // Lock dropped — safe to emit without blocking save_setting
                        for (key, value) in &changed {
                            let _ = app.emit(
                                "settings-external-changed",
                                serde_json::json!({ "key": key, "value": value }),
                            );
                        }
                        for key in removed {
                            let _ = app.emit(
                                "settings-external-changed",
                                serde_json::json!({ "key": key, "value": null }),
                            );
                        }
                    }
                }
            }

            let _ = CloseHandle(h_event);
            let _ = CloseHandle(dir_handle);
        }
    });
}

#[cfg(test)]
mod pwa_icon_tests {
    use super::*;

    #[test]
    fn aumid_detection() {
        assert!(is_aumid_path("4DF9E0F8.Netflix_mcm4njqhnhss8!Netflix.App"));
        assert!(is_aumid_path("Microsoft.VisualStudioCode"));
        assert!(is_aumid_path("shell:AppsFolder\\4DF9E0F8.Netflix_mcm4njqhnhss8!Netflix.App"));
        assert!(!is_aumid_path("C:\\Windows\\explorer.exe"));
        assert!(!is_aumid_path("msedge.exe"));
        assert!(!is_aumid_path(""));
    }

    #[test]
    fn command_line_arg_parsing() {
        let args = "--profile-directory=\"Profile 1\" --app-id=abcdef --ip-aumid=Package_Pub!App";
        assert_eq!(extract_arg(args, "--app-id="), Some("abcdef".into()));
        assert_eq!(extract_arg(args, "--profile-directory="), Some("Profile 1".into()));
        assert_eq!(extract_arg(args, "--ip-aumid="), Some("Package_Pub!App".into()));
        assert_eq!(extract_arg(args, "--missing="), None);
        assert_eq!(extract_arg("shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App", "shell:AppsFolder\\"), Some("Microsoft.WindowsCalculator_8wekyb3d8bbwe!App".into()));
    }

    #[test]
    fn package_family_from_paths() {
        assert_eq!(
            package_family_from_windows_apps_path("C:\\Program Files\\WindowsApps\\5319275A.WhatsAppDesktop_2.2634.101.0_x64__cv1g1gvanyjgm\\WhatsApp.Root.exe").as_deref(),
            Some("5319275A.WhatsAppDesktop_cv1g1gvanyjgm")
        );
        assert_eq!(package_family_from_windows_apps_path("C:\\Windows\\explorer.exe"), None);
        assert_eq!(package_family_from_windows_apps_path("C:\\Program Files\\App\\app.exe"), None);
    }

    #[test]
    fn browser_web_app_ids_from_aumids() {
        assert_eq!(browser_web_app_id_from_aumid("Chrome.edhbnieanoeijlkpgkminebadpibapgm").as_deref(), Some("edhbnieanoeijlkpgkminebadpibapgm"));
        assert_eq!(browser_web_app_id_from_aumid("Chrome._crx_edhbnieanoeijlkpgkminebadpibapgm").as_deref(), Some("edhbnieanoeijlkpgkminebadpibapgm"));
        assert_eq!(browser_web_app_id_from_aumid("4DF9E0F8.Netflix_mcm4njqhnhss8!Netflix.App"), None);
        assert_eq!(browser_web_app_id_from_aumid("MSEdge"), None);
    }

    #[test]
    fn image_size_scoring_prefers_larger_dimensions() {
        use std::path::Path;
        assert!(image_size_score(Path::new("C:\\x\\Icons\\256.png")) > image_size_score(Path::new("C:\\x\\Icons\\64.png")));
        assert!(image_size_score(Path::new("C:\\x\\512x512.png")) > image_size_score(Path::new("C:\\x\\192x192.png")));
        assert_eq!(image_size_score(Path::new("C:\\x\\icon.png")), 0);
    }
}

#[tauri::command]
pub fn personal_power_state(app: AppHandle) -> bool {
    let mode = crate::utils::get_setting_str(&app, "bloom-personal-eco").unwrap_or_else(|| "auto".into());
    mode == "on" || (mode == "auto" && windows::System::Power::PowerManager::PowerSupplyStatus().map(|s| s == windows::System::Power::PowerSupplyStatus::NotPresent).unwrap_or(false))
}
#[tauri::command]
pub fn open_calendar_settings(app: AppHandle) {
    open_settings_window(app.clone());
    let _ = app.emit_to("settings", "open-calendar-settings", ());
}

#[tauri::command]
pub fn open_notification_settings(app: AppHandle) { open_settings_window(app.clone()); let _=app.emit_to("settings","open-notification-settings",()); }
