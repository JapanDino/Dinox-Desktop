mod google;
mod yandex;
#[cfg(test)] mod live_tests;
use serde::{Deserialize,Serialize};
use serde_json::{Value,json};
use tauri::{AppHandle,Emitter,Manager};
use std::time::{Duration,SystemTime,UNIX_EPOCH};
static LOCK:tokio::sync::Mutex<()>=tokio::sync::Mutex::const_new(());
static AUTH_LOCK:tokio::sync::Mutex<()>=tokio::sync::Mutex::const_new(());
static CANCEL:std::sync::atomic::AtomicBool=std::sync::atomic::AtomicBool::new(false);
pub(super) fn cancelled()->bool{CANCEL.load(std::sync::atomic::Ordering::Relaxed)}
#[tauri::command]
pub fn calendar_cancel_auth(){CANCEL.store(true,std::sync::atomic::Ordering::Relaxed);}
#[derive(Clone,Serialize,Deserialize)]
pub struct Item {pub id:String,pub title:String,pub start:Option<String>,pub end:Option<String>,pub all_day:bool,pub task:bool,pub completed:bool,pub description:String,pub url:String}
fn enabled_default()->bool{true}
#[derive(Clone,Serialize,Deserialize)]
pub struct Collection {pub id:String,pub name:String,pub kind:String,pub writable:bool,#[serde(default="enabled_default")]pub enabled:bool,#[serde(default)]pub ics:String,#[serde(default)]pub items:Vec<Item>,#[serde(default)]pub checked:u64}
#[derive(Clone,Serialize,Deserialize)]
struct Account {id:String,provider:String,label:String,username:String,secret:String,client_id:String,client_secret:String,refresh:String,access:String,expires:u64,collections:Vec<Collection>}
#[derive(Clone,Serialize,Deserialize,PartialEq)]
pub struct Draft {pub request_id:String,pub account_id:String,pub collection_id:String,pub kind:String,pub title:String,pub description:String,pub start:Option<String>,pub end:Option<String>,pub all_day:bool}
#[derive(Clone,Serialize,Deserialize)]
struct Operation {draft:Draft,#[serde(default)]remote_id:Option<String>}
#[derive(Default,Serialize,Deserialize)]
struct Store {accounts:Vec<Account>,#[serde(default)]operations:Vec<Operation>}
#[derive(Serialize)]
pub struct AccountView {id:String,provider:String,label:String,collections:Vec<Collection>}
fn views(store:&Store)->Vec<AccountView>{store.accounts.iter().map(|a|AccountView{id:a.id.clone(),provider:a.provider.clone(),label:a.label.clone(),collections:a.collections.clone()}).collect()}
pub(super) fn now()->u64{SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()}
fn load(app:&AppHandle)->Result<Store,String>{let p=app.path().app_config_dir().map_err(|_|"Storage unavailable")?.join("calendar-accounts.bin");if !p.exists(){return Ok(Store::default());}let bytes=std::fs::read(p).map_err(|_|"Cannot read accounts")?;if bytes.len()>64*1024*1024{return Err("Accounts cache too large".into());}serde_json::from_slice(&crate::calendar::protect(&bytes,false)?).map_err(|_|"Accounts storage damaged".into())}
fn save(app:&AppHandle,store:&Store)->Result<(),String>{let dir=app.path().app_config_dir().map_err(|_|"Storage unavailable")?;std::fs::create_dir_all(&dir).map_err(|_|"Storage unavailable")?;let p=dir.join("calendar-accounts.bin");let tmp=dir.join("calendar-accounts.tmp");let bytes=serde_json::to_vec(store).map_err(|_|"Cannot encode accounts")?;if bytes.len()>64*1024*1024{return Err("Accounts cache too large".into());}std::fs::write(&tmp,crate::calendar::protect(&bytes,true)?).map_err(|_|"Cannot save accounts")?;std::fs::rename(tmp,p).map_err(|_|"Cannot replace accounts".into())}
pub(super) fn client()->Result<reqwest::Client,String>{if rustls::crypto::CryptoProvider::get_default().is_none(){let _=rustls::crypto::ring::default_provider().install_default();}reqwest::Client::builder().timeout(Duration::from_secs(25)).redirect(reqwest::redirect::Policy::none()).build().map_err(|_|"Connection unavailable".into())}
pub(super) async fn response(mut r:reqwest::Response)->Result<String,String>{let code=r.status().as_u16();if !r.status().is_success(){return Err(format!("Calendar service HTTP {code}. Check access and try refreshing."));}let mut bytes=Vec::new();while let Some(chunk)=r.chunk().await.map_err(|_|"Response interrupted; refresh before retrying a creation")?{if bytes.len()+chunk.len()>16*1024*1024{return Err("Calendar response exceeds 16 MB".into());}bytes.extend_from_slice(&chunk);}String::from_utf8(bytes).map_err(|_|"Invalid calendar response".into())}
pub(super) async fn json_response(r:reqwest::Response)->Result<Value,String>{serde_json::from_str(&response(r).await?).map_err(|_|"Invalid service response".into())}
pub(super) fn segment(value:&str)->String{let mut url=reqwest::Url::parse("https://example.com/").unwrap();url.path_segments_mut().unwrap().push(value);url.path().trim_start_matches('/').to_owned()}
fn validate(d:&Draft)->Result<(),String>{
 if uuid::Uuid::parse_str(&d.request_id).is_err()||d.title.trim().is_empty()||d.title.chars().count()>1024||d.description.chars().count()>8192||!["event","task"].contains(&d.kind.as_str()){return Err("Invalid title, description or request ID".into());}
 if d.kind=="event"&&(d.start.is_none()||d.end.is_none()){return Err("Start and end are required".into());}
 if !d.all_day&&d.start.is_none(){return Err("A time requires a date".into());}
 for date in [&d.start,&d.end].into_iter().flatten(){if d.all_day {if date.len()!=10||chrono::NaiveDate::parse_from_str(date,"%Y-%m-%d").is_err(){return Err("Invalid date".into());}}else if chrono::DateTime::parse_from_rfc3339(date).is_err(){return Err("Invalid date/time".into());}}
 if let (Some(start),Some(end))=(&d.start,&d.end){let valid=if d.all_day{end>start}else{chrono::DateTime::parse_from_rfc3339(end).unwrap()>chrono::DateTime::parse_from_rfc3339(start).unwrap()};if !valid{return Err("End must follow start".into());}}
 Ok(())
}
#[tauri::command]
pub async fn calendar_accounts(app:AppHandle)->Result<Vec<AccountView>,String>{let _g=LOCK.lock().await;Ok(views(&load(&app)?))}
#[tauri::command]
pub fn calendar_google_config()->Value{json!({"google":option_env!("DINOX_GOOGLE_CLIENT_ID").is_some_and(|id|id.ends_with(".apps.googleusercontent.com"))&&option_env!("DINOX_GOOGLE_CLIENT_SECRET").is_some_and(|s|!s.is_empty()),"googleMode":match option_env!("DINOX_GOOGLE_ACCESS_MODE"){Some("verified")=>"verified",Some("unverified")=>"unverified",_=>"testing"},"yandex":option_env!("DINOX_YANDEX_CLIENT_ID").is_some_and(|id|!id.is_empty())&&option_env!("DINOX_YANDEX_CALDAV_APPROVED")==Some("true")})}
#[tauri::command]
pub async fn calendar_connect_google(app:AppHandle)->Result<Vec<AccountView>,String>{
 let _auth=AUTH_LOCK.try_lock().map_err(|_|"Sign-in already in progress")?;CANCEL.store(false,std::sync::atomic::Ordering::Relaxed);
 let mut account=google::authorize(&app,String::new(),String::new()).await?;google::refresh(&mut account).await?;let _g=LOCK.lock().await;let mut store=load(&app)?;if let Some(old)=store.accounts.iter_mut().find(|a|a.provider==account.provider&&a.username==account.username&&!a.username.is_empty()){account.id=old.id.clone();for c in &mut account.collections{if let Some(previous)=old.collections.iter().find(|p|p.id==c.id&&p.kind==c.kind){c.enabled=previous.enabled;}}*old=account;}else{if store.accounts.len()>=8{return Err("Maximum 8 connected accounts".into());}store.accounts.push(account);}save(&app,&store)?;let _=app.emit("calendars-changed",());Ok(views(&store))
}
#[tauri::command]
pub async fn calendar_connect_yandex(app:AppHandle)->Result<Vec<AccountView>,String>{
 let _auth=AUTH_LOCK.try_lock().map_err(|_|"Sign-in already in progress")?;CANCEL.store(false,std::sync::atomic::Ordering::Relaxed);
 let mut a=yandex::authorize(&app).await?;yandex::discover(&mut a).await?;yandex::refresh(&mut a).await?;
 let _g=LOCK.lock().await;let mut store=load(&app)?;if let Some(old)=store.accounts.iter_mut().find(|old|old.provider==a.provider&&old.username==a.username&&!a.username.is_empty()){a.id=old.id.clone();for c in &mut a.collections{if let Some(previous)=old.collections.iter().find(|p|p.id==c.id&&p.kind==c.kind){c.enabled=previous.enabled;}}*old=a;}else{if store.accounts.len()>=8{return Err("Maximum 8 connected accounts".into());}store.accounts.push(a);}save(&app,&store)?;let _=app.emit("calendars-changed",());Ok(views(&store))
}#[tauri::command]
pub async fn calendar_account_refresh(app:AppHandle,id:String)->Result<Vec<AccountView>,String>{let _g=LOCK.lock().await;let mut store=load(&app)?;let a=store.accounts.iter_mut().find(|a|a.id==id).ok_or("Account removed")?;let result=if a.provider=="google"{google::refresh(a).await}else{yandex::refresh(a).await};save(&app,&store)?;result?;let _=app.emit("calendars-changed",());Ok(views(&store))}
#[tauri::command]
pub async fn calendar_account_remove(app:AppHandle,id:String)->Result<(),String>{let _g=LOCK.lock().await;let mut store=load(&app)?;store.accounts.retain(|a|a.id!=id);store.operations.retain(|o|o.draft.account_id!=id);save(&app,&store)?;let _=app.emit("calendars-changed",());Ok(())}
#[tauri::command]
pub async fn calendar_create_item(app:AppHandle,draft:Draft)->Result<Value,String>{
 validate(&draft)?;let _g=LOCK.lock().await;let mut store=load(&app)?;
 if let Some(op)=store.operations.iter().find(|o|o.draft.request_id==draft.request_id){if op.draft!=draft{return Err("This request ID belongs to a different draft".into());}if let Some(id)=&op.remote_id{return Ok(json!({"id":id,"saved":true}));}return Err("Previous creation has an uncertain result. Refresh the source calendar and check it before creating another copy.".into());}
 let index=store.accounts.iter().position(|a|a.id==draft.account_id).ok_or("Account removed")?;
 let c=store.accounts[index].collections.iter().find(|c|c.id==draft.collection_id&&c.kind==draft.kind&&c.writable).ok_or("Choose a writable calendar or task list")?;
 if store.accounts[index].provider=="google"&&c.kind=="task"&&!draft.all_day{return Err("Google Tasks API supports dates, not exact times".into());}
 if store.operations.len()>=2000{return Err("Creation journal is full; export or clean confirmed operations before continuing".into());}
 if store.accounts[index].provider=="google"{google::token(&mut store.accounts[index]).await?;}else{yandex::token(&mut store.accounts[index]).await?;}
 store.operations.push(Operation{draft:draft.clone(),remote_id:None});save(&app,&store)?;
 let result=if store.accounts[index].provider=="google"{google::create(&store.accounts[index],&draft).await}else{yandex::create(&store.accounts[index],&draft).await};
 let remote=match result {Ok(id)=>id,Err(error)=>{if error.starts_with("Rejected:"){store.operations.retain(|o|o.draft.request_id!=draft.request_id);save(&app,&store)?;}return Err(if error.starts_with("Rejected:"){error}else{format!("Creation result is uncertain. {error}")});}};
 store.operations.last_mut().unwrap().remote_id=Some(remote.clone());save(&app,&store).map_err(|_|"Creation result is uncertain locally. Check the original calendar before creating another copy.")?;
 // Creation is confirmed even if the subsequent refresh is offline.
 let a=&mut store.accounts[index];let refreshed=if a.provider=="google"{google::refresh(a).await}else{yandex::refresh(a).await};let persisted=save(&app,&store);let warning=refreshed.err().or_else(||persisted.err());let _=app.emit("calendars-changed",());Ok(json!({"id":remote,"saved":true,"warning":warning}))
}
#[cfg(test)]mod tests{use super::*;#[test]fn rejects_bad_dates_and_empty_titles(){let mut d=Draft{request_id:uuid::Uuid::new_v4().to_string(),account_id:"a".into(),collection_id:"b".into(),kind:"event".into(),title:"Test".into(),description:String::new(),start:Some("2026-09-28".into()),end:Some("2026-09-29".into()),all_day:true};assert!(validate(&d).is_ok());d.end=Some("2026-09-27".into());assert!(validate(&d).is_err());d.kind="task".into();d.start=None;d.end=None;assert!(validate(&d).is_ok());d.title.clear();assert!(validate(&d).is_err());}}
#[tauri::command]
pub async fn calendar_task_complete(app:AppHandle,account_id:String,collection_id:String,id:String,completed:bool)->Result<(),String>{
 let _g=LOCK.lock().await;let mut store=load(&app)?;let a=store.accounts.iter_mut().find(|a|a.id==account_id).ok_or("Account removed")?;
 if a.provider!="google"||!a.collections.iter().any(|c|c.id==collection_id&&c.kind=="task"&&c.writable&&c.items.iter().any(|i|i.id==id)){return Err("Task is read-only or no longer available".into());}
 google::token(a).await?;google::complete(a,&collection_id,&id,completed).await?;
 if let Some(item)=a.collections.iter_mut().find(|c|c.id==collection_id&&c.kind=="task").and_then(|c|c.items.iter_mut().find(|i|i.id==id)){item.completed=completed;}
 save(&app,&store)?;let _=app.emit("calendars-changed",());Ok(())
}
#[tauri::command]
pub async fn calendar_collection_enabled(app:AppHandle,account_id:String,collection_id:String,kind:String,enabled:bool)->Result<(),String>{let _g=LOCK.lock().await;let mut store=load(&app)?;let c=store.accounts.iter_mut().find(|a|a.id==account_id).and_then(|a|a.collections.iter_mut().find(|c|c.id==collection_id&&c.kind==kind)).ok_or("Calendar removed")?;c.enabled=enabled;save(&app,&store)?;let _=app.emit("calendars-changed",());Ok(())}



#[cfg(test)]
mod boundary_tests {
 use super::*;
 #[test]
 fn compares_absolute_times_and_rejects_impossible_dates(){
  let mut d=Draft{request_id:uuid::Uuid::new_v4().to_string(),account_id:"a".into(),collection_id:"b".into(),kind:"event".into(),title:"Test".into(),description:String::new(),start:Some("2026-09-28T12:00:00+03:00".into()),end:Some("2026-09-28T10:00:00Z".into()),all_day:false};
  assert!(validate(&d).is_ok());d.end=Some("2026-09-28T08:00:00Z".into());assert!(validate(&d).is_err());d.all_day=true;d.start=Some("2026-02-30".into());d.end=Some("2026-03-02".into());assert!(validate(&d).is_err());
 }
 #[test]
 fn provider_ids_cannot_add_query_or_path_segments(){
  assert_eq!(segment("id/with?query#hash"),"id%2Fwith%3Fquery%23hash");
 }
}
