//! Native WLAN snapshots and saved-profile connections. Never reads or stores passwords.
use serde::Serialize;
use windows::{core::{GUID,PCWSTR},Win32::{Foundation::HANDLE,NetworkManagement::WiFi::*}};
use std::{ffi::c_void,sync::atomic::{AtomicBool,Ordering},time::Duration};

#[derive(Serialize)]
pub struct Network {pub id:String,pub adapter:String,pub name:String,pub signal:u32,pub secure:bool,pub saved:bool,pub connected:bool,pub connectable:bool,pub personal:bool}
#[derive(Serialize)]
pub struct Snapshot {pub available:bool,pub enabled:Option<bool>,pub controllable:bool,pub networks:Vec<Network>,pub warning:Option<String>}
struct Client(HANDLE);
impl Client {fn open()->Result<Self,String>{let mut handle=HANDLE::default();let mut version=0;check(unsafe{WlanOpenHandle(2,None,&mut version,&mut handle)})?;Ok(Self(handle))}}
impl Drop for Client {fn drop(&mut self){unsafe{WlanCloseHandle(self.0,None);}}}
struct Memory(*mut c_void);
impl Drop for Memory {fn drop(&mut self){unsafe{WlanFreeMemory(self.0);}}}
fn check(code:u32)->Result<(),String>{match code {
    0=>Ok(()),
    5=>Err("Windows ограничила доступ к сетям Wi-Fi. Проверьте разрешение на местоположение в параметрах Windows.".into()),
    1062=>Err("Служба Wi-Fi Windows недоступна".into()),
    5023=>Err("Wi-Fi выключен или адаптер не готов. Откройте панель Windows.".into()),
    _=>Err(format!("Wi-Fi: Windows error {code}")),
}}
fn wide_text(value:&[u16])->String{String::from_utf16_lossy(&value[..value.iter().position(|v|*v==0).unwrap_or(value.len())])}
fn key(guid:&GUID,n:&WLAN_AVAILABLE_NETWORK)->String{
    let raw=&n.dot11Ssid.ucSSID[..(n.dot11Ssid.uSSIDLength as usize).min(32)];
    format!("{:?}:{}:{}:{}",guid,raw.iter().map(|b|format!("{b:02x}")).collect::<String>(),n.dot11BssType.0,n.dot11DefaultAuthAlgorithm.0)
}
fn interfaces(client:&Client)->Result<Vec<WLAN_INTERFACE_INFO>,String>{unsafe{
    let mut p=std::ptr::null_mut();check(WlanEnumInterfaces(client.0,None,&mut p))?;
    if p.is_null(){return Ok(vec![])}let _memory=Memory(p.cast());
    let count=(*p).dwNumberOfItems as usize;if count>256{return Err("Список адаптеров Wi-Fi недоступен".into())}
    Ok(std::slice::from_raw_parts(std::ptr::addr_of!((*p).InterfaceInfo).cast::<WLAN_INTERFACE_INFO>(),count).to_vec())
}}
fn networks(client:&Client,guid:&GUID)->Result<Vec<WLAN_AVAILABLE_NETWORK>,String>{unsafe{
    let mut p=std::ptr::null_mut();check(WlanGetAvailableNetworkList(client.0,guid,0,None,&mut p))?;
    if p.is_null(){return Ok(vec![])}let _memory=Memory(p.cast());
    let count=(*p).dwNumberOfItems as usize;if count>8192{return Err("Список сетей Wi-Fi недоступен".into())}
    Ok(std::slice::from_raw_parts(std::ptr::addr_of!((*p).Network).cast::<WLAN_AVAILABLE_NETWORK>(),count).to_vec())
}}
pub fn read_snapshot(scan:bool)->Result<Snapshot,String>{
    let client=Client::open()?;let adapters=interfaces(&client)?;
    let state=radio_state().ok();
    let mut result=Snapshot{available:!adapters.is_empty(),enabled:state.map(|s|s.0),controllable:state.is_some_and(|s|s.1),networks:vec![],warning:None};
    if result.enabled==Some(false){return Ok(result)}
    for adapter in adapters {
        if scan {if let Err(error)=check(unsafe{WlanScan(client.0,&adapter.InterfaceGuid,None,None,None)}){result.warning=Some(error);}}
        match networks(&client,&adapter.InterfaceGuid){
            Ok(list)=>for n in list {
                let id=key(&adapter.InterfaceGuid,&n);
                let raw=&n.dot11Ssid.ucSSID[..(n.dot11Ssid.uSSIDLength as usize).min(32)];
                let next=Network{id:id.clone(),adapter:wide_text(&adapter.strInterfaceDescription),name:String::from_utf8_lossy(raw).into_owned(),signal:n.wlanSignalQuality.min(100),secure:n.bSecurityEnabled.as_bool(),saved:n.dwFlags&WLAN_AVAILABLE_NETWORK_HAS_PROFILE!=0 && !wide_text(&n.strProfileName).is_empty(),connected:n.dwFlags&WLAN_AVAILABLE_NETWORK_CONNECTED!=0,connectable:n.bNetworkConnectable.as_bool(),personal:profile_security(&n).is_some()};
                if let Some(old)=result.networks.iter_mut().find(|x|x.id==id){if next.connected || (!old.connected && next.saved){*old=next;}}
                else{result.networks.push(next);}
            },
            Err(error)=>result.warning=Some(error),
        }
    }
    result.networks.sort_by(|a,b|b.connected.cmp(&a.connected).then(b.signal.cmp(&a.signal)).then(a.name.cmp(&b.name)));
    Ok(result)
}
fn connect_network(id:&str,password:Option<&str>,remember:bool)->Result<(),String>{
    let client=Client::open()?;
    for adapter in interfaces(&client)? {
        for n in networks(&client,&adapter.InterfaceGuid)? {
            if key(&adapter.InterfaceGuid,&n)!=id{continue}
            if n.dwFlags&WLAN_AVAILABLE_NETWORK_CONNECTED!=0{return Ok(())}
            if !n.bNetworkConnectable.as_bool(){return Err("Windows не может подключиться к этой сети".into())}
            if password.is_some() || n.dwFlags&WLAN_AVAILABLE_NETWORK_HAS_PROFILE==0 || wide_text(&n.strProfileName).is_empty(){
                let (name,xml)=profile_xml(&n,password)?;
                let xml:Vec<u16>=xml.encode_utf16().chain(Some(0)).collect();
                let name:Vec<u16>=name.encode_utf16().chain(Some(0)).collect();
                // Only the deterministic Bloom profile for this exact SSID/auth is updated.
                if remember {let mut reason=0;check(unsafe{WlanSetProfile(client.0,&adapter.InterfaceGuid,WLAN_PROFILE_USER,PCWSTR(xml.as_ptr()),PCWSTR::null(),true,None,&mut reason)})?;}
                let params=WLAN_CONNECTION_PARAMETERS{wlanConnectionMode:if remember{wlan_connection_mode_profile}else{wlan_connection_mode_temporary_profile},strProfile:PCWSTR(if remember{name.as_ptr()}else{xml.as_ptr()}),dot11BssType:n.dot11BssType,..Default::default()};
                return check(unsafe{WlanConnect(client.0,&adapter.InterfaceGuid,&params,None)});
            }
            let parameters=WLAN_CONNECTION_PARAMETERS{wlanConnectionMode:wlan_connection_mode_profile,strProfile:PCWSTR(n.strProfileName.as_ptr()),dot11BssType:n.dot11BssType,..Default::default()};
            return check(unsafe{WlanConnect(client.0,&adapter.InterfaceGuid,&parameters,None)});
        }
    }
    Err("Сеть больше недоступна или не сохранена. Обновите список.".into())
}
#[tauri::command]
pub async fn wifi_snapshot(scan:bool)->Result<Snapshot,String>{
    static READING:AtomicBool=AtomicBool::new(false);
    if READING.swap(true,Ordering::SeqCst){return Err("Windows ещё обновляет список сетей. Попробуйте немного позже.".into())}
    struct BusyGuard;
    impl Drop for BusyGuard {fn drop(&mut self){READING.store(false,Ordering::SeqCst);}}
    let worker=tauri::async_runtime::spawn_blocking(move||{let _guard=BusyGuard;read_snapshot(scan)});
    tokio::time::timeout(Duration::from_secs(10),worker).await
        .map_err(|_|"Windows ещё обновляет список сетей. Попробуйте немного позже.".to_string())?
        .map_err(|_|"Список сетей Wi-Fi недоступен".to_string())?
}
#[tauri::command]
pub async fn wifi_connect(id:String,password:Option<String>,remember:Option<bool>)->Result<(),String>{tauri::async_runtime::spawn_blocking(move||connect_network(&id,password.as_deref(),remember.unwrap_or(false))).await.map_err(|_|"Windows не может подключиться к этой сети".to_string())?}

