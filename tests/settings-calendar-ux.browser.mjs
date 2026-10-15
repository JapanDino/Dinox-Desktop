/** All mutations target synthetic fixture state, never real subscriptions or Windows. */
export async function verifySettingsCalendarUX(page,base='http://127.0.0.1:1440') {
 const checks=[];const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 for(const language of ['ru','en']) {
  const context=await page.context().browser().newContext({viewport:{width:360,height:800}});const test=await context.newPage();
  try {
   await context.addInitScript(language=>{const settings={'bloom-language':language,'bloom-weather-city':'Demo city'};for(const[k,v]of Object.entries(settings))localStorage.setItem(k,v);localStorage.setItem('dinox-v4-demo-settings',JSON.stringify(settings));},language);
   await test.goto(`${base}/personal-preview.html?settings`);await test.locator('.sidebar-tab').first().waitFor();
   const tabs=test.locator('.sidebar-tab');
   for(let i=0;i<await tabs.count();i++) {
    await tabs.nth(i).click();
    const unnamed=await test.evaluate(()=>[...document.querySelectorAll('.settings-content input,.settings-content select,.settings-content textarea')].filter(el=>el.type!=='hidden'&&!el.getAttribute('aria-label')&&!el.getAttribute('aria-labelledby')&&!el.closest('label')?.textContent.trim()).map(el=>el.type));
    check(!unnamed.length,`${language} tab ${i}: every control has a name`);
   }
   await tabs.nth(4).click();
   const compact=test.locator('.unit-toggle-minimal.wide button').last();await compact.focus();await compact.press('Enter');await test.waitForFunction(()=>window.previewSettings['bloom-media-layout']==='compact');check(await compact.getAttribute('aria-pressed')==='true',`${language}: media choice works with keyboard`);
   const fahrenheit=test.getByRole('button',{name:language==='ru'?'Градусы Фаренгейта':'Fahrenheit',exact:true});await fahrenheit.focus();await fahrenheit.press('Space');await test.waitForFunction(()=>window.previewSettings['bloom-temp-unit']==='fahrenheit');check(await fahrenheit.getAttribute('aria-pressed')==='true',`${language}: temperature choice works with keyboard`);
   await test.locator('.city-clear-btn').focus();await test.locator('.city-clear-btn').press('Enter');await test.waitForFunction(()=>window.previewSettings['bloom-weather-city']===null);check(await test.locator('.city-input-row input').inputValue()==='',`${language}: city clear works with keyboard`);
   await test.getByRole('combobox',{name:language==='ru'?'Расположение острова':'Island position',exact:true}).selectOption('left');
   await test.locator('.setting-item').filter({has:test.locator('select')}).first().locator('select').selectOption('hover');
   await test.waitForFunction(()=>window.previewSettings['bloom-notch-mode']==='hover');check((await test.locator('.panel-mode-hint').textContent()).includes(language==='ru'?'левого':'left'),`${language}: hover instructions follow selected edge`);
   await test.evaluate(()=>{const original=window.__TAURI_INTERNALS__.invoke;window.__removeCalls=0;window.__failRemoval=true;window.__TAURI_INTERNALS__.invoke=(command,args,...rest)=>{if(command==='calendar_remove'){window.__removeCalls++;if(window.__failRemoval){window.__failRemoval=false;return Promise.reject('Test disconnect failure');}}return original(command,args,...rest);};});
   const remove=test.locator('.cal-source-row .cal-icon-button').first();await remove.click();const dialog=test.locator('.cal-confirm-dialog');await dialog.waitFor();check(await test.evaluate(()=>window.__removeCalls)===0,`${language}: removal requires explicit confirmation`);
   await test.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});check(await remove.evaluate(el=>el===document.activeElement),`${language}: cancel restores focus and preserves subscriptions`);
   await remove.click();const confirm=dialog.getByRole('button',{name:language==='ru'?'Отключить подписку':'Disconnect subscription',exact:true});await confirm.click();await dialog.getByRole('alert').waitFor();check(await test.locator('.cal-source-row').count()===3,`${language}: failed removal preserves all subscriptions`);
   await test.screenshot({path:`output/playwright/settings-calendar-confirm-${language}.png`});
   await confirm.click();await dialog.waitFor({state:'hidden'});check(await test.locator('.cal-source-row').count()===2,`${language}: retry removes only the confirmed synthetic subscription`);
   await test.waitForTimeout(40);check(await test.locator('.cal-source-name').first().evaluate(el=>el===document.activeElement),`${language}: successful removal focuses the remaining list`);
   check(await test.evaluate(()=>document.documentElement.scrollWidth===innerWidth),`${language}: narrow settings stay within viewport`);
   await test.screenshot({path:`output/playwright/settings-calendar-ux-after-${language}.png`});
  } finally {await context.close();}
 }
 {
  const context=await page.context().browser().newContext({viewport:{width:1024,height:600},timezoneId:'Asia/Tokyo'});const test=await context.newPage();
  try {
   await context.addInitScript(()=>localStorage.setItem('bloom-language','en'));
   await test.clock.install({time:new Date('2026-10-12T08:45:00Z')});
   await test.goto(`${base}/personal-preview.html?calendar-sync`);await test.locator('.cs-new').click();const dialog=test.locator('.cs-composer');await dialog.waitFor();
   check(await dialog.locator('input[type=time]').first().inputValue()==='18:00','Today defaults to the next future half-hour in the user timezone');
   check(await dialog.locator('input[type=date]').first().inputValue()==='2026-10-12','Date uses local calendar day rather than UTC truncation');
   await dialog.locator('.cs-quick-title').fill('Timezone test');await dialog.locator('.cs-details-toggle').click();await dialog.locator('.cs-primary').scrollIntoViewIfNeeded();
   await dialog.locator('.cs-primary').focus();await test.keyboard.press('Tab');check(await dialog.locator('.cs-quick-close').evaluate(el=>el===document.activeElement),'Expanded composer retains keyboard focus');
   await test.keyboard.press('Escape');check(await test.locator('.cs-new').evaluate(el=>el===document.activeElement),'Composer cancellation restores trigger focus');
  } finally {await context.close();}
 }
 return checks;
}
