use serde::{Deserialize, Serialize};
use std::{path::PathBuf, time::{Duration, SystemTime, UNIX_EPOCH}};
use tauri::{AppHandle, Emitter, Manager};
use windows::Win32::{Foundation::{HLOCAL, LocalFree}, Security::Cryptography::{CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN}};

static LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
const MAX_BYTES: usize = 4 * 1024 * 1024;

#[derive(Clone, Serialize, Deserialize)]
struct Source {
    id: String, name: String, color: String, enabled: bool,
    url: String, #[serde(default)] ics: String,
    #[serde(default)] etag: String, #[serde(default)] modified: String,
    #[serde(default)] checked: u64,
}
#[derive(Serialize)]
pub struct CalendarView { id: String, name: String, color: String, enabled: bool, ics: String, checked: u64 }
impl From<&Source> for CalendarView {
    fn from(s: &Source) -> Self { Self { id:s.id.clone(), name:s.name.clone(), color:s.color.clone(), enabled:s.enabled, ics:s.ics.clone(), checked:s.checked } }
}
fn protect(data: &[u8], encrypt: bool) -> Result<Vec<u8>, String> {
    let input = CRYPT_INTEGER_BLOB { cbData:data.len() as u32, pbData:data.as_ptr() as *mut u8 };
    let mut output = CRYPT_INTEGER_BLOB::default();
    unsafe {
        let result = if encrypt { CryptProtectData(&input, windows::core::PCWSTR::null(), None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut output) }
        else { CryptUnprotectData(&input, None, None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut output) };
        result.map_err(|_| "Не удалось открыть защищённое хранилище календарей Windows".to_string())?;
        let bytes = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(output.pbData as *mut _)));
        Ok(bytes)
    }
}
fn path(app: &AppHandle) -> Result<PathBuf,String> {
    app.path().app_config_dir().map(|p| p.join("calendars.bin")).map_err(|_| "Папка настроек недоступна".into())
}
fn load(app: &AppHandle) -> Result<Vec<Source>,String> {
    let p=path(app)?;
    if !p.exists() { return Ok(vec![]) }
    let bytes=std::fs::read(p).map_err(|_| "Не удалось прочитать календари")?;
    if bytes.len()>32*1024*1024 { return Err("Хранилище календарей слишком велико".into()) }
    serde_json::from_slice(&protect(&bytes,false)?).map_err(|_| "Хранилище календарей повреждено".into())
}
fn save(app: &AppHandle, sources: &[Source]) -> Result<(),String> {
    let p=path(app)?; let temp=p.with_extension("tmp");
    std::fs::create_dir_all(p.parent().unwrap()).map_err(|_| "Не удалось создать папку календарей")?;
    let bytes=serde_json::to_vec(sources).map_err(|_| "Не удалось сохранить календари")?;
    std::fs::write(&temp,protect(&bytes,true)?).map_err(|_| "Не удалось записать календари")?;
    std::fs::rename(&temp,&p).map_err(|_| "Не удалось заменить хранилище календарей")?;
    Ok(())
}
fn validate_url(raw:&str)->Result<reqwest::Url,String> {
    let normalized=if let Some(rest)=raw.trim().strip_prefix("webcal://") { format!("https://{rest}") } else { raw.trim().to_string() };
    let url=reqwest::Url::parse(&normalized).map_err(|_| "Введите HTTPS-ссылку на календарь ICS")?;
    let host=url.host_str().unwrap_or("").to_lowercase();
    if url.scheme()!="https" || !url.username().is_empty() || url.password().is_some() || host.is_empty() || host=="localhost" || host.ends_with(".local") || host.parse::<std::net::IpAddr>().is_ok() || host.starts_with('[') {
        return Err("Нужна HTTPS-ссылка календарного сервиса без логина и пароля в адресе".into());
    }
    Ok(url)
}
async fn fetch(source:&mut Source)->Result<(),String> {
    let url=validate_url(&source.url)?;
    if rustls::crypto::CryptoProvider::get_default().is_none() { let _=rustls::crypto::ring::default_provider().install_default(); }
    let client=reqwest::Client::builder().timeout(Duration::from_secs(20)).redirect(reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len()>=5 || validate_url(attempt.url().as_str()).is_err() { attempt.stop() } else { attempt.follow() }
    })).build().map_err(|_| "Не удалось подключиться к календарю")?;
    let mut request=client.get(url).header("Accept","text/calendar");
    if !source.etag.is_empty() { request=request.header("If-None-Match",&source.etag); }
    if !source.modified.is_empty() { request=request.header("If-Modified-Since",&source.modified); }
    let mut response=request.send().await.map_err(|_| "Календарь недоступен. Проверьте интернет и ссылку; сохранённые события остались на месте.")?;
    let now=SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    if response.status().as_u16()==304 { source.checked=now; return Ok(()) }
    if !response.status().is_success() { return Err(format!("Сервис календаря ответил HTTP {}. Проверьте доступ к подписке.",response.status().as_u16())) }
    if response.content_length().unwrap_or(0)>MAX_BYTES as u64 { return Err("Календарь превышает 4 МБ".into()) }
    let etag=response.headers().get("etag").and_then(|v|v.to_str().ok()).unwrap_or("").to_string();
    let modified=response.headers().get("last-modified").and_then(|v|v.to_str().ok()).unwrap_or("").to_string();
    let mut bytes=Vec::new();
    while let Some(chunk)=response.chunk().await.map_err(|_| "Загрузка календаря прервалась")? {
        if bytes.len()+chunk.len()>MAX_BYTES { return Err("Календарь превышает 4 МБ".into()) }
        bytes.extend_from_slice(&chunk);
    }
    let ics=String::from_utf8(bytes).map_err(|_| "Календарь должен быть в кодировке UTF-8")?;
    if !ics.trim_start_matches('\u{feff}').trim_start().starts_with("BEGIN:VCALENDAR") || !ics.contains("END:VCALENDAR") { return Err("Ссылка вернула не календарь ICS. Нужен адрес iCal, а не ссылка на веб-страницу.".into()) }
    source.ics=ics; source.etag=etag; source.modified=modified; source.checked=now;
    Ok(())
}
#[tauri::command]
pub async fn calendar_list(app:AppHandle)->Result<Vec<CalendarView>,String> {
    let _guard=LOCK.lock().await; Ok(load(&app)?.iter().map(CalendarView::from).collect())
}
#[tauri::command]
pub async fn calendar_save(app:AppHandle,id:Option<String>,name:String,color:String,enabled:bool,url:Option<String>)->Result<CalendarView,String> {
    if name.trim().is_empty() || name.len()>120 { return Err("Название должно содержать от 1 до 120 символов".into()) }
    if color.len()!=7 || !color.starts_with('#') || !color[1..].bytes().all(|c|c.is_ascii_hexdigit()) { return Err("Некорректный цвет".into()) }
    let _guard=LOCK.lock().await; let mut sources=load(&app)?;
    let index=id.as_ref().and_then(|id|sources.iter().position(|s|&s.id==id));
    if id.is_some() && index.is_none() { return Err("Календарь уже удалён".into()) }
    if index.is_none() && sources.len()>=6 { return Err("Можно подключить до шести календарей".into()) }
    let mut source=if let Some(i)=index { sources[i].clone() } else { Source {id:format!("{:x}",SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos()),name:String::new(),color:String::new(),enabled:true,url:String::new(),ics:String::new(),etag:String::new(),modified:String::new(),checked:0} };
    source.name=name.trim().into(); source.color=color; source.enabled=enabled;
    if let Some(url)=url.filter(|u|!u.trim().is_empty()) { source.url=validate_url(&url)?.to_string(); source.etag.clear(); source.modified.clear(); fetch(&mut source).await?; }
    if source.url.is_empty() { return Err("Введите ссылку подписки".into()) }
    let view=CalendarView::from(&source);
    if let Some(i)=index { sources[i]=source } else { sources.push(source) }
    save(&app,&sources)?; let _=app.emit("calendars-changed",()); Ok(view)
}
#[tauri::command]
pub async fn calendar_refresh(app:AppHandle,id:String)->Result<CalendarView,String> {
    let _guard=LOCK.lock().await; let mut sources=load(&app)?;
    let source=sources.iter_mut().find(|s|s.id==id).ok_or("Календарь не найден")?;
    fetch(source).await?; let view=CalendarView::from(&*source); save(&app,&sources)?; Ok(view)
}
#[tauri::command]
pub async fn calendar_remove(app:AppHandle,id:String)->Result<(),String> {
    let _guard=LOCK.lock().await; let mut sources=load(&app)?; sources.retain(|s|s.id!=id); save(&app,&sources)?;
    let _=app.emit("calendars-changed",()); Ok(())
}
#[tauri::command]
pub async fn calendar_open_link(app:AppHandle,url:String)->Result<(),String> {
    let url=validate_url(&url)?;
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url(url.as_str(),None::<&str>).map_err(|_| "Не удалось открыть ссылку")?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "Requires internet; public Google holidays only, no user credentials"]
    fn public_google_subscription() {
        let mut source=Source {id:"test".into(),name:"Public test".into(),color:"#b7a6ff".into(),enabled:true,url:"https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics".into(),ics:String::new(),etag:String::new(),modified:String::new(),checked:0};
        let runtime=tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(fetch(&mut source)).unwrap();
        assert!(source.ics.contains("BEGIN:VEVENT"));
        assert!(source.checked>0);
        runtime.block_on(fetch(&mut source)).unwrap();
        assert!(source.ics.contains("BEGIN:VEVENT"));
    }
    #[test] fn rejects_unsafe_urls() {
        for s in ["file:///C:/x","javascript:alert(1)","http://example.com/a.ics","https://user:pass@example.com/","https://localhost/a","https://127.0.0.1/a"] { assert!(validate_url(s).is_err()); }
        assert_eq!(validate_url("webcal://calendar.google.com/test.ics").unwrap().scheme(),"https");
    }
    #[test] fn encrypted_store_roundtrip() { let text=b"private calendar sample"; let protected=protect(text,true).unwrap(); assert_ne!(protected,text); assert_eq!(protect(&protected,false).unwrap(),text); }
}
