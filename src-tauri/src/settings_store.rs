use std::{collections::HashMap, path::Path, io::Write, os::windows::ffi::OsStrExt};
use serde_json::Value;

pub fn read(path:&Path)->Result<HashMap<String,Value>,String>{
    match std::fs::read(path){
        Ok(bytes)=>serde_json::from_slice(&bytes).map_err(|_|"Настройки повреждены. Существующий файл сохранён; восстановите резервную копию.".into()),
        Err(e) if e.kind()==std::io::ErrorKind::NotFound=>Ok(HashMap::new()),
        Err(_)=>Err("Не удалось прочитать настройки. Существующий файл не изменён.".into()),
    }
}

pub fn commit(path:&Path,values:&HashMap<String,Value>)->Result<(),String>{
    use windows::Win32::Storage::FileSystem::{MoveFileExW,MOVEFILE_REPLACE_EXISTING,MOVEFILE_WRITE_THROUGH};
    let parent=path.parent().ok_or("Папка настроек недоступна")?;
    std::fs::create_dir_all(parent).map_err(|_|"Не удалось создать папку настроек")?;
    let bytes=serde_json::to_vec(values).map_err(|_|"Не удалось подготовить настройки")?;
    let temp=path.with_extension("json.tmp");
    let mut file=std::fs::File::create(&temp).map_err(|_|"Не удалось записать настройки")?;
    file.write_all(&bytes).and_then(|_|file.sync_all()).map_err(|_|"Не удалось записать настройки")?;
    drop(file);
    let from:Vec<u16>=temp.as_os_str().encode_wide().chain(Some(0)).collect();
    let to:Vec<u16>=path.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe{MoveFileExW(windows::core::PCWSTR(from.as_ptr()),windows::core::PCWSTR(to.as_ptr()),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH)}.map_err(|_|"Не удалось заменить настройки. Прежний файл сохранён.".into())
}

#[cfg(test)]mod tests{
    use super::*;
    fn isolated()->std::path::PathBuf{let p=std::env::temp_dir().join(format!("dinox-settings-test-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));std::fs::create_dir_all(&p).unwrap();p}
    #[test]fn corrupt_file_is_not_treated_as_empty(){let d=isolated();let p=d.join("settings.json");std::fs::write(&p,b"broken").unwrap();assert!(read(&p).is_err());assert_eq!(std::fs::read(&p).unwrap(),b"broken");std::fs::remove_dir_all(d).unwrap();}
    #[test]fn batch_replaces_atomically_and_retains_unrelated_keys(){let d=isolated();let p=d.join("settings.json");let mut s=HashMap::from([("existing".into(),Value::String("keep".into()))]);commit(&p,&s).unwrap();s.extend([("city".into(),Value::String("sample".into())),("lat".into(),Value::String("10".into()))]);commit(&p,&s).unwrap();assert_eq!(read(&p).unwrap(),s);assert!(!p.with_extension("json.tmp").exists());std::fs::remove_dir_all(d).unwrap();}
    #[test]fn failed_temp_write_keeps_previous_settings(){let d=isolated();let p=d.join("settings.json");let old=HashMap::from([("existing".into(),Value::Bool(true))]);commit(&p,&old).unwrap();std::fs::create_dir(p.with_extension("json.tmp")).unwrap();assert!(commit(&p,&HashMap::new()).is_err());assert_eq!(read(&p).unwrap(),old);std::fs::remove_dir_all(d).unwrap();}
}