fn escape_xml(s:&str)->String{s.replace('&',"&amp;").replace('<',"&lt;").replace('>',"&gt;").replace('"',"&quot;").replace('\'',"&apos;")}
fn profile_security(n:&WLAN_AVAILABLE_NETWORK)->Option<(&'static str,&'static str)>{
    if n.dot11BssType!=dot11_BSS_type_infrastructure{return None}
    let auth=match n.dot11DefaultAuthAlgorithm {DOT11_AUTH_ALGO_80211_OPEN if !n.bSecurityEnabled.as_bool()=>"open",DOT11_AUTH_ALGO_WPA_PSK=>"WPAPSK",DOT11_AUTH_ALGO_RSNA_PSK=>"WPA2PSK",DOT11_AUTH_ALGO_WPA3_SAE=>"WPA3SAE",_=>return None};
    let cipher=match n.dot11DefaultCipherAlgorithm {DOT11_CIPHER_ALGO_NONE if auth=="open"=>"none",DOT11_CIPHER_ALGO_CCMP=>"AES",DOT11_CIPHER_ALGO_TKIP if auth!="WPA3SAE"=>"TKIP",_=>return None};Some((auth,cipher))
}
fn profile_xml(n:&WLAN_AVAILABLE_NETWORK,password:Option<&str>)->Result<(String,String),String>{
    let (auth,cipher)=profile_security(n).ok_or("Для этой корпоративной сети нужны дополнительные параметры Windows")?;
    let ssid=&n.dot11Ssid.ucSSID[..(n.dot11Ssid.uSSIDLength as usize).min(32)];
    if ssid.is_empty(){return Err("Скрытую сеть нужно добавить в Windows".into())}
    let hex=ssid.iter().map(|b|format!("{b:02X}")).collect::<String>();
    let name=format!("Dinox-{hex}-{auth}");
    let shared=if auth=="open"{String::new()}else{
        let pass=password.unwrap_or_default();
        if !(8..=63).contains(&pass.len()) || !pass.bytes().all(|b|(32..=126).contains(&b)){return Err("Пароль Wi-Fi должен содержать от 8 до 63 печатных латинских символов".into())}
        format!("<sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>{}</keyMaterial></sharedKey>",escape_xml(pass))
    };
    let xml=format!(r#"<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>{name}</name><SSIDConfig><SSID><hex>{hex}</hex></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>manual</connectionMode><MSM><security><authEncryption><authentication>{auth}</authentication><encryption>{cipher}</encryption><useOneX>false</useOneX></authEncryption>{shared}</security></MSM></WLANProfile>"#);
    Ok((name,xml))
}
#[tauri::command]
pub async fn wifi_disconnect(id:String)->Result<(),String>{tauri::async_runtime::spawn_blocking(move||{
    let client=Client::open()?;for adapter in interfaces(&client)?{for n in networks(&client,&adapter.InterfaceGuid)?{if key(&adapter.InterfaceGuid,&n)==id && n.dwFlags&WLAN_AVAILABLE_NETWORK_CONNECTED!=0{return check(unsafe{WlanDisconnect(client.0,&adapter.InterfaceGuid,None)})}}}Err("Сеть уже отключена. Обновите список.".into())
}).await.map_err(|_|"Не удалось отключиться от сети".to_string())?}

use windows::{Devices::Radios::{Radio,RadioKind,RadioState,RadioAccessStatus},Win32::System::WinRT::{RoInitialize,RoUninitialize,RO_INIT_MULTITHREADED}};
struct Apartment;
impl Apartment {fn new()->Result<Self,String>{unsafe{RoInitialize(RO_INIT_MULTITHREADED)}.map_err(|_|"Управление Wi-Fi недоступно".to_string())?;Ok(Self)}}
impl Drop for Apartment{fn drop(&mut self){unsafe{RoUninitialize();}}}
fn wifi_radios()->Result<Vec<Radio>,String>{Ok(Radio::GetRadiosAsync().and_then(|op|op.get()).map_err(|_|"Управление Wi-Fi недоступно".to_string())?.into_iter().filter(|r|r.Kind().ok()==Some(RadioKind::WiFi)).collect())}
fn radio_state()->Result<(bool,bool),String>{let _a=Apartment::new()?;let radios=wifi_radios()?;if radios.is_empty(){return Err("Адаптер Wi-Fi не найден".into())}let states:Vec<_>=radios.iter().filter_map(|r|r.State().ok()).collect();Ok((states.contains(&RadioState::On),states.iter().any(|s|*s==RadioState::On||*s==RadioState::Off)))}
#[tauri::command]
pub async fn wifi_set_enabled(app:tauri::AppHandle,enabled:bool)->Result<(),String>{
    static ACCESS:AtomicBool=AtomicBool::new(false);
    if !ACCESS.load(Ordering::Relaxed){let(send,receive)=tokio::sync::oneshot::channel();app.run_on_main_thread(move||{let op=Radio::RequestAccessAsync();std::thread::spawn(move||{let _=send.send(op.and_then(|o|o.get()).map(|s|s==RadioAccessStatus::Allowed).unwrap_or(false));});}).map_err(|_|"Управление Wi-Fi недоступно")?;if !receive.await.unwrap_or(false){return Err("Windows не разрешила переключение Wi-Fi".into())}ACCESS.store(true,Ordering::Relaxed);}
    tauri::async_runtime::spawn_blocking(move||{let _a=Apartment::new()?;let radios=wifi_radios()?;if radios.is_empty(){return Err("Адаптер Wi-Fi не найден".into())}let target=if enabled{RadioState::On}else{RadioState::Off};for r in radios{if r.State().ok()==Some(target){continue}if r.SetStateAsync(target).and_then(|op|op.get()).ok()!=Some(RadioAccessStatus::Allowed){ACCESS.store(false,Ordering::Relaxed);return Err("Windows не разрешила переключение Wi-Fi".into())}}Ok(())}).await.map_err(|_|"Управление Wi-Fi недоступно".to_string())?
}

#[cfg(test)]
mod tests {use super::*;
    #[test]fn ssid_identity_preserves_bytes_and_security(){let mut a=WLAN_AVAILABLE_NETWORK::default();a.dot11Ssid.uSSIDLength=2;a.dot11Ssid.ucSSID[..2].copy_from_slice(&[0xff,0x00]);let mut b=a;b.dot11Ssid.ucSSID[0]=0xfe;assert_ne!(key(&GUID::zeroed(),&a),key(&GUID::zeroed(),&b));b=a;b.dot11DefaultAuthAlgorithm.0+=1;assert_ne!(key(&GUID::zeroed(),&a),key(&GUID::zeroed(),&b));}
    #[test]fn access_denial_has_an_actionable_message(){assert!(check(5).unwrap_err().contains("местоположение"));assert!(check(0).is_ok());}
    #[test]fn personal_profile_escapes_password_and_encodes_ssid(){
        let mut n=WLAN_AVAILABLE_NETWORK::default();n.dot11BssType=dot11_BSS_type_infrastructure;n.dot11DefaultAuthAlgorithm=DOT11_AUTH_ALGO_RSNA_PSK;n.dot11DefaultCipherAlgorithm=DOT11_CIPHER_ALGO_CCMP;n.bSecurityEnabled=windows::core::BOOL(1);n.dot11Ssid.uSSIDLength=3;n.dot11Ssid.ucSSID[..3].copy_from_slice(b"A<&");
        let(_,xml)=profile_xml(&n,Some("test<&\"'123")).unwrap();assert!(xml.contains("<hex>413C26</hex>"));assert!(xml.contains("test&lt;&amp;&quot;&apos;123"));assert!(!xml.contains("test<&"));assert!(profile_xml(&n,Some("short")).is_err());assert!(profile_xml(&n,Some("long\ninvalid")).is_err());
        n.dot11DefaultAuthAlgorithm=DOT11_AUTH_ALGO_RSNA;assert!(profile_xml(&n,Some("test12345")).is_err());
    }
}
