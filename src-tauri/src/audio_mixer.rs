//! Core Audio controls. COM objects never leave their initialized worker thread.
use serde::Serialize;
use windows::{core::{Interface, PWSTR, PCWSTR, GUID}, Win32::{Media::Audio::*, Media::Audio::Endpoints::IAudioEndpointVolume, System::Com::*}};
mod routing;

#[derive(Serialize)]
pub struct Session { id:String, name:String, volume:f32, muted:bool, process_id:u32, process_started_at:Option<String>, route_supported:bool, route_device_id:Option<String>, route_error:Option<String> }
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
struct ProcessIdentity { handle: windows::Win32::Foundation::HANDLE, started_at: String }
impl Drop for ProcessIdentity { fn drop(&mut self) { unsafe { let _=windows::Win32::Foundation::CloseHandle(self.handle); } } }
fn process_identity(pid:u32)->Result<ProcessIdentity,String>{
 use windows::Win32::{Foundation::FILETIME,System::Threading::{OpenProcess,GetProcessTimes,GetExitCodeProcess,PROCESS_QUERY_LIMITED_INFORMATION}};
 if pid==0{return Err("System sounds cannot be routed separately".into());}
 unsafe {
  let handle=OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION,false,pid).map_err(|_|"The audio app is no longer available".to_string())?;
  let mut identity=ProcessIdentity{handle,started_at:String::new()};
  let mut creation=FILETIME::default();let mut exit=FILETIME::default();let mut kernel=FILETIME::default();let mut user=FILETIME::default();
  GetProcessTimes(handle,&mut creation,&mut exit,&mut kernel,&mut user).map_err(|_|"Could not verify the audio app identity".to_string())?;
  let mut code=0;GetExitCodeProcess(handle,&mut code).map_err(|_|"Could not verify the audio app state".to_string())?;
  if code!=259{return Err("The audio app has closed".into());}
  identity.started_at=format!("{}",((creation.dwHighDateTime as u64)<<32)|creation.dwLowDateTime as u64);
  Ok(identity)
 }
}
unsafe fn routable_pid(control:&IAudioSessionControl2)->Result<u32,String>{
 // Preserve the HRESULT: GetProcessId's generated wrapper also accepts
 // AUDCLNT_S_NO_SINGLE_PROCESS, which is unsafe to treat as a single app.
 if control.IsSystemSoundsSession()!=windows::core::HRESULT(1){return Err("System sounds or an unavailable audio session cannot be routed".into());}
 let mut pid=0;let result=(control.vtable().GetProcessId)(control.as_raw(),&mut pid);
 if result!=windows::core::HRESULT(0)||pid==0{return Err("This audio session does not belong to a single available app".into());}
 Ok(pid)
}
pub fn read_snapshot()->Result<Vec<Device>,String>{
 let _com=apartment()?;
 let route=routing::Routing::new();
 unsafe{
  let en=enumerator().map_err(|e|e.to_string())?;
  let default=en.GetDefaultAudioEndpoint(eRender,eMultimedia).and_then(|d|d.GetId()).map(|p|owned_text(p)).unwrap_or_default();
  let devices=en.EnumAudioEndpoints(eRender,DEVICE_STATE_ACTIVE).map_err(|e|e.to_string())?;
  let mut result=Vec::new();
  for i in 0..devices.GetCount().unwrap_or(0){
   let device=devices.Item(i).map_err(|e|e.to_string())?;
   let id=owned_text(device.GetId().map_err(|e|e.to_string())?);
   let endpoint:IAudioEndpointVolume=match device.Activate(CLSCTX_ALL,None){Ok(e)=>e,Err(_)=>continue};
   let rows=sessions(&device).unwrap_or_default().into_iter().filter_map(|(id,control,volume)|{
    let pid=control.GetProcessId().unwrap_or(0);
    let identity=routable_pid(&control).and_then(process_identity);
    let preference=identity.as_ref().map_err(|e|e.clone()).and_then(|_|route.as_ref().map_err(|e|e.clone()).and_then(|r|r.preference(pid)));
    Some(Session{id,name:session_name(&control),volume:volume.GetMasterVolume().ok()?,muted:volume.GetMute().ok()?.as_bool(),process_id:pid,process_started_at:identity.ok().map(|p|p.started_at.clone()),route_supported:preference.is_ok(),route_device_id:preference.as_ref().ok().cloned().flatten(),route_error:preference.err()})
   }).collect();
   result.push(Device{default:id==default,id,name:device_name(&device),volume:endpoint.GetMasterVolumeLevelScalar().unwrap_or(0.0),muted:endpoint.GetMute().map(|v|v.as_bool()).unwrap_or(false),sessions:rows});
  }
  Ok(result)
 }
}

