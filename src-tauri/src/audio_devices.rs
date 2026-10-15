//! Endpoint selection and microphone controls. COM values remain on their worker.
//! The default setter is Windows' compatibility interface (also used by the mixer),
//! not a public Windows API. Every write is checked by reading Windows back.
use serde::{Deserialize, Serialize};
use windows::{core::{GUID, Interface, PCWSTR, PWSTR}, Win32::{Media::Audio::{*, Endpoints::IAudioEndpointVolume}, System::Com::*}};
static WRITE_LOCK:std::sync::Mutex<()>=std::sync::Mutex::new(());

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all="lowercase")]
pub enum Direction { Output, Input }
impl Direction { fn flow(self)->EDataFlow { match self { Self::Output=>eRender, Self::Input=>eCapture } } }

#[derive(Serialize)]
pub struct Device {
 pub id:String, pub name:String, pub default:bool, pub communications_default:bool,
 pub volume:Option<f32>, pub muted:Option<bool>, pub controllable:bool,
}
#[derive(Serialize)]
pub struct Snapshot { pub outputs:Vec<Device>, pub inputs:Vec<Device>, pub warning:Option<&'static str> }

struct Apartment;
impl Drop for Apartment { fn drop(&mut self) { unsafe { CoUninitialize(); } } }
fn apartment()->Result<Apartment,String> {
 unsafe { CoInitializeEx(None,COINIT_MULTITHREADED).ok().map_err(|_|"audio_unavailable".to_string())?; }
 Ok(Apartment)
}
fn valid_id(id:&str)->bool { !id.is_empty() && id.len()<=2048 && !id.contains('\0') }
fn valid_volume(value:f32)->bool { value.is_finite() && (0.0..=1.0).contains(&value) }
unsafe fn text(value:PWSTR)->String {
 let result=value.to_string().unwrap_or_default();CoTaskMemFree(Some(value.0.cast()));result
}
unsafe fn enumerator()->windows::core::Result<IMMDeviceEnumerator> { CoCreateInstance(&MMDeviceEnumerator,None,CLSCTX_ALL) }
unsafe fn default_id(en:&IMMDeviceEnumerator,flow:EDataFlow,role:ERole)->Option<String> {
 en.GetDefaultAudioEndpoint(flow,role).and_then(|d|d.GetId()).ok().map(|s|text(s))
}
unsafe fn name(device:&IMMDevice)->String {
 use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
 device.OpenPropertyStore(STGM_READ).and_then(|p|p.GetValue(&PKEY_Device_FriendlyName))
  .map(|v|v.to_string()).unwrap_or_default()
}
unsafe fn active_device(en:&IMMDeviceEnumerator,id:&str,direction:Direction)->Result<IMMDevice,String> {
 if !valid_id(id) { return Err("audio_invalid_device".into()); }
 let wide:Vec<u16>=id.encode_utf16().chain(Some(0)).collect();
 let device=en.GetDevice(PCWSTR(wide.as_ptr())).map_err(|_|"audio_device_disconnected".to_string())?;
 let endpoint:IMMEndpoint=device.cast().map_err(|_|"audio_invalid_device".to_string())?;
 if device.GetState().ok()!=Some(DEVICE_STATE_ACTIVE) || endpoint.GetDataFlow().ok()!=Some(direction.flow()) {
  return Err("audio_device_disconnected".into());
 }
 Ok(device)
}
unsafe fn devices(en:&IMMDeviceEnumerator,direction:Direction)->Result<Vec<Device>,String> {
 let default=default_id(en,direction.flow(),eMultimedia);
 let communications=default_id(en,direction.flow(),eCommunications);
 let collection=en.EnumAudioEndpoints(direction.flow(),DEVICE_STATE_ACTIVE).map_err(|_|"audio_unavailable".to_string())?;
 let mut result=Vec::new();
 for index in 0..collection.GetCount().map_err(|_|"audio_unavailable".to_string())? {
  let device=match collection.Item(index) { Ok(device)=>device,Err(_)=>continue };
  let id=match device.GetId() { Ok(id)=>text(id),Err(_)=>continue };
  let control=device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL,None).ok();
  let volume=control.as_ref().and_then(|c|c.GetMasterVolumeLevelScalar().ok()).filter(|v|valid_volume(*v));
  let muted=control.as_ref().and_then(|c|c.GetMute().ok()).map(|v|v.as_bool());
  result.push(Device { default:default.as_deref()==Some(id.as_str()),communications_default:communications.as_deref()==Some(id.as_str()),id,name:name(&device),volume,muted,controllable:volume.is_some()&&muted.is_some() });
 }
 result.sort_by(|a,b|b.default.cmp(&a.default).then_with(||a.name.to_lowercase().cmp(&b.name.to_lowercase())).then_with(||a.id.cmp(&b.id)));
 Ok(result)
}
unsafe fn snapshot(en:&IMMDeviceEnumerator)->Result<Snapshot,String> {
 let outputs=devices(en,Direction::Output)?;let inputs=devices(en,Direction::Input)?;
 let warning=outputs.iter().chain(inputs.iter()).any(|d|!d.controllable).then_some("audio_controls_unavailable");
 Ok(Snapshot {outputs,inputs,warning})
}
pub fn read_snapshot()->Result<Snapshot,String> {
 let _com=apartment()?;
 unsafe { let en=enumerator().map_err(|_|"audio_unavailable".to_string())?;snapshot(&en) }
}
#[tauri::command]
pub async fn audio_devices_snapshot()->Result<Snapshot,String> {
 tauri::async_runtime::spawn_blocking(read_snapshot).await.map_err(|_|"audio_unavailable".to_string())?
}

