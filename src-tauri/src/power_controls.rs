//! Existing Windows power plans only. Reads do not change the machine.
use serde::Serialize;
use std::{collections::HashSet, sync::atomic::{AtomicBool, Ordering}, time::{Duration, Instant}};
use windows::{core::GUID, System::Power::{BatteryStatus, PowerManager, PowerSupplyStatus}, Win32::{Foundation::{ERROR_MORE_DATA, ERROR_NO_MORE_ITEMS, ERROR_SUCCESS, HLOCAL, LocalFree}, System::{Power::{ACCESS_SCHEME, PowerEnumerate, PowerGetActiveScheme, PowerReadFriendlyName, PowerSetActiveScheme}, WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED}}}};

const OPERATION_TIMEOUT: Duration = Duration::from_secs(5);
static BUSY: AtomicBool = AtomicBool::new(false);
struct Operation;
impl Drop for Operation { fn drop(&mut self) { BUSY.store(false, Ordering::Release); } }
struct Apartment(bool);
impl Drop for Apartment { fn drop(&mut self) { if self.0 { unsafe { RoUninitialize(); } } } }

#[derive(Debug, Serialize)]
pub struct PowerPlan { pub id: String, pub name: String, pub active: bool }
#[derive(Debug, Serialize)]
pub struct PowerSnapshot {
    pub battery_present: Option<bool>, pub battery_percent: Option<i32>,
    pub charging: Option<bool>, pub plugged_in: Option<bool>, pub remaining_minutes: Option<u64>,
    pub plans: Vec<PowerPlan>, pub plans_available: bool, pub warning: Option<String>,
}

