//! Explicit input-language selection for the last external foreground window.
use serde::Serialize;
use std::sync::Mutex;
use windows::Win32::{Foundation::{HWND,LPARAM,WPARAM},UI::{Input::KeyboardAndMouse::*,WindowsAndMessaging::*}};

#[derive(Clone,Copy)]
struct Target { hwnd:isize,pid:u32,thread:u32 }
static LAST:Mutex<Option<Target>>=Mutex::new(None);
fn external(hwnd:HWND)->Option<Target>{unsafe{
    if hwnd.0.is_null()||!IsWindow(Some(hwnd)).as_bool()||!IsWindowVisible(hwnd).as_bool(){return None}
    let mut pid=0;let thread=GetWindowThreadProcessId(hwnd,Some(&mut pid));
    if pid==0||thread==0||pid==std::process::id()||GetWindowLongW(hwnd,GWL_EXSTYLE) as u32&WS_EX_TOOLWINDOW.0!=0{return None}
    let mut class=[0u16;96];let len=GetClassNameW(hwnd,&mut class);
    if matches!(String::from_utf16_lossy(&class[..len.max(0) as usize]).as_str(),"Shell_TrayWnd"|"Shell_SecondaryTrayWnd"|"Progman"|"WorkerW"){return None}
    Some(Target{hwnd:hwnd.0 as isize,pid,thread})
}}
pub fn remember(hwnd:HWND){if let Some(target)=external(hwnd){*LAST.lock().unwrap_or_else(|e|e.into_inner())=Some(target);}}
fn target()->Option<Target>{
    remember(unsafe{GetForegroundWindow()});
    let saved=*LAST.lock().unwrap_or_else(|e|e.into_inner());
    saved.filter(|s|external(HWND(s.hwnd as *mut _)).is_some_and(|v|v.pid==s.pid&&v.thread==s.thread))
}
fn token(t:Target)->String{format!("{:x}:{}:{}",t.hwnd,t.pid,t.thread)}
fn layouts()->Vec<HKL>{unsafe{
    let count=GetKeyboardLayoutList(None);if !(1..=256).contains(&count){return vec![]}
    let mut list=vec![HKL::default();count as usize];let got=GetKeyboardLayoutList(Some(&mut list));list.truncate(got.max(0) as usize);list
}}
fn layout_id(value:HKL)->String{format!("{:x}",value.0 as usize)}
fn name(value:HKL)->String{
    match value.0 as usize as u16 {
        0x0419=>"Русский",0x0409=>"English (US)",0x0809=>"English (UK)",0x0407=>"Deutsch",0x040c=>"Français",0x0410=>"Italiano",0x0422=>"Українська",0x0415=>"Polski",0x041f=>"Türkçe",0x0411=>"日本語",0x0412=>"한국어",_=>return crate::system_controls::language_label(value.0 as usize as u16),
    }.into()
}
#[derive(Serialize)]
pub struct Layout {id:String,label:String,name:String,active:bool}
#[derive(Serialize)]
pub struct Snapshot {target:Option<String>,target_name:Option<String>,layouts:Vec<Layout>}
pub fn read_snapshot()->Snapshot{
    let selected=target();let current=selected.map(|t|unsafe{GetKeyboardLayout(t.thread)});
    let target_name=selected.map(|t|unsafe{let mut title=[0u16;192];let n=GetWindowTextW(HWND(t.hwnd as *mut _),&mut title);String::from_utf16_lossy(&title[..n.max(0) as usize])});
    Snapshot{target:selected.map(token),target_name,layouts:layouts().into_iter().map(|h|Layout{id:layout_id(h),label:crate::system_controls::language_label(h.0 as usize as u16),name:name(h),active:Some(h)==current}).collect()}
}
pub fn current_label()->String{target().map(|t|crate::system_controls::language_label(unsafe{GetKeyboardLayout(t.thread)}.0 as usize as u16)).unwrap_or_else(||"—".into())}
#[tauri::command]
pub async fn keyboard_layout_snapshot()->Result<Snapshot,String>{tauri::async_runtime::spawn_blocking(read_snapshot).await.map_err(|_|"Не удалось прочитать раскладки".into())}
#[tauri::command]
pub async fn keyboard_layout_select(id:String,target_token:String)->Result<(),String>{
    tauri::async_runtime::spawn_blocking(move||{
        let layout=layouts().into_iter().find(|h|layout_id(*h)==id).ok_or("Раскладка больше не установлена")?;
        let t=target().filter(|t|token(*t)==target_token).ok_or("Активное окно изменилось. Откройте выбор раскладки заново.")?;
        let hwnd=HWND(t.hwnd as *mut _);
        unsafe{
            let mut info=GUITHREADINFO{cbSize:std::mem::size_of::<GUITHREADINFO>() as u32,..Default::default()};
            let focused=if GetGUIThreadInfo(t.thread,&mut info).is_ok()&&!info.hwndFocus.0.is_null(){info.hwndFocus}else{hwnd};
            let mut focus_pid=0;GetWindowThreadProcessId(focused,Some(&mut focus_pid));
            if focus_pid!=t.pid{return Err("Активное окно изменилось. Откройте выбор раскладки заново.".into())}
            PostMessageW(Some(focused),WM_INPUTLANGCHANGEREQUEST,WPARAM(0),LPARAM(layout.0 as isize)).map_err(|_|"Приложение не разрешило сменить раскладку".to_string())?;
            for _ in 0..20{
                if GetKeyboardLayout(t.thread)==layout{
                    let _=SetForegroundWindow(hwnd);
                    return Ok(())
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
        }
        Err("Приложение не подтвердило смену раскладки. Перейдите в него и попробуйте снова.".into())
    }).await.map_err(|_|"Не удалось сменить раскладку".to_string())?
}