windows::core::define_interface!(EndpointPolicy, EndpointPolicyVtbl, 0xf8679f50_850a_41cf_9c72_430f290290c8);
#[repr(C)]
pub struct EndpointPolicyVtbl {
 base:windows::core::IUnknown_Vtbl,unused:[usize;10],
 set_default:unsafe extern "system" fn(*mut std::ffi::c_void,PCWSTR,ERole)->windows::core::HRESULT,
}
unsafe fn policy_set(policy:&EndpointPolicy,id:&str,role:ERole)->windows::core::Result<()> {
 let wide:Vec<u16>=id.encode_utf16().chain(Some(0)).collect();
 (policy.vtable().set_default)(policy.as_raw(),PCWSTR(wide.as_ptr()),role).ok()
}
unsafe fn restore_roles(en:&IMMDeviceEnumerator,flow:EDataFlow,policy:&EndpointPolicy,roles:&[ERole],previous:&[Option<String>])->bool {
 let mut restored=true;
 for (role,id) in roles.iter().zip(previous) {
  // A missing former default cannot be reconstructed. Be explicit rather than
  // silently reporting a rollback that did not happen.
  restored &= id.as_ref().is_some_and(|id|policy_set(policy,id,*role).is_ok()&&default_id(en,flow,*role).as_deref()==Some(id.as_str()));
 }
 restored
}
#[tauri::command]
pub async fn audio_device_default(device_id:String,kind:Direction,communications:Option<bool>)->Result<Snapshot,String> {
 if !valid_id(&device_id) { return Err("audio_invalid_device".into()); }
 tauri::async_runtime::spawn_blocking(move||{
  let _write=WRITE_LOCK.lock().map_err(|_|"audio_update_failed".to_string())?;
  let _com=apartment()?;
  unsafe {
   let en=enumerator().map_err(|_|"audio_unavailable".to_string())?;
   let _device=active_device(&en,&device_id,kind)?;
   let policy:EndpointPolicy=CoCreateInstance(&GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9),None,CLSCTX_ALL).map_err(|_|"audio_default_unavailable".to_string())?;
   let mut roles=vec![eConsole,eMultimedia];if communications.unwrap_or(false) { roles.push(eCommunications); }
   let previous:Vec<_>=roles.iter().map(|role|default_id(&en,kind.flow(),*role)).collect();
   for (index,role) in roles.iter().enumerate() {
    if policy_set(&policy,&device_id,*role).is_err() {
     let restored=restore_roles(&en,kind.flow(),&policy,&roles[..=index],&previous[..=index]);
     return Err(if restored {"audio_default_unconfirmed"} else {"audio_default_partial"}.into());
    }
   }
   if roles.iter().any(|role|default_id(&en,kind.flow(),*role).as_deref()!=Some(device_id.as_str())) {
    let restored=restore_roles(&en,kind.flow(),&policy,&roles,&previous);
    return Err(if restored {"audio_default_unconfirmed"} else {"audio_default_partial"}.into());
   }
   snapshot(&en)
  }
 }).await.map_err(|_|"audio_unavailable".to_string())?
}
#[tauri::command]
pub async fn audio_device_set(device_id:String,kind:Direction,volume:Option<f32>,muted:Option<bool>)->Result<Snapshot,String> {
 if !valid_id(&device_id) || volume.is_some_and(|v|!valid_volume(v)) || (volume.is_none()&&muted.is_none()) {
  return Err("audio_invalid_value".into());
 }
 tauri::async_runtime::spawn_blocking(move||{
  let _write=WRITE_LOCK.lock().map_err(|_|"audio_update_failed".to_string())?;
  let _com=apartment()?;
  unsafe {
   let en=enumerator().map_err(|_|"audio_unavailable".to_string())?;
   let device=active_device(&en,&device_id,kind)?;
   let control:IAudioEndpointVolume=device.Activate(CLSCTX_ALL,None).map_err(|_|"audio_controls_unavailable".to_string())?;
   if let Some(value)=volume { control.SetMasterVolumeLevelScalar(value,std::ptr::null()).map_err(|_|"audio_update_failed".to_string())?; }
   if let Some(value)=muted { control.SetMute(value,std::ptr::null()).map_err(|_|"audio_update_failed".to_string())?; }
   let actual_volume=control.GetMasterVolumeLevelScalar().map_err(|_|"audio_readback_failed".to_string())?;
   let actual_muted=control.GetMute().map_err(|_|"audio_readback_failed".to_string())?.as_bool();
   if !valid_volume(actual_volume) || volume.is_some_and(|v|(v-actual_volume).abs()>0.015) || muted.is_some_and(|v|v!=actual_muted) {
    return Err("audio_readback_failed".into());
   }
   snapshot(&en)
  }
 }).await.map_err(|_|"audio_unavailable".to_string())?
}

#[cfg(test)]
mod tests {
 use super::*;
 #[test]fn validates_ids(){assert!(valid_id("{0.0.1.00000000}.{endpoint}"));assert!(!valid_id(""));assert!(!valid_id("bad\0id"));assert!(!valid_id(&"x".repeat(2049)));}
 #[test]fn validates_volume(){for v in [0.0,0.5,1.0]{assert!(valid_volume(v));}for v in [-0.1,1.01,f32::NAN,f32::INFINITY,f32::NEG_INFINITY]{assert!(!valid_volume(v));}}
 #[test]fn maps_only_allowed_directions(){assert!(matches!(serde_json::from_str::<Direction>("\"input\"").unwrap(),Direction::Input));assert!(serde_json::from_str::<Direction>("\"invalid\"").is_err());}
}