fn check_deadline(deadline: Instant) -> Result<(), String> {
    if Instant::now() >= deadline { Err("Power operation timed out. Refresh to check the current state.".into()) } else { Ok(()) }
}
fn remaining_minutes(ticks: i64) -> Option<u64> {
    // WinRT may return an unavailable/maximal duration. Never display that as an estimate.
    const MAX_ESTIMATE: i64 = 7 * 24 * 60 * 60 * 10_000_000;
    (ticks > 0 && ticks <= MAX_ESTIMATE).then(|| ((ticks as u64) + 599_999_999) / 600_000_000)
}
fn active_scheme() -> Result<GUID, String> {
    let mut pointer = std::ptr::null_mut();
    let status = unsafe { PowerGetActiveScheme(None, &mut pointer) };
    let guid = if status == ERROR_SUCCESS && !pointer.is_null() { Some(unsafe { *pointer }) } else { None };
    if !pointer.is_null() { unsafe { let _ = LocalFree(Some(HLOCAL(pointer.cast()))); } }
    guid.ok_or_else(|| format!("Cannot read the active power plan (Windows code {}).", status.0))
}
fn friendly_name(guid: &GUID) -> String {
    let mut size = 0;
    let status = unsafe { PowerReadFriendlyName(None, Some(guid), None, None, None, &mut size) };
    if (status != ERROR_MORE_DATA && status != ERROR_SUCCESS) || size == 0 || size > 65_536 || size % 2 != 0 { return format!("{guid:?}"); }
    let mut buffer = vec![0u16; size as usize / 2];
    let capacity = size;
    let status = unsafe { PowerReadFriendlyName(None, Some(guid), None, None, Some(buffer.as_mut_ptr().cast()), &mut size) };
    if status != ERROR_SUCCESS || size > capacity { return format!("{guid:?}"); }
    let length = buffer.iter().position(|value| *value == 0).unwrap_or(buffer.len());
    let name = String::from_utf16_lossy(&buffer[..length]).trim().to_string();
    if name.is_empty() { format!("{guid:?}") } else { name }
}
fn enumerate_plans(deadline: Instant) -> Result<Vec<GUID>, String> {
    let mut plans = Vec::new();
    let mut seen = HashSet::new();
    for index in 0..128 {
        check_deadline(deadline)?;
        let mut guid = GUID::zeroed();
        let mut size = std::mem::size_of::<GUID>() as u32;
        let status = unsafe { PowerEnumerate(None, None, None, ACCESS_SCHEME, index, Some((&mut guid as *mut GUID).cast()), &mut size) };
        if status == ERROR_NO_MORE_ITEMS { return Ok(plans); }
        if status != ERROR_SUCCESS || size != std::mem::size_of::<GUID>() as u32 {
            return Err(format!("Power plans are unavailable (Windows code {}).", status.0));
        }
        if seen.insert(guid) { plans.push(guid); }
    }
    Err("Windows returned too many power plans. The list could not be verified.".into())
}
fn snapshot(deadline: Instant) -> Result<PowerSnapshot, String> {
    check_deadline(deadline)?;
    let _apartment = Apartment(unsafe { RoInitialize(RO_INIT_MULTITHREADED).is_ok() });
    let battery_status = PowerManager::BatteryStatus().ok();
    let battery_present = battery_status.map(|status| status != BatteryStatus::NotPresent);
    let battery_percent = if battery_present == Some(true) { PowerManager::RemainingChargePercent().ok().filter(|value| (0..=100).contains(value)) } else { None };
    let charging = battery_status.map(|status| status == BatteryStatus::Charging);
    let plugged_in = PowerManager::PowerSupplyStatus().ok().map(|status| status != PowerSupplyStatus::NotPresent);
    let remaining = if battery_status == Some(BatteryStatus::Discharging) && plugged_in == Some(false) {
        PowerManager::RemainingDischargeTime().ok().and_then(|span| remaining_minutes(span.Duration))
    } else { None };
    check_deadline(deadline)?;
    let active = active_scheme();
    let mut warnings = Vec::new();
    if battery_status.is_none() { warnings.push("Battery information is unavailable.".to_string()); }
    if let Err(error) = &active { warnings.push(error.clone()); }
    let mut plans = Vec::new();
    let plans_available = match enumerate_plans(deadline) {
        Ok(guids) => {
            for guid in guids {
                check_deadline(deadline)?;
                plans.push(PowerPlan { id: format!("{guid:?}"), name: friendly_name(&guid), active: active.as_ref().map(|current| *current == guid).unwrap_or(false) });
            }
            true
        }
        Err(error) => { warnings.push(error); false }
    };
    check_deadline(deadline)?;
    Ok(PowerSnapshot { battery_present, battery_percent, charging, plugged_in, remaining_minutes: remaining, plans, plans_available, warning: (!warnings.is_empty()).then(|| warnings.join(" ")) })
}
async fn run<T: Send + 'static>(operation: impl FnOnce(Instant) -> Result<T, String> + Send + 'static) -> Result<T, String> {
    BUSY.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire).map_err(|_| "Power information is still being checked. Please try again.".to_string())?;
    let guard = Operation;
    let deadline = Instant::now() + OPERATION_TIMEOUT;
    // The lease remains held even if the caller times out, preventing unbounded workers.
    let worker = tauri::async_runtime::spawn_blocking(move || { let _guard = guard; operation(deadline) });
    tokio::time::timeout(OPERATION_TIMEOUT, worker).await
        .map_err(|_| "Power operation timed out. Refresh to check the current state.".to_string())?
        .map_err(|_| "Could not read power information.".to_string())?
}
#[tauri::command]
pub async fn power_snapshot() -> Result<PowerSnapshot, String> { run(snapshot).await }
#[tauri::command]
pub async fn power_set_scheme(scheme_id: String) -> Result<PowerSnapshot, String> {
    let wanted = GUID::try_from(scheme_id.as_str()).map_err(|_| "Invalid power plan identifier.".to_string())?;
    run(move |deadline| {
        let existing = enumerate_plans(deadline)?;
        if !existing.contains(&wanted) { return Err("This power plan no longer exists. Refresh the list.".into()); }
        check_deadline(deadline)?;
        let status = unsafe { PowerSetActiveScheme(None, Some(&wanted)) };
        if status != ERROR_SUCCESS { return Err(format!("Windows could not apply the power plan (code {}).", status.0)); }
        let confirmed = active_scheme()?;
        if confirmed != wanted { return Err("Windows did not confirm the selected power plan. Refresh the current state.".into()); }
        snapshot(deadline)
    }).await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn unavailable_runtime_is_not_displayed() { assert_eq!(remaining_minutes(-1), None); assert_eq!(remaining_minutes(0), None); assert_eq!(remaining_minutes(i64::MAX), None); }
    #[test] fn runtime_rounds_to_whole_minutes() { assert_eq!(remaining_minutes(600_000_000), Some(1)); assert_eq!(remaining_minutes(600_000_001), Some(2)); }
    #[test] fn plan_id_is_strict() { assert!(GUID::try_from("cmd.exe").is_err()); assert!(GUID::try_from("381b4222-f694-41f0-9685-ff5bb260df2e").is_ok()); }
    #[test] fn expired_work_is_rejected_before_mutation() { assert!(check_deadline(Instant::now() - Duration::from_millis(1)).is_err()); }
}
