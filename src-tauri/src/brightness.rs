//! Brightness belongs to one actual display. Prefer the active internal panel,
//! otherwise the primary display's first readable DDC/CI panel. Never fan out.
use serde::{Deserialize,Serialize};
use std::sync::{Mutex,atomic::Ordering};
use tauri::{AppHandle,Emitter};
use wmi::{COMLibrary,WMIConnection};
use crate::state::{BRIGHTNESS_AVAILABLE,CURRENT_BRIGHTNESS,LAST_BRIGHTNESS_CHANGE};
static HARDWARE:Mutex<()> = Mutex::new(());
static TARGET:std::sync::atomic::AtomicU8=std::sync::atomic::AtomicU8::new(0);
pub fn target()->Option<&'static str>{match TARGET.load(Ordering::Relaxed){1=>Some("internal"),2=>Some("primary-ddc"),_=>None}}
#[derive(Deserialize)]
#[serde(rename="WmiMonitorBrightness",rename_all="PascalCase")]
struct Internal {instance_name:String,current_brightness:u8,active:bool,#[serde(default)]level:Vec<u8>}
#[derive(Deserialize)]
#[serde(rename="WmiMonitorBrightnessMethods",rename_all="PascalCase")]
struct Methods {instance_name:String,#[serde(rename="__PATH")]path:String}
#[derive(Serialize)]
#[serde(rename_all="PascalCase")]
// WMI CIM_UINT32 uses a VT_I4 Automation value. Rust u32 would produce VT_UI4,
// which IWbemClassObject::Put rejects on the brightness method signature.
struct Input {timeout:i32,brightness:u8}
#[derive(Deserialize)]
#[serde(rename_all="PascalCase")]
struct Output {#[serde(default)] return_value:Option<u32>}
fn connection()->Option<WMIConnection>{WMIConnection::with_namespace_path("root\\WMI",COMLibrary::new().ok()?).ok()}
fn internal(con:&WMIConnection)->Option<Internal>{con.query::<Internal>().ok()?.into_iter().find(|p|p.active)}
pub(crate) fn percent_from_raw(value:u32,min:u32,max:u32)->Option<u32>{if max<=min{return None}Some((((value.clamp(min,max)-min) as u64*100+(max-min) as u64/2)/(max-min) as u64) as u32)}
pub(crate) fn raw_from_percent(value:u32,min:u32,max:u32)->Option<u32>{if max<=min{return None}Some(min+(((max-min) as u64*value.min(100) as u64+50)/100) as u32)}
fn supported_internal(value:u32,levels:&[u8])->u32{levels.iter().copied().filter(|v|*v<=100).min_by_key(|v|(*v as u32).abs_diff(value.min(100))).map(u32::from).unwrap_or(value.min(100))}
#[repr(C)]#[derive(Clone,Copy)]
struct Physical {handle:usize,description:[u16;128]}
#[link(name="dxva2")]
extern "system" {
 fn GetNumberOfPhysicalMonitorsFromHMONITOR(monitor:windows::Win32::Graphics::Gdi::HMONITOR,count:*mut u32)->windows::core::BOOL;
 fn GetPhysicalMonitorsFromHMONITOR(monitor:windows::Win32::Graphics::Gdi::HMONITOR,count:u32,items:*mut Physical)->windows::core::BOOL;
 fn DestroyPhysicalMonitors(count:u32,items:*const Physical)->windows::core::BOOL;
 fn GetMonitorBrightness(monitor:usize,min:*mut u32,current:*mut u32,max:*mut u32)->windows::core::BOOL;
 fn SetMonitorBrightness(monitor:usize,value:u32)->windows::core::BOOL;
}
struct Panels(Vec<Physical>);
impl Drop for Panels{fn drop(&mut self){unsafe{let _=DestroyPhysicalMonitors(self.0.len() as u32,self.0.as_ptr());}}}
fn primary_panels()->Option<Panels>{unsafe{
 use windows::Win32::Graphics::Gdi::*;
 use windows::Win32::Foundation::{RECT,LPARAM};
 unsafe extern "system" fn collect(m:HMONITOR,_:HDC,_:*mut RECT,data:LPARAM)->windows::core::BOOL{
  let mut info=MONITORINFO{cbSize:std::mem::size_of::<MONITORINFO>() as u32,..Default::default()};
  if GetMonitorInfoW(m,&mut info).as_bool()&&info.dwFlags&1!=0{*(data.0 as *mut HMONITOR)=m;return false.into()}true.into()
 }
 let mut primary=HMONITOR::default();let _=EnumDisplayMonitors(None,None,Some(collect),LPARAM(&mut primary as *mut _ as isize));
 if primary.0.is_null(){return None}let mut count=0;
 if !GetNumberOfPhysicalMonitorsFromHMONITOR(primary,&mut count).as_bool()||count==0||count>32{return None}
 let mut items=vec![Physical{handle:0,description:[0;128]};count as usize];
 if !GetPhysicalMonitorsFromHMONITOR(primary,count,items.as_mut_ptr()).as_bool(){return None}Some(Panels(items))
}}
fn external(panels:&Panels)->Option<(usize,u32,u32,u32)>{unsafe{panels.0.iter().find_map(|p|{let(mut min,mut value,mut max)=(0,0,0);(p.handle!=0&&GetMonitorBrightness(p.handle,&mut min,&mut value,&mut max).as_bool()&&max>min).then_some((p.handle,min,value,max))})}}
fn read_unlocked()->Option<u32>{
 if let Some(p)=connection().as_ref().and_then(internal){TARGET.store(1,Ordering::Relaxed);return Some((p.current_brightness as u32).min(100))}
 let panels=primary_panels()?;let(_,min,value,max)=external(&panels)?;TARGET.store(2,Ordering::Relaxed);percent_from_raw(value,min,max)
}
pub fn read()->Option<u32>{let _guard=HARDWARE.lock().unwrap_or_else(|e|e.into_inner());let value=read_unlocked();BRIGHTNESS_AVAILABLE.store(value.is_some(),Ordering::Relaxed);if let Some(v)=value{CURRENT_BRIGHTNESS.store(v,Ordering::Relaxed);}else{TARGET.store(0,Ordering::Relaxed);}value}
pub fn set_and_read(value:u32)->Result<u32,String>{
 let _guard=HARDWARE.lock().unwrap_or_else(|e|e.into_inner());let value=value.min(100);
 if let Some(con)=connection(){if let Some(p)=internal(&con){
  let value=supported_internal(value,&p.level);
  let methods=con.query::<Methods>().map_err(|e|format!("Не удалось прочитать регулятор встроенного экрана: {e}"))?.into_iter().find(|m|m.instance_name==p.instance_name).ok_or("Регулятор встроенного экрана недоступен")?;
  // Some drivers declare this method void. Successful ExecMethod returns no
  // output object; the hardware readback below remains the success criterion.
  let out:Option<Output>=con.exec_instance_method::<Methods,_,_>("WmiSetBrightness",methods.path,Input{timeout:0,brightness:value as u8}).map_err(|e|{
   crate::diagnostics::record(&format!("brightness WmiSetBrightness: {e:?}"));
   format!("Windows не удалось изменить яркость встроенного экрана: {e}")
  })?;
  if out.and_then(|out|out.return_value).unwrap_or(0)!=0{return Err("Драйвер экрана отклонил изменение яркости".into())}
  for _ in 0..4{std::thread::sleep(std::time::Duration::from_millis(75));if let Some(actual)=internal(&con){if actual.current_brightness as u32==value{return Ok(actual.current_brightness as u32)}}}
  return Err("Драйвер не подтвердил заданную яркость. Значение обновлено с экрана".into());
 }}
 let panels=primary_panels().ok_or("Экран не поддерживает управление яркостью")?;
 let(handle,min,_,max)=external(&panels).ok_or("DDC/CI регулятор основного экрана недоступен")?;
 let raw=raw_from_percent(value,min,max).ok_or("Некорректный диапазон яркости экрана")?;
 unsafe{if !SetMonitorBrightness(handle,raw).as_bool(){return Err("Экран отклонил изменение яркости. Проверьте DDC/CI в меню монитора".into())}}
 for _ in 0..4{std::thread::sleep(std::time::Duration::from_millis(75));let(mut lo,mut actual,mut hi)=(0,0,0);unsafe{if GetMonitorBrightness(handle,&mut lo,&mut actual,&mut hi).as_bool()&&actual.abs_diff(raw)<=1{if let Some(p)=percent_from_raw(actual,lo,hi){return Ok(p)}}}}
 Err("Монитор не подтвердил изменение яркости".into())
}
pub fn publish(app:&AppHandle,value:u32){BRIGHTNESS_AVAILABLE.store(true,Ordering::Relaxed);CURRENT_BRIGHTNESS.store(value,Ordering::Relaxed);LAST_BRIGHTNESS_CHANGE.store(crate::utils::get_now_ms(),Ordering::Relaxed);let _=app.emit("brightness-change",crate::types::BrightnessChangeEvent{brightness:value});}
pub fn setup_worker(){
 let(tx,rx)=std::sync::mpsc::channel();let _=crate::state::BRIGHTNESS_SENDER.set(tx);
 std::thread::spawn(move||{
  while let Ok(mut requested)=rx.recv(){
   while let Ok(next)=rx.try_recv(){requested=next;}
   let result=set_and_read(requested);
   if let Some(app)=crate::state::DISPLAY_MONITOR_HANDLE.get(){
    match result{Ok(actual)=>publish(app,actual),Err(e)=>{
     crate::diagnostics::record(&format!("brightness: {e}"));
     if let Some(actual)=read(){publish(app,actual)}
    }}
   }
  }
 });
 std::thread::spawn(||{let mut previous=None;loop{let value=read();if value!=previous{if let(Some(app),Some(actual))=(crate::state::DISPLAY_MONITOR_HANDLE.get(),value){publish(app,actual)}previous=value;}std::thread::sleep(std::time::Duration::from_secs(2));}});
}
#[cfg(test)]mod tests{use super::*;
 #[test]fn wmi_method_uses_cim_automation_parameter_types(){
  let params=Input{timeout:0,brightness:51}.serialize(wmi::ser::variant_ser::VariantStructSerializer::new()).unwrap();
  assert_eq!(params.get("Timeout"),Some(&wmi::Variant::I4(0)));
  assert_eq!(params.get("Brightness"),Some(&wmi::Variant::UI1(51)));
 }
 #[test]fn normalizes_nonstandard_ddc_ranges(){assert_eq!(percent_from_raw(75,50,150),Some(25));assert_eq!(raw_from_percent(25,50,150),Some(75));assert_eq!(raw_from_percent(100,20,80),Some(80));}
 #[test]fn invalid_ranges_are_unavailable_and_inputs_clamp(){assert_eq!(percent_from_raw(40,50,50),None);assert_eq!(raw_from_percent(30,50,20),None);assert_eq!(percent_from_raw(900,20,80),Some(100));assert_eq!(raw_from_percent(500,20,80),Some(80));}
 #[test]fn internal_driver_steps_use_an_actual_supported_level(){assert_eq!(supported_internal(37,&[0,20,40,60,80,100]),40);assert_eq!(supported_internal(37,&[]),37);assert_eq!(supported_internal(200,&[0,50,100,255]),100);}
}
