//! Isolated Windows compatibility API used by EarTrumpet. This API is not a
//! public Core Audio contract: unsupported systems fail closed, never claim a
//! route was applied. Keep the IInspectable layout and both known IIDs here.
//! References (interface layout/device encoding, MIT licensed):
//! https://github.com/File-New-Project/EarTrumpet/blob/master/EarTrumpet/Interop/MMDeviceAPI/IAudioPolicyConfigFactoryVariantFor21H2.cs
//! https://github.com/File-New-Project/EarTrumpet/blob/master/EarTrumpet/DataModel/WindowsAudio/Internal/AudioPolicyConfigService.cs
use std::ffi::c_void;
use windows::{core::{HSTRING, HRESULT, Interface, IInspectable_Vtbl}, Win32::{Media::Audio::{EDataFlow, ERole, eRender, eConsole, eMultimedia}, System::WinRT::{RoGetActivationFactory, RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED}}};

const PREFIX: &str = r"\\?\SWD#MMDEVAPI#";
const RENDER: &str = "#{e6327cad-dcec-4949-ae8a-991e976a79d2}";
windows::core::define_interface!(Policy21H2, PolicyVtbl, 0xab3d4648_e242_459f_b02f_541c70306324);
windows::core::define_interface!(PolicyDownlevel, PolicyVtbl, 0x2a59116d_6c4f_45e0_a74f_707e3fef9258);
#[repr(C)]
pub struct PolicyVtbl {
    base: IInspectable_Vtbl,
    // Nineteen methods precede the persisted endpoint methods. They are never called.
    unused: [usize; 19],
    set: unsafe extern "system" fn(*mut c_void, u32, EDataFlow, ERole, *mut c_void) -> HRESULT,
    get: unsafe extern "system" fn(*mut c_void, u32, EDataFlow, ERole, *mut *mut c_void) -> HRESULT,
    _clear_all: usize, // Intentionally unavailable: resetting one app must not reset all apps.
}
struct Runtime;
impl Drop for Runtime { fn drop(&mut self) { unsafe { RoUninitialize(); } } }
enum Factory { Current(Policy21H2), Previous(PolicyDownlevel) }
pub struct Routing { factory: Factory, _runtime: Runtime }
impl Routing {
    pub fn new() -> Result<Self, String> {
        unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.map_err(|_| "App output routing is unavailable on this Windows version".to_string())?;
        let runtime = Runtime;
        let class = HSTRING::from("Windows.Media.Internal.AudioPolicyConfig");
        let factory = unsafe { RoGetActivationFactory::<Policy21H2>(&class) }.map(Factory::Current)
            .or_else(|_| unsafe { RoGetActivationFactory::<PolicyDownlevel>(&class) }.map(Factory::Previous))
            .map_err(|_| "App output routing is unavailable on this Windows version".to_string())?;
        Ok(Self { factory, _runtime: runtime })
    }
    fn parts(&self) -> (*mut c_void, &PolicyVtbl) {
        match &self.factory { Factory::Current(p) => (p.as_raw(), p.vtable()), Factory::Previous(p) => (p.as_raw(), p.vtable()) }
    }
    pub fn get(&self, pid: u32, role: ERole) -> Result<Option<String>, String> {
        let (raw, table) = self.parts();
        let mut value = HSTRING::new();
        // HSTRING owns the returned ABI allocation even if the call fails.
        unsafe { (table.get)(raw, pid, eRender, role, (&mut value as *mut HSTRING).cast()) }.ok().map_err(|e| e.to_string())?;
        unpack(&value.to_string_lossy())
    }
    fn set(&self, pid: u32, role: ERole, endpoint: Option<&str>) -> Result<(), String> {
        let (raw, table) = self.parts();
        let value = endpoint.map(|id| HSTRING::from(format!("{PREFIX}{id}{RENDER}"))).unwrap_or_default();
        let abi: *mut c_void = unsafe { std::mem::transmute_copy(&value) };
        unsafe { (table.set)(raw, pid, eRender, role, abi) }.ok().map_err(|e| e.to_string())
    }
    pub fn preference(&self, pid: u32) -> Result<Option<String>, String> { self.get(pid, eMultimedia) }
    pub fn apply(&self, pid: u32, endpoint: Option<&str>) -> Result<(), String> {
        apply_preferences(|role|self.get(pid, role), |role,endpoint|self.set(pid, role, endpoint), endpoint)
    }
}
fn apply_preferences(mut read:impl FnMut(ERole)->Result<Option<String>,String>,mut write:impl FnMut(ERole,Option<&str>)->Result<(),String>,endpoint:Option<&str>)->Result<(),String> {
        let roles = [eConsole, eMultimedia]; // Communications preferences are never changed.
        let previous = [read(roles[0])?, read(roles[1])?];
        let change = (|| {
            for role in roles { write(role, endpoint)?; }
            for role in roles {
                if read(role)?.as_deref() != endpoint { return Err("Windows did not confirm the app output preference".into()); }
            }
            Ok(())
        })();
        if let Err(error) = change {
            let mut rollback_ok = true;
            for (role, old) in roles.into_iter().zip(previous.iter()) { rollback_ok &= write(role, old.as_deref()).is_ok(); }
            for (role, old) in roles.into_iter().zip(previous.iter()) { rollback_ok &= read(role).ok().as_ref() == Some(old); }
            return Err(if rollback_ok { error } else { format!("{error}. Windows could not restore the previous output preference; refresh the mixer") });
        }
        Ok(())
}
fn unpack(value: &str) -> Result<Option<String>, String> {
    if value.is_empty() { return Ok(None); }
    let id = value.strip_prefix(PREFIX).and_then(|s| s.strip_suffix(RENDER)).ok_or("Windows returned an unrecognized app output preference")?;
    if id.is_empty() { return Err("Windows returned an empty output device identifier".into()); }
    Ok(Some(id.to_string()))
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    #[test] fn render_endpoint_round_trip() { assert_eq!(unpack(&format!("{PREFIX}{{0.0.0.00000000}}.device{RENDER}")).unwrap(), Some("{0.0.0.00000000}.device".into())); }
    #[test] fn default_is_null_and_capture_is_rejected() { assert_eq!(unpack("").unwrap(), None); assert!(unpack("unknown").is_err()); assert!(unpack(&format!("{PREFIX}device#{{2eef81be-33fa-4800-9670-1cd474972c3f}}")).is_err()); }
    #[test] fn second_role_failure_restores_each_previous_role() {
        let values=RefCell::new([Some("console-old".to_string()),Some("media-old".to_string())]);
        let result=apply_preferences(|role|Ok(values.borrow()[role.0 as usize].clone()),|role,id|{
            if role==eMultimedia&&id==Some("new"){return Err("Device disconnected".into());}
            values.borrow_mut()[role.0 as usize]=id.map(String::from);Ok(())
        },Some("new"));
        assert!(result.is_err());assert_eq!(*values.borrow(),[Some("console-old".into()),Some("media-old".into())]);
    }
    #[test] fn reset_requires_readback_and_never_writes_communications() {
        let values=RefCell::new([Some("old".to_string()),Some("old".to_string())]);
        apply_preferences(|role|Ok(values.borrow()[role.0 as usize].clone()),|role,id|{
            assert!(role==eConsole||role==eMultimedia);assert_eq!(id,None);values.borrow_mut()[role.0 as usize]=None;Ok(())
        },None).unwrap();assert_eq!(*values.borrow(),[None,None]);
    }
    #[test] fn success_hresult_with_wrong_readback_is_not_success() {
        let values=RefCell::new([Some("old".to_string()),Some("old".to_string())]);
        let result=apply_preferences(|role|Ok(values.borrow()[role.0 as usize].clone()),|_,_|Ok(()),Some("new"));
        assert!(result.unwrap_err().contains("did not confirm"));
    }
    #[test] fn rollback_failure_is_reported_explicitly() {
        let values=RefCell::new([Some("old".to_string()),Some("old".to_string())]);
        let result=apply_preferences(|role|Ok(values.borrow()[role.0 as usize].clone()),|role,id|{
            if role==eMultimedia||id==Some("old"){return Err("Disconnected".into());}
            values.borrow_mut()[role.0 as usize]=id.map(String::from);Ok(())
        },Some("new"));assert!(result.unwrap_err().contains("could not restore"));
    }
}
