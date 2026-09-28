use super::*;
use base64::{Engine,engine::general_purpose::URL_SAFE_NO_PAD};
use sha2::{Digest,Sha256};
use std::io::{Read,Write};
const SCOPES: [&str; 3] = ["https://www.googleapis.com/auth/calendar.calendarlist.readonly", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/tasks"];
fn oauth_error(status:u16,body:&Value)->String{
 match body["error"].as_str(){
  Some("invalid_grant")=>"Google access expired or was revoked. Reconnect your account.".into(),
  Some("invalid_client"|"unauthorized_client")=>"Google rejected the publisher configuration.".into(),
  Some("access_denied")=>"Google sign-in was declined.".into(),
  _=>format!("Calendar service HTTP {status}. Try again later.")
 }
}
fn check_scopes(value:&Value)->Result<(),String>{
 // OAuth permits an omitted scope field when it is identical to the requested set.
 if let Some(granted)=value["scope"].as_str(){if SCOPES.iter().any(|scope|!granted.split_whitespace().any(|s|s==*scope)){return Err("Missing Google permissions. Reconnect and allow calendar lists, events and tasks.".into());}}
 Ok(())
}
async fn form(path:&str,pairs:&[(&str,&str)])->Result<Value,String>{
 let encoded=reqwest::Url::parse_with_params("https://example.com",pairs).unwrap().query().unwrap_or("").to_owned();
 let mut response=client()?.post(path).header("Content-Type","application/x-www-form-urlencoded").body(encoded).send().await.map_err(|_|"Google connection failed")?;
 if response.status().is_success(){return json_response(response).await;}
 let status=response.status().as_u16();let mut bytes=Vec::new();
 while let Some(chunk)=response.chunk().await.map_err(|_|"Google connection failed")?{if bytes.len()+chunk.len()>16384{break;}bytes.extend_from_slice(&chunk);}
 // Never forward provider text, which can include private request details.
 Err(oauth_error(status,&serde_json::from_slice(&bytes).unwrap_or(Value::Null)))
}
pub async fn authorize(app:&AppHandle,client_id:String,client_secret:String)->Result<Account,String>{
 use tauri_plugin_opener::OpenerExt;
 authorize_with_browser(client_id,client_secret,|url|app.opener().open_url(url,None::<&str>).map_err(|_|"Cannot open Google sign-in".to_owned()),Duration::from_secs(180)).await
}
pub(super) async fn authorize_with_browser<F:FnOnce(&str)->Result<(),String>>(client_id:String,client_secret:String,open:F,timeout:Duration)->Result<Account,String>{
 let client_id=if client_id.is_empty(){option_env!("DINOX_GOOGLE_CLIENT_ID").unwrap_or("").to_owned()}else{client_id};let client_secret=if client_secret.is_empty(){option_env!("DINOX_GOOGLE_CLIENT_SECRET").unwrap_or("").to_owned()}else{client_secret};
 if !client_id.ends_with(".apps.googleusercontent.com")||client_id.len()>256||client_secret.is_empty(){return Err("Google sign-in is not configured in this Dinox build. The publisher must register its OAuth application.".into());}
 let listener=std::net::TcpListener::bind("127.0.0.1:0").map_err(|_|"Cannot start local sign-in callback")?;listener.set_nonblocking(true).map_err(|_|"Cannot start sign-in")?;
 let redirect=format!("http://127.0.0.1:{}/",listener.local_addr().map_err(|_|"Cannot bind callback")?.port());
 let state=uuid::Uuid::new_v4().to_string();let verifier=format!("{}{}",uuid::Uuid::new_v4().simple(),uuid::Uuid::new_v4().simple());let challenge=URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
 let url=reqwest::Url::parse_with_params("https://accounts.google.com/o/oauth2/v2/auth",&[("client_id",client_id.as_str()),("redirect_uri",redirect.as_str()),("response_type","code"),("scope","https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks"),("state",state.as_str()),("code_challenge",challenge.as_str()),("code_challenge_method","S256"),("access_type","offline"),("prompt","consent select_account")]).unwrap();
 open(url.as_str())?;
 let code=tauri::async_runtime::spawn_blocking(move||->Result<String,String>{let deadline=std::time::Instant::now()+timeout;while std::time::Instant::now()<deadline{if super::cancelled(){return Err("Sign-in cancelled".into());}match listener.accept(){Ok((mut stream,_))=>{let _=stream.set_read_timeout(Some(Duration::from_secs(2)));let mut bytes=[0u8;8192];let len=stream.read(&mut bytes).unwrap_or(0);let request=String::from_utf8_lossy(&bytes[..len]);let path=request.lines().next().and_then(|line|line.strip_prefix("GET ")).and_then(|line|line.split(' ').next()).unwrap_or("");let parsed=reqwest::Url::parse(&format!("http://localhost{path}"));let pairs=parsed.as_ref().ok().map(|u|u.query_pairs().into_owned().collect::<std::collections::HashMap<_,_>>()).unwrap_or_default();let valid=path.starts_with("/?")&&pairs.get("state")==Some(&state);let message=if valid{"Dinox: sign-in received. You can close this page."}else{"Invalid sign-in callback."};let _=write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",message.len(),message);if valid{return pairs.get("code").cloned().ok_or("Google sign-in was declined".into());}},Err(e)if e.kind()==std::io::ErrorKind::WouldBlock=>std::thread::sleep(Duration::from_millis(100)),Err(_)=>return Err("Sign-in callback failed".into())}}Err("Google sign-in timed out. Try again.".into())}).await.map_err(|_|"Sign-in interrupted")??;
 let v=form("https://oauth2.googleapis.com/token",&[("client_id",&client_id),("client_secret",&client_secret),("code",&code),("code_verifier",&verifier),("redirect_uri",&redirect),("grant_type","authorization_code")]).await?;
 check_scopes(&v)?;
 if super::cancelled(){return Err("Sign-in cancelled".into());}
 let access=v["access_token"].as_str().ok_or("Google did not grant access")?.to_owned();let refresh=v["refresh_token"].as_str().ok_or("Google did not grant offline access; reconnect")?.to_owned();
 Ok(Account{id:uuid::Uuid::new_v4().to_string(),provider:"google".into(),label:"Google".into(),username:String::new(),secret:String::new(),client_id,client_secret,refresh,access,expires:now()+v["expires_in"].as_u64().unwrap_or(3600),collections:vec![]})
}
pub async fn token(a:&mut Account)->Result<(),String>{if a.expires>now()+90{return Ok(());}let v=form("https://oauth2.googleapis.com/token",&[("client_id",&a.client_id),("client_secret",&a.client_secret),("refresh_token",&a.refresh),("grant_type","refresh_token")]).await?;a.access=v["access_token"].as_str().ok_or("Google access expired. Reconnect your account.")?.into();if let Some(refresh)=v["refresh_token"].as_str(){a.refresh=refresh.into();}a.expires=now()+v["expires_in"].as_u64().unwrap_or(3600);Ok(())}
async fn list(a:&Account,path:&str,params:&[(&str,String)])->Result<Vec<Value>,String>{let mut result=vec![];let mut page=String::new();for _ in 0..200{let mut p=params.to_vec();if !page.is_empty(){p.push(("pageToken",page));}let u=reqwest::Url::parse_with_params(path,p).map_err(|_|"Invalid API URL")?;let v=json_response(client()?.get(u).bearer_auth(&a.access).send().await.map_err(|_|"Google is offline; cached entries are unchanged")?).await?;if let Some(items)=v["items"].as_array(){result.extend(items.iter().cloned());}if result.len()>15000{return Err("Too many calendar entries".into());}page=v["nextPageToken"].as_str().unwrap_or("").into();if page.is_empty(){return Ok(result);}}Err("Calendar pagination limit exceeded".into())}
fn s(v:&Value,key:&str)->String{v[key].as_str().unwrap_or("").to_owned()}
pub async fn refresh(a:&mut Account)->Result<(),String>{
 token(a).await?;let mut collections=vec![];
 let calendars=list(a,"https://www.googleapis.com/calendar/v3/users/me/calendarList",&[("maxResults","250".into())]).await?;
 for c in calendars{let id=s(&c,"id");let min=(chrono::Utc::now()-chrono::Duration::days(366)).to_rfc3339();let max=(chrono::Utc::now()+chrono::Duration::days(732)).to_rfc3339();let rows=list(a,&format!("https://www.googleapis.com/calendar/v3/calendars/{}/events",segment(&id)),&[("singleEvents","true".into()),("timeMin",min),("timeMax",max),("maxResults","2500".into())]).await?;
 if c["primary"].as_bool()==Some(true){a.label=s(&c,"summary");a.username=id.clone();}
 let items=rows.into_iter().filter(|v|v["status"]!="cancelled").map(|v|Item{id:s(&v,"id"),title:s(&v,"summary"),start:v["start"]["dateTime"].as_str().or(v["start"]["date"].as_str()).map(str::to_owned),end:v["end"]["dateTime"].as_str().or(v["end"]["date"].as_str()).map(str::to_owned),all_day:v["start"]["date"].is_string(),task:false,completed:false,description:s(&v,"description"),url:s(&v,"htmlLink")}).collect();collections.push(Collection{id,name:s(&c,"summary"),kind:"event".into(),writable:matches!(c["accessRole"].as_str(),Some("owner"|"writer")),enabled:true,ics:String::new(),items,checked:now()});}
 for c in list(a,"https://tasks.googleapis.com/tasks/v1/users/@me/lists",&[("maxResults","100".into())]).await?{let id=s(&c,"id");let rows=list(a,&format!("https://tasks.googleapis.com/tasks/v1/lists/{}/tasks",segment(&id)),&[("maxResults","100".into()),("showCompleted","true".into()),("showHidden","true".into()),("showAssigned","true".into())]).await?;let items=rows.into_iter().filter(|v|v["deleted"]!=true).map(|v|Item{id:s(&v,"id"),title:s(&v,"title"),start:v["due"].as_str().map(|s|s.chars().take(10).collect()),end:None,all_day:true,task:true,completed:v["status"]=="completed",description:s(&v,"notes"),url:s(&v,"webViewLink")}).collect();collections.push(Collection{id,name:s(&c,"title"),kind:"task".into(),writable:true,enabled:true,ics:String::new(),items,checked:now()});}
 for c in &mut collections{if let Some(old)=a.collections.iter().find(|old|old.id==c.id&&old.kind==c.kind){c.enabled=old.enabled;}}a.collections=collections;Ok(())
}
pub async fn create(a:&Account,d:&Draft)->Result<String,String>{let body=if d.kind=="task"{let mut v=json!({"title":d.title,"notes":d.description});if let Some(date)=&d.start{v["due"]=json!(format!("{date}T00:00:00.000Z"));}v}else{let key=if d.all_day{"date"}else{"dateTime"};let mut start=serde_json::Map::new();start.insert(key.into(),json!(d.start));let mut end=serde_json::Map::new();end.insert(key.into(),json!(d.end));json!({"id":d.request_id.replace('-',""),"summary":d.title,"description":d.description,"start":start,"end":end})};
 let url=if d.kind=="task"{format!("https://tasks.googleapis.com/tasks/v1/lists/{}/tasks",segment(&d.collection_id))}else{format!("https://www.googleapis.com/calendar/v3/calendars/{}/events",segment(&d.collection_id))};
 let r=client()?.post(url).bearer_auth(&a.access).header("Content-Type","application/json").body(body.to_string()).send().await.map_err(|_|"Creation result is uncertain. Refresh and check the original calendar before creating again.")?;
 if r.status().is_client_error()&&r.status().as_u16()!=408{return Err(format!("Rejected: Google HTTP {}. Check calendar permissions.",r.status().as_u16()));}let v=json_response(r).await?;v["id"].as_str().map(str::to_owned).ok_or("Creation result is uncertain; refresh the source calendar".into())
}
pub async fn complete(a:&Account,collection:&str,id:&str,completed:bool)->Result<(),String>{
 let url=format!("https://tasks.googleapis.com/tasks/v1/lists/{}/tasks/{}",segment(collection),segment(id));
 let v=json_response(client()?.get(&url).bearer_auth(&a.access).send().await.map_err(|_|"Cannot read task; retry when online")?).await?;
 let body=if completed{json!({"status":"completed"})}else{json!({"status":"needsAction","completed":null})};
 let mut r=client()?.patch(url).bearer_auth(&a.access).header("Content-Type","application/json").body(body.to_string());if let Some(etag)=v["etag"].as_str(){r=r.header("If-Match",etag);}
 json_response(r.send().await.map_err(|_|"Task result is uncertain; refresh to check its status")?).await?;Ok(())
}

#[cfg(test)] mod production_tests {
 use super::*;
 #[test] fn partial_consent_is_actionable_before_calendar_requests(){
  assert!(check_scopes(&json!({"scope":SCOPES.join(" ")})).is_ok());
  assert!(check_scopes(&json!({})).is_ok());
  assert!(check_scopes(&json!({"scope":SCOPES[0]})).unwrap_err().contains("Missing Google permissions"));
  assert!(check_scopes(&json!({"scope":""})).is_err());
 }
 #[test] fn oauth_failures_do_not_expose_provider_descriptions(){
  let expired=oauth_error(400,&json!({"error":"invalid_grant","error_description":"PRIVATE"}));
  assert!(expired.contains("Reconnect"));assert!(!expired.contains("PRIVATE"));
  assert!(oauth_error(401,&json!({"error":"invalid_client"})).contains("publisher configuration"));
  assert!(oauth_error(503,&json!({"error_description":"PRIVATE"})).contains("HTTP 503"));
 }
}
