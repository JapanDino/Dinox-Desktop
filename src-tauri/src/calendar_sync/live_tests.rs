//! Explicit, ignored live checks. Never run as part of the normal test suite.
use super::*;
fn directory() -> std::path::PathBuf {
    assert_eq!(std::env::var("DINOX_LIVE_TEST").as_deref(), Ok("google"), "Explicit live-test opt-in required");
    std::path::PathBuf::from(std::env::var("LOCALAPPDATA").unwrap()).join("Dinox/publisher/live-test")
}
fn read_account() -> Account {
    let bytes = std::fs::read(directory().join("account.dpapi")).expect("Complete live_google_login first");
    serde_json::from_slice(&crate::calendar::protect(&bytes, false).unwrap()).unwrap()
}
fn write_account(account: &Account) {
    let bytes = serde_json::to_vec(account).unwrap();
    std::fs::write(directory().join("account.dpapi"), crate::calendar::protect(&bytes, true).unwrap()).unwrap();
}
#[test]
#[ignore = "Requires explicit Google consent in a browser"]
fn live_google_login() {
    let dir = directory();
    std::fs::create_dir_all(&dir).unwrap();
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        let mut account = google::authorize_with_browser(String::new(), String::new(), |url| {
            std::fs::write(dir.join("authorize-url.txt"), url).map_err(|_| "Cannot save sign-in link".to_owned())?;
            println!("Google sign-in ready; open the private authorize-url.txt link in a browser.");
            Ok(())
        }, Duration::from_secs(900)).await.expect("Google authorization failed");
        write_account(&account);
        google::refresh(&mut account).await.expect("Reading Google calendars/tasks failed");
        write_account(&account);
        std::fs::write(dir.join("login-result.json"), json!({"authorized":true,"read_calendars_and_tasks":true,"dpapi_saved":true}).to_string()).unwrap();
        println!("PASS: native OAuth, Calendar/Tasks read and DPAPI persistence. No user data logged.");
    });
}
#[test]
#[ignore = "Creates and deletes explicitly labelled test entries in the connected Google account"]
fn live_google_roundtrip() {
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        let mut account = read_account();
        account.expires = 0;
        google::token(&mut account).await.expect("Refresh token failed");
        google::refresh(&mut account).await.expect("Refresh after restart failed");
        let calendar = account.collections.iter().find(|c| c.kind == "event" && c.writable && c.id == account.username).expect("No writable primary calendar").id.clone();
        let tasks = account.collections.iter().find(|c| c.kind == "task" && c.writable).expect("No writable task list").id.clone();
        let run = uuid::Uuid::new_v4().simple().to_string();
        let tomorrow = chrono::Utc::now().date_naive() + chrono::Duration::days(1);
        let day_after = tomorrow + chrono::Duration::days(1);
        let specifications = [
            ("event", false, Some(format!("{tomorrow}T12:00:00+03:00")), Some(format!("{tomorrow}T12:30:00+03:00")), "timed event"),
            ("event", true, Some(tomorrow.to_string()), Some(day_after.to_string()), "all-day event"),
            ("task", true, Some(tomorrow.to_string()), None, "dated task"),
            ("task", true, None, None, "undated task"),
        ];
        let mut created: Vec<(String,String)> = vec![];
        let mut checks = vec!["refresh_token_and_restart".to_owned()];
        let outcome: Result<(),String> = async {
            for (kind,all_day,start,end,label) in specifications {
                let collection = if kind == "event" { &calendar } else { &tasks };
                let draft = Draft { request_id:uuid::Uuid::new_v4().to_string(),account_id:account.id.clone(),collection_id:collection.clone(),kind:kind.into(),title:format!("[Dinox TEST {run}] {label}"),description:"Temporary Dinox integration check; safe to delete.".into(),start:start.clone(),end:end.clone(),all_day };
                validate(&draft)?;
                let id = google::create(&account,&draft).await?;
                let base = if kind == "event" {format!("https://www.googleapis.com/calendar/v3/calendars/{}/events",segment(collection))} else {format!("https://tasks.googleapis.com/tasks/v1/lists/{}/tasks",segment(collection))};
                let url = format!("{}/{}",base,segment(&id));
                created.push((id.clone(),url.clone()));
                // Keep an encrypted cleanup journal even if this test is interrupted.
                std::fs::write(directory().join("created.dpapi"),crate::calendar::protect(&serde_json::to_vec(&created).unwrap(),true)?).map_err(|_|"Cannot save cleanup journal")?;
                let read = json_response(client()?.get(&url).bearer_auth(&account.access).send().await.map_err(|_|"Read-back failed")?).await?;
                let title_key = if kind == "event" {"summary"} else {"title"};
                if read[title_key] != draft.title { return Err(format!("{label}: title mismatch")); }
                if kind == "event" && all_day {
                    if read["start"]["date"].as_str()!=start.as_deref() || read["end"]["date"].as_str()!=end.as_deref() { return Err("All-day boundaries mismatch".into()); }
                } else if kind == "event" {
                    for (field,expected) in [("start",start.as_ref().unwrap()),("end",end.as_ref().unwrap())] {
                        let actual=read[field]["dateTime"].as_str().ok_or("Missing event time")?;
                        if chrono::DateTime::parse_from_rfc3339(actual).map_err(|_|"Invalid returned time")? != chrono::DateTime::parse_from_rfc3339(expected).unwrap() {return Err("Timed event offset mismatch".into());}
                    }
                } else {
                    if read["due"].as_str().map(|s|s.chars().take(10).collect::<String>()) != start { return Err("Task date mismatch".into()); }
                    for completed in [true,false] {
                        google::complete(&account,collection,&id,completed).await?;
                        let read=json_response(client()?.get(&url).bearer_auth(&account.access).send().await.map_err(|_|"Task status read failed")?).await?;
                        if (read["status"]=="completed")!=completed {return Err("Task completion mismatch".into());}
                    }
                }
                checks.push(label.to_owned());
            }
            Ok(())
        }.await;
        let mut cleanup_errors = 0;
        for (_,url) in &created {
            match client().unwrap().delete(url).bearer_auth(&account.access).send().await {
                Ok(r) if r.status().is_success() || r.status().as_u16()==404 || r.status().as_u16()==410 => {},
                _ => cleanup_errors+=1,
            }
        }
        write_account(&account);
        let report=json!({"checks":checks,"passed":outcome.is_ok(),"error":outcome.as_ref().err(),"created":created.len(),"cleanup_failures":cleanup_errors});
        std::fs::write(directory().join("roundtrip-result.json"),report.to_string()).unwrap();
        println!("{}",report);
        assert_eq!(cleanup_errors,0,"Cleanup incomplete; encrypted journal retained");
        assert!(outcome.is_ok(),"Native Google roundtrip failed; see safe report");
    });
}

