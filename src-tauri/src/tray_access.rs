//! Opens Explorer's overflow through its actual accessibility action, not Win+B.
use windows::{core::w,Win32::{System::Com::*,UI::{Accessibility::*,WindowsAndMessaging::*}}};
pub fn open_overflow()->Result<(),String>{unsafe{
    CoInitializeEx(None,COINIT_MULTITHREADED).ok().map_err(|_|"Не удалось открыть скрытые значки".to_string())?;
    struct Apartment;impl Drop for Apartment{fn drop(&mut self){unsafe{CoUninitialize();}}}let _a=Apartment;
    let hwnd=FindWindowW(w!("Shell_TrayWnd"),None).map_err(|_|"Панель Windows недоступна".to_string())?;
    let uia:IUIAutomation=CoCreateInstance(&CUIAutomation,None,CLSCTX_INPROC_SERVER).map_err(|_|"Не удалось открыть скрытые значки".to_string())?;
    let root=uia.ElementFromHandle(hwnd).map_err(|_|"Панель Windows недоступна".to_string())?;
    let condition=uia.CreateTrueCondition().map_err(|_|"Панель Windows недоступна".to_string())?;
    let elements=root.FindAll(TreeScope_Descendants,&condition).map_err(|_|"Панель Windows недоступна".to_string())?;
    let mut invoked=false;
    for index in 0..elements.Length().unwrap_or(0).min(512){
        let Ok(element)=elements.GetElement(index) else{continue};
        let class=element.CurrentClassName().map(|s|s.to_string()).unwrap_or_default();
        let id=element.CurrentAutomationId().map(|s|s.to_string()).unwrap_or_default();
        let name=element.CurrentName().map(|s|s.to_string()).unwrap_or_default();
        if !matches!(class.as_str(),"SystemTray.ChevronIcon") && id!="NotifyIconOverflowButton" && !matches!(name.as_str(),"Show hidden icons"|"Показать скрытые значки"|"Hidden icon menu"|"Меню скрытых значков"){continue}
        if let Ok(pattern)=element.GetCurrentPatternAs::<IUIAutomationExpandCollapsePattern>(UIA_ExpandCollapsePatternId){
            invoked=pattern.Expand().is_ok();
        }else if let Ok(pattern)=element.GetCurrentPatternAs::<IUIAutomationInvokePattern>(UIA_InvokePatternId){
            invoked=pattern.Invoke().is_ok();
        }else if let Ok(pattern)=element.GetCurrentPatternAs::<IUIAutomationLegacyIAccessiblePattern>(UIA_LegacyIAccessiblePatternId){
            invoked=pattern.DoDefaultAction().is_ok();
        }
        if invoked{break}
    }
    if !invoked{return Err("Windows не предоставила кнопку скрытых значков. Проверьте, включено ли меню скрытых значков в параметрах панели задач.".into())}
    for _ in 0..20{
        for class in [w!("TopLevelWindowForOverflowXamlIsland"),w!("NotifyIconOverflowWindow")]{
            if FindWindowW(class,None).is_ok_and(|h|IsWindowVisible(h).as_bool()){return Ok(())}
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    Err("Открытие скрытых значков не подтверждено. Панель Windows восстановлена; нажмите её стрелку.".into())
}}