pub fn set_default_volume(value:f32)->Result<f32,String>{
 if !value.is_finite()||!(0.0..=1.0).contains(&value){return Err("Invalid volume".into())}
 let _com=apartment()?;
 unsafe{
  let device=enumerator().and_then(|e|e.GetDefaultAudioEndpoint(eRender,eMultimedia)).map_err(|e|e.to_string())?;
  let endpoint:IAudioEndpointVolume=device.Activate(CLSCTX_ALL,None).map_err(|e|e.to_string())?;
  endpoint.SetMasterVolumeLevelScalar(value,std::ptr::null()).map_err(|e|e.to_string())?;
  if value>0.0{endpoint.SetMute(false,std::ptr::null()).map_err(|e|e.to_string())?;}
  endpoint.GetMasterVolumeLevelScalar().map_err(|e|e.to_string())
 }
}

/// Opt-in compatibility check for an isolated, renamed test executable only.
/// Changes no other application's routing and restores its own empty preference.
pub fn probe_own_routing()->serde_json::Value {
 use serde_json::json;
 let isolated=std::env::current_exe().ok().and_then(|p|p.file_stem().map(|s|s.to_string_lossy().into_owned())).is_some_and(|s|s.starts_with("DinoxAudioCheck-"));
 if !isolated{return json!({"state":"refused","reason":"Use an isolated DinoxAudioCheck executable"})}
 let result=(||->Result<serde_json::Value,String>{
  let _com=apartment()?;
  // AudioPolicyConfig resolves an application's identity through an audio
  // session. A process without a session is not a valid compatibility probe.
  let client:IAudioClient=unsafe{
   let device=enumerator().and_then(|e|e.GetDefaultAudioEndpoint(eRender,eMultimedia)).map_err(|e|e.to_string())?;
   let client:IAudioClient=device.Activate(CLSCTX_ALL,None).map_err(|e|e.to_string())?;
   let format=client.GetMixFormat().map_err(|e|e.to_string())?;
   let initialized=client.Initialize(AUDCLNT_SHAREMODE_SHARED,AUDCLNT_STREAMFLAGS_NOPERSIST,1_000_000,0,format,None);
   CoTaskMemFree(Some(format.cast()));
   initialized.map_err(|e|e.to_string())?;
   let render:IAudioRenderClient=client.GetService().map_err(|e|e.to_string())?;
   let frames=client.GetBufferSize().map_err(|e|e.to_string())?;
   let _=render.GetBuffer(frames).map_err(|e|e.to_string())?;
   render.ReleaseBuffer(frames,AUDCLNT_BUFFERFLAGS_SILENT.0 as u32).map_err(|e|e.to_string())?;
   client.Start().map_err(|e|e.to_string())?;
   client
  };
  struct Stop(IAudioClient);
  impl Drop for Stop{fn drop(&mut self){unsafe{let _=self.0.Stop();}}}
  let _stream=Stop(client);
  std::thread::sleep(std::time::Duration::from_millis(120));
  let policy=routing::Routing::new()?;
  let pid=std::process::id();
  if policy.get(pid,eConsole)?.is_some()||policy.get(pid,eMultimedia)?.is_some(){return Err("Isolated process already has an output preference; left unchanged".into())}
  let devices=read_snapshot()?;
  let target=devices.iter().find(|d|d.default).ok_or("No active default output")?.id.clone();
  struct Restore<'a>{policy:&'a routing::Routing,pid:u32}
  impl Drop for Restore<'_>{fn drop(&mut self){let _=self.policy.apply(self.pid,None);}}
  let restore=Restore{policy:&policy,pid};
  policy.apply(pid,Some(&target))?;
  let confirmed=policy.get(pid,eConsole)?.as_deref()==Some(target.as_str())&&policy.get(pid,eMultimedia)?.as_deref()==Some(target.as_str());
  policy.apply(pid,None)?;
  let restored=policy.get(pid,eConsole)?.is_none()&&policy.get(pid,eMultimedia)?.is_none();
  if restored{std::mem::forget(restore)}
  Ok(json!({"state":"checked","preferenceConfirmed":confirmed,"ownPreferenceRestored":restored,"activeOutputs":devices.len(),"otherAppsChanged":false,"liveStreamTransferTested":false}))
 })();
 result.unwrap_or_else(|e|json!({"state":"unavailable","error":e}))
}

