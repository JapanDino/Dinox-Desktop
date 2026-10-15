export async function verifyNotificationPolicy(page, base='http://127.0.0.1:1440') {
 const checks=[];const assert=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const context=await page.context().browser().newContext({viewport:{width:1280,height:800}});
 const test=await context.newPage();
 try {
  await context.addInitScript(()=>{const settings={'bloom-language':'en','bloom-first-run':'false','bloom-notch-mode':'fixed','bloom-notifications':JSON.stringify({enabled:true,windowsEnabled:true,duration:20}),'dinox-do-not-disturb':'true'};for(const [key,value] of Object.entries(settings))localStorage.setItem(key,value);localStorage.setItem('dinox-v4-demo-settings',JSON.stringify(settings));});
  await test.goto(`${base}/personal-preview.html?app&notifications-allowed`);await test.locator('.bloom').waitFor();await test.waitForTimeout(1600);
  await test.evaluate(()=>{const original=window.__TAURI_INTERNALS__.invoke;window.__TAURI_INTERNALS__.invoke=(command,args,...rest)=>{if(command==='plugin:event|emit'&&args.event==='bloom-notification-count')window.__unreadNoticeCount=args.payload;return original(command,args,...rest);};for(let i=0;i<15;i++)window.previewSend();});
  await test.waitForTimeout(450);
  assert(await test.locator('.bloom-notifications').count()===0,'Persisted DND suppresses automatic banners');
  await test.evaluate(()=>window.previewEmit('bloom-open-notifications',null));await test.getByRole('dialog',{name:'Notifications',exact:true}).waitFor();
  await test.waitForFunction(()=>window.__unreadNoticeCount>0&&window.__unreadNoticeCount<15);
  assert(await test.locator('.notice-card').count()===15,'DND retains explicitly opened history');
  // Finish expansion and continuous-visibility read dwell before measuring
  // whether closing itself reads entries outside the viewport.
  await test.waitForTimeout(600);
  const unread=await test.evaluate(()=>window.__unreadNoticeCount);assert(unread>0 && unread<15,'Only viewport-visible history entries become read');
  await test.getByRole('button',{name:'Close notifications',exact:true}).click();await test.locator('.bloom-notifications').waitFor({state:'hidden'});
  assert(await test.evaluate(()=>window.__unreadNoticeCount)===unread,'Closing history does not read unseen entries');
  await test.evaluate(async()=>{await window.__TAURI_INTERNALS__.invoke('save_setting',{key:'dinox-do-not-disturb',value:'false'});});
  await test.waitForTimeout(150);await test.evaluate(()=>window.previewSend());
  await test.waitForTimeout(450);await test.locator('.bloom-notifications').waitFor();
  await test.getByRole('button',{name:'Dismiss notification from Telegram',exact:true}).click();await test.locator('.bloom-notifications').waitFor({state:'hidden'});
  await test.evaluate(()=>window.previewEmit('bloom-open-notifications',null));await test.locator('.bloom-notifications').waitFor();
  assert(await test.locator('.notice-card').count()===16,'Closing a banner retains the notification in history');
  await test.getByRole('button',{name:'Hide from Dinox history: Telegram',exact:true}).first().click();await test.waitForTimeout(250);
  assert(await test.evaluate(()=>window.previewNotices().length)===16,'Local history dismissal leaves Windows snapshot untouched');
  await test.getByRole('button',{name:'Close notifications',exact:true}).click();await test.locator('.bloom-notifications').waitFor({state:'hidden'});await test.mouse.move(30,600);
  await test.evaluate(()=>{
   const original=window.__TAURI_INTERNALS__.invoke;
   const timestamp=value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');const start=Date.now()+60000;
   const source={id:'reminder-fixture',name:'Fixture',color:'#b7a6ff',enabled:true,ics:['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:reminder-fixture','DTSTART:'+timestamp(start),'DTEND:'+timestamp(start+3600000),'SUMMARY:Browser reminder','END:VEVENT','END:VCALENDAR'].join('\r\n'),checked:Date.now()/1000};
   window.__TAURI_INTERNALS__.invoke=(command,args,...rest)=>command==='calendar_list'?Promise.resolve([source]):command==='calendar_accounts'?Promise.resolve([]):original(command,args,...rest);
   window.previewMedia(true,'Music alongside reminder');window.previewEmit('calendars-changed',null);
  });
  await test.locator('.cal-reminder').waitFor();
  // The calendar translation is checked through the card's close button, independent of language wording.
  const closeReminder=test.locator('.cal-reminder .cal-icon-button').first();
  for(const scale of ['1','2']) {
   await test.evaluate(scale=>window.__TAURI_INTERNALS__.invoke('save_setting',{key:'bloom-scale',value:scale}),scale);await test.waitForTimeout(450);
   const island=await test.locator('.bloom').boundingBox(), close=await closeReminder.boundingBox();
   assert(close && island && close.x>=island.x && close.y>=island.y && close.x+close.width<=island.x+island.width+1 && close.y+close.height<=island.y+island.height+1,`Reminder close fits island with music at scale ${scale}`);
  }
  await closeReminder.focus();await closeReminder.press('Escape');await test.locator('.cal-reminder').waitFor({state:'hidden'});assert(true,'Escape dismisses reminder while music is playing');
  await test.evaluate(async()=>{const {mountReminderTest}=await import('/tests/notification-hooks.tsx');const now=Date.now();const event={id:'same',uid:'same',sourceId:'fixture',title:'First',start:now+60000,end:now+3600000,allDay:false,location:'',description:'',url:'',meeting:'',color:'#ffffff',sourceName:'Fixture'};mountReminderTest([event,{...event,title:'Second',start:now+120000}]);const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='bloom-calendar-dismissed')throw Error('Storage unavailable');return original.call(this,key,value);};});
  const harness=test.getByRole('region',{name:'Reminder test',exact:true});await test.getByText('First',{exact:true}).waitFor();
  await test.getByRole('button',{name:'Dismiss reminder',exact:true}).click();await test.getByText('Second',{exact:true}).waitFor();assert(true,'Storage rejection cannot block occurrence dismissal or queue progression');
  await test.getByRole('button',{name:'DND test',exact:true}).click();await test.getByText('none',{exact:true}).waitFor();assert(true,'DND suppresses active reminders');
  await test.getByRole('button',{name:'DND test',exact:true}).click();await test.getByText('Second',{exact:true}).waitFor();assert(await harness.count()===1,'Undismissed reminder is available after DND ends');
  return checks;
 }finally{await context.close();}
}
