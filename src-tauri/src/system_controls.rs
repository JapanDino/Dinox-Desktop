//! System controls for the dock. Read-only status; actions require an explicit click.
use serde::Serialize;
use std::sync::atomic::Ordering;
use tauri::AppHandle;
use crate::state::*;

#[derive(Serialize)]
pub struct Status {
    volume: Option<u32>, muted: bool, brightness: Option<u32>,
    battery: Option<i32>, charging: bool, plugged_in: bool, language: String,
}

pub(crate) fn language_label(id: u16) -> String {
    match id & 0x3ff {
        0x09 => "EN", 0x19 => "RU", 0x22 => "UK", 0x23 => "BE",
        0x07 => "DE", 0x0c => "FR", 0x0a => "ES", 0x10 => "IT",
        0x15 => "PL", 0x16 => "PT", 0x1f => "TR", 0x11 => "JA",
        0x12 => "KO", 0x04 => "ZH", 0x01 => "AR", 0x0d => "HE",
        0 => "—", _ => return format!("{:04X}", id),
    }.into()
}

#[tauri::command]
pub async fn system_controls_status() -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(|| {
        use windows::System::Power::{PowerManager, BatteryStatus, PowerSupplyStatus};
        use windows::Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED};
        struct Apartment(bool);
        impl Drop for Apartment { fn drop(&mut self) { if self.0 { unsafe { RoUninitialize(); } } } }
        let _apartment = Apartment(unsafe { RoInitialize(RO_INIT_MULTITHREADED).is_ok() });
        let battery_status = PowerManager::BatteryStatus().ok();
        let battery = match battery_status {
            Some(s) if s != BatteryStatus::NotPresent => PowerManager::RemainingChargePercent().ok().filter(|v| (0..=100).contains(v)),
            _ => None,
        };
        let language = crate::keyboard_layout::current_label();
        Status {
            volume: CURRENT_AUDIO_READY.load(Ordering::Relaxed).then(|| CURRENT_VOLUME.load(Ordering::Relaxed).min(100)),
            muted: CURRENT_MUTED.load(Ordering::Relaxed),
            brightness: BRIGHTNESS_AVAILABLE.load(Ordering::Relaxed).then(|| CURRENT_BRIGHTNESS.load(Ordering::Relaxed).min(100)),
            battery, charging: battery_status == Some(BatteryStatus::Charging),
            plugged_in: PowerManager::PowerSupplyStatus().map(|s| s != PowerSupplyStatus::NotPresent).unwrap_or(false),
            language,
        }
    }).await.map_err(|_| "Не удалось прочитать состояние системы".into())
}

fn settings_uri(action: &str) -> Option<&'static str> {
    match action {
        "wifi" => Some("ms-settings:network-wifi"),
        "wifi-location" => Some("ms-settings:privacy-location"),
        "wifi-panel" => Some("ms-availablenetworks:"),
        "network" => Some("ms-settings:network-status"),
        "bluetooth" => Some("ms-settings:bluetooth"),
        "mixer" => Some("ms-settings:apps-volume"),
        "sound" => Some("ms-settings:sound"),
        "display" => Some("ms-settings:display"),
        "battery" => Some("ms-settings:powersleep"),
        "language-settings" => Some("ms-settings:regionlanguage"),
        "vpn" => Some("ms-settings:network-vpn"),
        "notifications" => Some("ms-actioncenter:"),
        "taskbar-settings" => Some("ms-settings:taskbar"),
        _ => None,
    }
}

fn shortcut(key: u16) -> Result<(), String> {
    use windows::Win32::UI::Input::KeyboardAndMouse::*;
    let input = |vk, up| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: VIRTUAL_KEY(vk), dwFlags: if up { KEYEVENTF_KEYUP } else { Default::default() }, ..Default::default() } },
    };
    let keys = [input(VK_LWIN.0,false),input(key,false),input(key,true),input(VK_LWIN.0,true)];
    if unsafe { SendInput(&keys,std::mem::size_of::<INPUT>() as i32) } == keys.len() as u32 { Ok(()) }
    else { Err("Windows не приняла сочетание клавиш. Открой панель вручную.".into()) }
}

#[tauri::command]
pub async fn system_control_action(app: AppHandle, action: String) -> Result<(), String> {
    match action.as_str() {
        "bluetooth-add" => {
            let system=std::env::var_os("SystemRoot").ok_or("Папка Windows недоступна")?;
            let path=std::path::PathBuf::from(system).join("System32").join("DevicePairingWizard.exe");
            return tauri::async_runtime::spawn_blocking(move||crate::system_launch::launch(&path.to_string_lossy())).await.map_err(|_|"Не удалось открыть панель Windows".to_string())?;
        },
        "layout" => return Err("Выберите раскладку в панели Dinox".into()),
        "quick-settings" => return shortcut(0x41),
        "mute" => return COMMAND_SENDER.get().ok_or("Звуковая служба недоступна")?
            .send(crate::types::SystemCommand::VolumeMute).map_err(|_| "Звуковая служба недоступна".into()),
        "tray" => return crate::commands::open_system_tray(app).await,
        "restore-taskbar" => {
            crate::commands::save_setting(app.clone(), "bloom-dock-enabled".into(), serde_json::json!("false"))?;
            crate::commands::toggle_dock(app, false).await;
            return Ok(())
        },
        _ => (),
    }
    let uri = settings_uri(&action).ok_or("Неизвестное действие")?;
    crate::diagnostics::record(&format!("system action {action}: begin"));
    let result=tauri::async_runtime::spawn_blocking(move || crate::system_launch::launch(uri))
        .await.map_err(|_|"Не удалось открыть панель Windows".to_string())?;
    crate::diagnostics::record(&format!("system action {action}: {}",if result.is_ok(){"accepted"}else{"failed"}));
    result

}

#[cfg(test)]
mod tests {
    #[test] fn labels_cover_user_layouts_and_variants() {
        assert_eq!(super::language_label(0x0419),"RU");
        assert_eq!(super::language_label(0x0409),"EN");
        assert_eq!(super::language_label(0x0809),"EN");
        assert_eq!(super::language_label(0),"—");
    }
    #[test] fn actions_cannot_launch_arbitrary_commands() {
        for bad in ["cmd.exe", "https://example.com", "ms-settings:sound", "mixer;calc"] { assert_eq!(super::settings_uri(bad),None); }
        assert_eq!(super::settings_uri("mixer"),Some("ms-settings:apps-volume"));
    }
}