#[derive(Serialize)]
pub struct RouteResult { state:&'static str, device_id:Option<String>, stream_on_target:bool, process_id:u32 }
#[tauri::command]
pub async fn mixer_route_app(source_device_id:String,session_id:String,process_id:u32,process_started_at:String,target_device_id:Option<String>)->Result<RouteResult,String>{
 if process_id==0||process_started_at.is_empty()||session_id.is_empty(){return Err("The audio app identity is unavailable".into());}
 if source_device_id.is_empty()||source_device_id.contains('\0')||source_device_id.len()>2048||session_id.contains('\0')||session_id.len()>4096{return Err("Invalid audio session".into());}
 if target_device_id.as_ref().is_some_and(|id|id.is_empty()||id.contains('\0')||id.len()>2048){return Err("Invalid output device".into());}
 tauri::async_runtime::spawn_blocking(move||{
  let _com=apartment()?;
  let identity=process_identity(process_id)?;
  if identity.started_at!=process_started_at{return Err("The audio app has restarted. Refresh the mixer before changing its output".into());}
  unsafe {
   let en=enumerator().map_err(|e|e.to_string())?;
   let source:Vec<u16>=source_device_id.encode_utf16().chain(Some(0)).collect();
   let device=en.GetDevice(PCWSTR(source.as_ptr())).map_err(|_|"The source audio device is unavailable".to_string())?;
   let (_,control,_)=sessions(&device).map_err(|e|e.to_string())?.into_iter().find(|(id,_,_)|id==&session_id).ok_or("The audio session has ended. Refresh the mixer")?;
   if routable_pid(&control)?!=process_id{return Err("The selected audio session cannot be routed".into());}
   let target=if let Some(ref id)=target_device_id {
    let wide:Vec<u16>=id.encode_utf16().chain(Some(0)).collect();en.GetDevice(PCWSTR(wide.as_ptr())).map_err(|_|"The selected output device is unavailable".to_string())?
   }else{en.GetDefaultAudioEndpoint(eRender,eMultimedia).map_err(|_|"Windows has no default output device".to_string())?};
   if target.GetState().ok()!=Some(DEVICE_STATE_ACTIVE){return Err("The selected output device has disconnected".into());}
   let routing=routing::Routing::new()?;
   // Hold the process handle throughout the operation; never route a reused PID.
   let current=process_identity(process_id)?;
   if current.started_at!=identity.started_at{return Err("The audio app has restarted".into());}
   routing.apply(process_id,target_device_id.as_deref())?;
   let stream_on_target=sessions(&target).unwrap_or_default().iter().any(|(_,s,_)|s.GetProcessId().ok()==Some(process_id)&&s.GetState().ok()==Some(AudioSessionStateActive));
   Ok(RouteResult{state:"preference_confirmed",device_id:target_device_id,stream_on_target,process_id})
  }
 }).await.map_err(|e|e.to_string())?
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
