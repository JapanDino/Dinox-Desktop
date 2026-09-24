//! Shell activation on a fresh COM apartment, never on an uninitialized Tokio thread.
pub fn launch(uri: &str) -> Result<(),String> {
    let uri=uri.to_owned();
    std::thread::spawn(move || unsafe {
        use windows::{core::PCWSTR,Win32::{System::Com::{CoInitializeEx,CoUninitialize,COINIT_APARTMENTTHREADED,COINIT_DISABLE_OLE1DDE},UI::{Shell::{ShellExecuteExW,SHELLEXECUTEINFOW,SEE_MASK_NOASYNC,SEE_MASK_FLAG_NO_UI},WindowsAndMessaging::SW_SHOWNORMAL}}};
        CoInitializeEx(None,COINIT_APARTMENTTHREADED|COINIT_DISABLE_OLE1DDE).ok().map_err(|e|format!("Windows COM: {}",e.code()))?;
        struct Apartment;
        impl Drop for Apartment {fn drop(&mut self){unsafe {CoUninitialize();}}}
        let _apartment=Apartment;
        let target:Vec<u16>=uri.encode_utf16().chain(Some(0)).collect();
        let mut info=SHELLEXECUTEINFOW {
            cbSize:std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
            fMask:SEE_MASK_NOASYNC|SEE_MASK_FLAG_NO_UI,
            lpVerb:windows::core::w!("open"),lpFile:PCWSTR(target.as_ptr()),
            nShow:SW_SHOWNORMAL.0,..Default::default()
        };
        ShellExecuteExW(&mut info).map_err(|e|format!("Не удалось открыть панель Windows ({})",e.code()))
    }).join().map_err(|_|"Не удалось открыть панель Windows".to_string())?
}