#[test]
#[ignore = "Read-only verification of previously created test IDs"]
fn live_google_verify_cleanup() {
    tokio::runtime::Runtime::new().unwrap().block_on(async {
        let mut account=read_account();
        google::token(&mut account).await.unwrap();
        let journal=std::fs::read(directory().join("created.dpapi")).unwrap();
        let created:Vec<(String,String)>=serde_json::from_slice(&crate::calendar::protect(&journal,false).unwrap()).unwrap();
        let mut verified=0;
        for (_,url) in &created {
            let parsed=reqwest::Url::parse(url).unwrap();
            assert!(matches!(parsed.host_str(),Some("www.googleapis.com"|"tasks.googleapis.com")) && parsed.scheme()=="https");
            let response=client().unwrap().get(url).bearer_auth(&account.access).send().await.unwrap();
            if matches!(response.status().as_u16(),404|410) { verified+=1; continue; }
            let item=json_response(response).await.unwrap();
            assert!(item["status"]=="cancelled" || item["deleted"]==true,"A test entry is still active");
            verified+=1;
        }
        std::fs::write(directory().join("cleanup-result.json"),json!({"verified_deleted":verified,"expected":created.len()}).to_string()).unwrap();
        println!("PASS: {verified} test entries confirmed removed by independent GET requests.");
    });
}
