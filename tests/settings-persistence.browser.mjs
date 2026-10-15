/** Isolated browser fixtures only: never modifies Windows settings or accounts. */
export async function verifySettingsPersistence(page, base = 'http://127.0.0.1:1440') {
 const results=[]; const assert=(ok,label)=>{if(!ok)throw Error(label);results.push(label);};
 for(const mode of ['failure','pending','autostart']) {
  const context=await page.context().browser().newContext({viewport:{width:1100,height:850}});
  const test=await context.newPage();
  try {
   await context.addInitScript(()=>{localStorage.setItem('bloom-language','en');localStorage.setItem('bloom-time-format-24h','false');localStorage.setItem('dinox-v4-demo-settings',JSON.stringify({'bloom-language':'en','bloom-time-format-24h':'false'}));});
   await test.goto(`${base}/personal-preview.html?settings${mode==='failure'?'&save-error':''}`);
   const clock=test.getByRole('group',{name:'24-Hour Time',exact:true}); await clock.waitFor();
   const toggle=clock.locator('input[type=checkbox]');
   if(mode==='failure') {
    await clock.locator('label.toggle-switch').click(); await test.getByRole('alert').filter({hasText:'Could not apply the setting'}).waitFor();
    assert(!await toggle.isChecked(),'Rejected save leaves control unchanged');
    assert(await test.evaluate(()=>localStorage.getItem('bloom-time-format-24h'))==='false','Rejected save leaves local cache unchanged');
    assert(await test.evaluate(()=>document.documentElement.dataset.savedSetting)===undefined,'Rejected save broadcasts no success');
    await test.evaluate(()=>history.replaceState(null,'','?settings')); await test.getByRole('button',{name:'Retry',exact:true}).click();
    await test.waitForFunction(()=>localStorage.getItem('bloom-time-format-24h')==='true');
    assert(await toggle.isChecked(),'Retry applies confirmed value'); assert(await test.getByRole('alert').count()===0,'Successful retry dismisses error');
   } else if(mode==='pending') {
    await test.evaluate(()=>{const original=window.__TAURI_INTERNALS__.invoke;window.__TAURI_INTERNALS__.invoke=async(command,args,...rest)=>{if(command==='save_setting'&&args.key==='bloom-time-format-24h')await new Promise(resolve=>{window.__settingsRelease=resolve;});return original(command,args,...rest);};});
    await clock.locator('label.toggle-switch').click(); await test.getByRole('status').filter({hasText:'Saving…'}).waitFor();
    assert(!await toggle.isChecked(),'Pending save does not pretend control is confirmed');
    assert(await test.evaluate(()=>localStorage.getItem('bloom-time-format-24h'))==='false','Pending save does not mutate cache');
    assert(await test.evaluate(()=>document.documentElement.dataset.savedSetting)===undefined,'Pending save emits no early success');
    await test.evaluate(()=>window.__settingsRelease()); await test.waitForFunction(()=>localStorage.getItem('bloom-time-format-24h')==='true');
    assert(await toggle.isChecked(),'IPC confirmation applies value');
   } else {
    await test.evaluate(()=>{const original=window.__TAURI_INTERNALS__.invoke;window.__TAURI_INTERNALS__.invoke=(command,args,...rest)=>command==='plugin:autostart|enable'?Promise.reject('Autostart denied'):original(command,args,...rest);});
    const startup=test.getByRole('group',{name:'Launch at Login',exact:true}); await startup.locator('label.toggle-switch').click();
    await test.getByRole('alert').waitFor(); assert(!await startup.locator('input').isChecked(),'Autostart failure leaves confirmed state');
    assert(await test.getByRole('alert').textContent().then(v=>v.includes('Autostart denied')),'Autostart failures are visible and retryable');
   }
  } finally {await context.close();}
 }
 return results;
}
