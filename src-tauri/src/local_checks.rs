//! Explicit, windowless local checks. Never starts the shell or reads account contents.
use serde_json::{json,Value};

pub fn read_only()->Value{
    let context:tauri::Context<tauri::Wry>=tauri::generate_context!();
    let embedded_pages=["index.html","settings.html","dock.html","launcher.html","widgets.html"].iter()
        .all(|path|context.assets().get(&tauri::utils::assets::AssetKey::from(*path)).is_some());
    let taskbars=crate::shell_controller::primary_taskbar_signature();
    let audio=match crate::audio_mixer::read_snapshot(){Ok(devices)=>{let d=serde_json::to_value(devices).unwrap_or(Value::Null);json!({"available":true,"devices":d})},Err(e)=>json!({"available":false,"error":e})};
    json!({"version":env!("CARGO_PKG_VERSION"),"productionAssets":!tauri::is_dev()&&embedded_pages,"embeddedPages":embedded_pages,"primaryTaskbarCount":taskbars.len(),"primaryTaskbarVisibleCount":taskbars.iter().filter(|t|t.1).count(),"brightness":crate::brightness::read(),"brightnessTarget":crate::brightness::target(),"audio":audio,"keyboard":crate::keyboard_layout::current_label()})
}
pub fn brightness_roundtrip()->Value{
    let Some(before)=crate::brightness::read()else{return json!({"state":"unavailable","changed":false})};
    struct Restore(u32);
    impl Drop for Restore{fn drop(&mut self){let _=crate::brightness::set_and_read(self.0);}}
    let restore=Restore(before);
    let target=if before>=99{before-1}else{before+1};
    let set=crate::brightness::set_and_read(target);
    let back=crate::brightness::set_and_read(before);
    let restored=crate::brightness::read();
    if back.is_ok()&&restored==Some(before){std::mem::forget(restore);}
    json!({"before":before,"requested":target,"confirmed":set.as_ref().ok(),"error":set.err(),"restored":restored==Some(before),"restoreError":back.err()})
}
