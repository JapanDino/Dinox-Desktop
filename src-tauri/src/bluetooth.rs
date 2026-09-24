//! Read-only device snapshots. Radio state changes require an explicit UI action.
use serde::Serialize;
use std::{collections::HashSet, sync::atomic::{AtomicBool, Ordering}};
use windows::{core::HSTRING, Devices::{Bluetooth::{BluetoothDevice, BluetoothLEDevice, BluetoothConnectionStatus}, Enumeration::DeviceInformation, Radios::{Radio, RadioKind, RadioState, RadioAccessStatus}}, Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED}};

#[derive(Serialize)]
pub struct Device { pub id:String, pub name:String, pub connected:Option<bool>, pub low_energy:bool }
#[derive(Serialize)]
pub struct Snapshot { pub available:bool, pub enabled:bool, pub controllable:bool, pub devices:Vec<Device>, pub warning:Option<String> }
struct Apartment;
impl Apartment { fn new()->Result<Self,String> { unsafe {RoInitialize(RO_INIT_MULTITHREADED)}.map_err(|_|"Bluetooth недоступен. Откройте панель Windows.".to_string())?; Ok(Self) } }
impl Drop for Apartment {fn drop(&mut self){unsafe{RoUninitialize();}}}
fn radios()->Result<Vec<Radio>,String> {
    let all=Radio::GetRadiosAsync().and_then(|op|op.get()).map_err(|_|"Не удалось прочитать состояние Bluetooth".to_string())?;
    Ok(all.into_iter().filter(|r|r.Kind().ok()==Some(RadioKind::Bluetooth)).collect())
}
fn query(selector:HSTRING)->windows::core::Result<windows::Devices::Enumeration::DeviceInformationCollection> {
    DeviceInformation::FindAllAsyncWithKindAqsFilterAndAdditionalProperties(&selector, None, windows::Devices::Enumeration::DeviceInformationKind::AssociationEndpoint)?.get()
}

pub fn read_snapshot()->Result<Snapshot,String> {
    let _apartment=Apartment::new()?;
    let radios=radios()?;
    let states:Vec<_>=radios.iter().filter_map(|r|r.State().ok()).collect();
    let mut result=Snapshot{available:!radios.is_empty(),enabled:states.contains(&RadioState::On),controllable:states.iter().any(|s|*s==RadioState::On||*s==RadioState::Off),devices:vec![],warning:None};
    if !result.available {return Ok(result)}
    let mut seen=HashSet::new();
    for low_energy in [false,true] {
        let connected_selector=if low_energy {BluetoothLEDevice::GetDeviceSelectorFromConnectionStatus(BluetoothConnectionStatus::Connected)} else {BluetoothDevice::GetDeviceSelectorFromConnectionStatus(BluetoothConnectionStatus::Connected)};
        let connected=connected_selector.and_then(query).map(|items|items.into_iter().filter_map(|d|d.Id().ok().map(|id|id.to_string())).collect::<HashSet<_>>());
        let paired_selector=if low_energy {BluetoothLEDevice::GetDeviceSelectorFromPairingState(true)} else {BluetoothDevice::GetDeviceSelectorFromPairingState(true)};
        match paired_selector.and_then(query) {
            Ok(items)=>for item in items {
                let Ok(id)=item.Id().map(|s|s.to_string()) else {continue};
                if !seen.insert(id.clone()){continue}
                let name=item.Name().map(|s|s.to_string()).unwrap_or_default();
                let is_connected=connected.as_ref().ok().map(|ids|ids.contains(&id));
                result.devices.push(Device{id,name,connected:is_connected,low_energy});
            },
            Err(_)=>result.warning=Some("Часть устройств недоступна. Попробуйте обновить список.".into()),
        }
        if connected.is_err(){result.warning=Some("Не удалось обновить статус подключения".into())}
    }
    result.devices.sort_by(|a,b|b.connected.cmp(&a.connected).then_with(||a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(result)
}

#[tauri::command]
pub async fn bluetooth_snapshot()->Result<Snapshot,String> {
    tauri::async_runtime::spawn_blocking(read_snapshot).await.map_err(|_|"Не удалось прочитать состояние Bluetooth".to_string())?
}

static ACCESS_ALLOWED:AtomicBool=AtomicBool::new(false);
#[tauri::command]
pub async fn bluetooth_set_enabled(app:tauri::AppHandle,enabled:bool)->Result<(),String> {
    if !ACCESS_ALLOWED.load(Ordering::Relaxed) {
        let (send,receive)=tokio::sync::oneshot::channel();
        app.run_on_main_thread(move|| {
            let operation=Radio::RequestAccessAsync();
            std::thread::spawn(move|| {
                let result=operation.and_then(|op|op.get());
                let _=send.send(result.map(|s|s==RadioAccessStatus::Allowed).unwrap_or(false));
            });
        }).map_err(|_|"Не удалось запросить управление Bluetooth")?;
        if !receive.await.unwrap_or(false){return Err("Windows не разрешила менять Bluetooth. Откройте панель Windows.".into())}
        ACCESS_ALLOWED.store(true,Ordering::Relaxed);
    }
    tauri::async_runtime::spawn_blocking(move|| {
        let _apartment=Apartment::new()?;
        let radios=radios()?;
        if radios.is_empty(){return Err("Bluetooth-адаптер не найден".into())}
        let target=if enabled{RadioState::On}else{RadioState::Off};
        for radio in radios {
            if radio.State().ok()==Some(target){continue}
            let accepted=radio.SetStateAsync(target).and_then(|op|op.get()).map(|s|s==RadioAccessStatus::Allowed).unwrap_or(false);
            if !accepted {ACCESS_ALLOWED.store(false,Ordering::Relaxed);return Err("Windows не применила переключение Bluetooth".into())}
        }
        Ok(())
    }).await.map_err(|_|"Не удалось переключить Bluetooth".to_string())?
}
