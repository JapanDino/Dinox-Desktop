// Real App + notification hook with synthetic Windows events; no native launch.
async function verifyIslandNotices(page) {
  const checks=[];
  const check=(ok,name)=>{if(!ok)throw new Error(name);checks.push(name);};
  const context=await page.context().browser().newContext({viewport:{width:1280,height:800}});
  const test=await context.newPage();
  try {
    await test.addInitScript(()=>{
      localStorage.setItem('bloom-first-run','false');localStorage.setItem('bloom-app-version','4.1.0');
      const s={'bloom-language':'ru','bloom-notch-mode':'fixed','bloom-notifications':JSON.stringify({enabled:true,windowsEnabled:true,duration:4})};
      for(const [k,v] of Object.entries(s))localStorage.setItem(k,v);
      localStorage.setItem('dinox-v4-demo-settings',JSON.stringify(s));
    });
    await test.goto('http://127.0.0.1:1439/personal-preview.html?app');
    await test.locator('.bloom').waitFor();await test.waitForTimeout(2000);
    const send=()=>test.evaluate(()=>window.previewSend());
    const shown=()=>test.locator('.bloom-notifications').count();
    const height=()=>test.locator('.bloom').evaluate(el=>el.getBoundingClientRect().height);
    await test.mouse.move(640,140); // Popup opens under a stationary pointer.
    await send();await test.waitForTimeout(650);
    check(await shown()===1,'New message opens a popup');
    check(await height()>200,'Island expands for a popup');
    await test.waitForTimeout(4500);await test.waitForTimeout(650);
    await test.locator('.bloom-notifications').waitFor({state:'detached',timeout:3000});check(await shown()===0,'Stationary pointer cannot pause an arriving card');
    await test.mouse.move(30,600);await test.waitForTimeout(650);
    check(await height()<40,'Island returns to compact height');
    await send();await test.waitForTimeout(650);
    await test.mouse.move(650,140);await test.mouse.move(660,145);await test.waitForTimeout(4500);await test.waitForTimeout(650);
    check(await shown()===1,'Deliberate reading pauses normal expiry');
    await test.waitForTimeout(15000);await test.waitForTimeout(650);
    await test.locator('.bloom-notifications').waitFor({state:'detached',timeout:3000});check(await shown()===0,'Even a missing pointer leave expires within the hard limit');
    await test.mouse.move(30,600);await test.waitForTimeout(650);
    await send();await test.waitForTimeout(650);
    await test.getByRole('button',{name:'Все уведомления',exact:true}).click();
    await test.waitForTimeout(25000);
    check(await shown()===1,'Explicitly opened history stays available');
    await test.getByRole('button',{name:'Закрыть панель уведомлений',exact:true}).click();
    await test.mouse.move(30,600);await test.waitForTimeout(650);
    await test.locator('.bloom-notifications').waitFor({state:'detached',timeout:3000});check(await shown()===0,'History closes on demand');
    await send();await test.waitForTimeout(650);
    await test.getByRole('button',{name:'Скрыть уведомление Telegram',exact:true}).click();
    await test.waitForTimeout(650);
    await test.locator('.bloom-notifications').waitFor({state:'detached',timeout:3000});check(await shown()===0,'Dismiss removes a transient card');
    await test.mouse.move(30,600);await test.waitForTimeout(650);
    await test.getByRole('button',{name:'Открыть календарь',exact:true}).click();await test.waitForTimeout(650);
    check(await test.locator('.bloom-calendar').isVisible(),'Calendar remains clickable after notifications');
    await test.mouse.move(30,600);await test.waitForTimeout(650);
    check(await height()<40,'Calendar collapses on pointer leave');
    await test.emulateMedia({reducedMotion:'reduce'});
    await send();await test.waitForTimeout(300);check(await shown()===1,'Reduced motion still shows messages');
    await test.waitForTimeout(4500);await test.waitForTimeout(650);await test.locator('.bloom-notifications').waitFor({state:'detached',timeout:3000});check(await shown()===0,'Reduced motion still dismisses messages');
    return {passed:checks.length,checks};
  }finally{await context.close();}
}
