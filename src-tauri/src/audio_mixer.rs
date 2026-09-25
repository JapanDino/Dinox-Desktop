//! Core Audio controls. COM objects never leave their initialized worker thread.
use serde::Serialize;
use windows::{core::{Interface, PWSTR, PCWSTR, GUID}, Win32::{Media::Audio::*, Media::Audio::Endpoints::IAudioEndpointVolume, System::Com::*}};

#[derive(Serialize)]
pub struct Session { id:String, name:String, volume:f32, muted:bool }
#[derive(Serialize)]
pub struct Device { id:String, name:String, default:bool, volume:f32, muted:bool, sessions:Vec<Session> }
struct Apartment;
impl Drop for Apartment {fn drop(&mut self){unsafe{CoUninitialize();}}}
fn apartment()->Result<Apartment,String>{unsafe{CoInitializeEx(None,COINIT_MULTITHREADED).ok().map_err(|e|e.to_string())?;}Ok(Apartment)}
unsafe fn owned_text(value:PWSTR)->String{let text=value.to_string().unwrap_or_default();CoTaskMemFree(Some(value.0.cast()));text}
unsafe fn enumerator()->windows::core::Result<IMMDeviceEnumerator>{CoCreateInstance(&MMDeviceEnumerator,None,CLSCTX_ALL)}
unsafe fn device_name(device:&IMMDevice)->String{
 use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
 use windows::Win32::System::Com::STGM_READ;
 device.OpenPropertyStore(STGM_READ).and_then(|p|p.GetValue(&PKEY_Device_FriendlyName)).map(|v|v.to_string()).unwrap_or_else(|_|"Audio".into())
}
unsafe fn sessions(device:&IMMDevice)->windows::core::Result<Vec<(String,IAudioSessionControl2,ISimpleAudioVolume)>>{
 let manager:IAudioSessionManager2=device.Activate(CLSCTX_ALL,None)?;
 let list=manager.GetSessionEnumerator()?;
 let mut result=Vec::new();
 for i in 0..list.GetCount()? {
  if let Ok(control)=list.GetSession(i).and_then(|s|s.cast::<IAudioSessionControl2>()){
   if control.GetState().ok()==Some(AudioSessionStateExpired){continue;}
   if let (Ok(id),Ok(volume))=(control.GetSessionInstanceIdentifier(),control.cast::<ISimpleAudioVolume>()){
    result.push((owned_text(id),control,volume));
   }
  }
 }
 Ok(result)
}
unsafe fn session_name(control:&IAudioSessionControl2)->String{
 let display=control.GetDisplayName().map(|s|owned_text(s)).unwrap_or_default();
 if !display.is_empty()&&!display.starts_with('@'){return display;}
 let pid=control.GetProcessId().unwrap_or(0);
 if pid==0{return "System sounds".into();}
 use windows::Win32::{System::Threading::*,Foundation::CloseHandle};
 if let Ok(handle)=OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION,false,pid){
  let mut buffer=[0u16;32768];let mut length=buffer.len() as u32;
  let ok=QueryFullProcessImageNameW(handle,PROCESS_NAME_WIN32,PWSTR(buffer.as_mut_ptr()),&mut length).is_ok();
  let _=CloseHandle(handle);
  if ok{let path=String::from_utf16_lossy(&buffer[..length as usize]);return std::path::Path::new(&path).file_stem().map(|p|p.to_string_lossy().into_owned()).unwrap_or(path);}
 }
 format!("App {pid}")
}
pub fn read_snapshot()->Result<Vec<Device>,String>{
 let _com=apartment()?;
 unsafe{
  let en=enumerator().map_err(|e|e.to_string())?;
  let default=en.GetDefaultAudioEndpoint(eRender,eMultimedia).and_then(|d|d.GetId()).map(|p|owned_text(p)).unwrap_or_default();
  let devices=en.EnumAudioEndpoints(eRender,DEVICE_STATE_ACTIVE).map_err(|e|e.to_string())?;
  let mut result=Vec::new();
  for i in 0..devices.GetCount().unwrap_or(0){
   let device=devices.Item(i).map_err(|e|e.to_string())?;
   let id=owned_text(device.GetId().map_err(|e|e.to_string())?);
   let endpoint:IAudioEndpointVolume=match device.Activate(CLSCTX_ALL,None){Ok(e)=>e,Err(_)=>continue};
   let rows=sessions(&device).unwrap_or_default().into_iter().filter_map(|(id,control,volume)|Some(Session{id,name:session_name(&control),volume:volume.GetMasterVolume().ok()?,muted:volume.GetMute().ok()?.as_bool()})).collect();
   result.push(Device{default:id==default,id,name:device_name(&device),volume:endpoint.GetMasterVolumeLevelScalar().unwrap_or(0.0),muted:endpoint.GetMute().map(|v|v.as_bool()).unwrap_or(false),sessions:rows});
  }
  Ok(result)
 }
}
#[tauri::command]
pub async fn mixer_snapshot()->Result<Vec<Device>,String>{tauri::async_runtime::spawn_blocking(read_snapshot).await.map_err(|e|e.to_string())?}
#[tauri::command]
pub async fn mixer_set(device_id:String,session_id:Option<String>,volume:Option<f32>,muted:Option<bool>)->Result<(),String>{
 if volume.is_some_and(|v|!v.is_finite()||!(0.0..=1.0).contains(&v)){return Err("Invalid volume".into());}
 tauri::async_runtime::spawn_blocking(move||{
  let _com=apartment()?;
  let operation=||->windows::core::Result<()>{unsafe{
   let id:Vec<u16>=device_id.encode_utf16().chain(Some(0)).collect();
   let device=enumerator()?.GetDevice(PCWSTR(id.as_ptr()))?;
   if let Some(session_id)=session_id{
    let (_,_,control)=sessions(&device)?.into_iter().find(|(id,_,_)|id==&session_id).ok_or_else(||windows::core::Error::from_hresult(windows::core::HRESULT(0x80070490u32 as i32)))?;
    if let Some(v)=volume{control.SetMasterVolume(v,std::ptr::null())?;}
    if let Some(v)=muted{control.SetMute(v,std::ptr::null())?;}
   }else{
    let control:IAudioEndpointVolume=device.Activate(CLSCTX_ALL,None)?;
    if let Some(v)=volume{control.SetMasterVolumeLevelScalar(v,std::ptr::null())?;}
    if let Some(v)=muted{control.SetMute(v,std::ptr::null())?;}
   }
   Ok(())
  }};
  operation().map_err(|e|e.to_string())
 }).await.map_err(|e|e.to_string())?
}

// Windows has no public default-endpoint setter. Keep this Windows-only COM
// compatibility interface isolated; propagate failure and verify read-back.
windows::core::define_interface!(PolicyConfig, PolicyConfigVtbl, 0xf8679f50_850a_41cf_9c72_430f290290c8);
#[repr(C)]
pub struct PolicyConfigVtbl { base:windows::core::IUnknown_Vtbl, unused:[usize;10], set_default:unsafe extern "system" fn(*mut std::ffi::c_void,PCWSTR,ERole)->windows::core::HRESULT }
#[tauri::command]
pub async fn mixer_default_device(device_id:String)->Result<(),String>{
 tauri::async_runtime::spawn_blocking(move||{
  let _com=apartment()?;
  unsafe{
   let id:Vec<u16>=device_id.encode_utf16().chain(Some(0)).collect();
   let en=enumerator().map_err(|e|e.to_string())?;
   let device=en.GetDevice(PCWSTR(id.as_ptr())).map_err(|e|e.to_string())?;
   if device.GetState().ok()!=Some(DEVICE_STATE_ACTIVE){return Err("Audio device is unavailable".into());}
   let policy:PolicyConfig=CoCreateInstance(&GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9),None,CLSCTX_ALL).map_err(|e|e.to_string())?;
   // Preserve communications preferences and roll back if one role fails.
   let previous=[eConsole,eMultimedia].map(|role|en.GetDefaultAudioEndpoint(eRender,role).and_then(|d|d.GetId()).map(|p|owned_text(p)).ok());
   for (i,role) in [eConsole,eMultimedia].into_iter().enumerate(){
    if let Err(error)=(policy.vtable().set_default)(policy.as_raw(),PCWSTR(id.as_ptr()),role).ok(){
     for (old,old_role) in previous.iter().zip([eConsole,eMultimedia]).take(i){if let Some(old)=old{let old:Vec<u16>=old.encode_utf16().chain(Some(0)).collect();let _=(policy.vtable().set_default)(policy.as_raw(),PCWSTR(old.as_ptr()),old_role);}}
     return Err(error.to_string());
    }
   }
   let actual=en.GetDefaultAudioEndpoint(eRender,eMultimedia).and_then(|d|d.GetId()).map(|p|owned_text(p)).map_err(|e|e.to_string())?;
   if actual!=device_id{return Err("Windows did not confirm the output device".into());}
   Ok(())
  }
 }).await.map_err(|e|e.to_string())?
}
