export async function verifyIslandSections(page,base='http://127.0.0.1:1440'){
 const results=[],check=(ok,label)=>{if(!ok)throw Error(label);results.push(label);};
 for(const config of [{width:1280,height:900,lang:'ru',scale:'1.25'},{width:390,height:600,lang:'en',scale:'1.3'}]){
  const c=await page.context().browser().newContext({viewport:{width:config.width,height:config.height},reducedMotion:'reduce'}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  try{
   await c.addInitScript(({lang,scale})=>{const s={'bloom-language':lang,'bloom-media-layout':'compact','bloom-music-mode-enabled':'true','bloom-first-run':'false','bloom-app-version':'4.2.3','bloom-scale':scale,'bloom-notch-mode':'fixed','bloom-island-date':'true','bloom-island-cpu':'true','bloom-island-battery':'true','bloom-status-widgets':JSON.stringify({left:['cpu','ram'],right:['battery','disk']}),'bloom-notifications':JSON.stringify({enabled:true,windowsEnabled:true,privacy:'full',duration:8})};for(const [k,v]of Object.entries(s))localStorage.setItem(k,v);localStorage.setItem('dinox-v4-demo-settings',JSON.stringify(s));},config);
   await p.goto(base+'/personal-preview.html?app');const clock=p.getByRole('button',{name:config.lang==='ru'?'Открыть календарь':'Open calendar',exact:true});await clock.waitFor();await p.mouse.move(0,config.height/2);await p.waitForTimeout(750);const before=await clock.boundingBox();
   check(await p.locator('.island-sections').count()===0,`compact header has no section controls ${config.lang}`);
   await clock.hover();await p.locator('.island-overview').waitFor();
   const profile=p.locator('.island-profile');check(!await profile.getAttribute('open'),`profiles collapsed by default ${config.lang}`);
   await profile.locator('summary').click();check(await profile.locator('button').count()===3,`profiles available on demand ${config.lang}`);await profile.locator('summary').click();
   check(await p.locator('.island-metric[data-metric=cpu],.island-metric[data-metric=battery]').count()===0,`persistent readings not duplicated ${config.lang}`);
   for(const section of ['calendar','command-center','status']){
    await p.locator(`[data-island-section="${section}"]`).click();await p.waitForTimeout(450);
    const b=await p.locator('.bloom').boundingBox(),after=await clock.boundingBox();
    check(b.x>=-1&&b.y>=-1&&b.x+b.width<=config.width+1&&b.y+b.height<=config.height+1,`${section} fits viewport ${config.lang}`);
    check(Math.abs(before.x-after.x)<1&&Math.abs(before.y-after.y)<1,`${section} clock remains anchored ${config.lang}`);
    // Concave decorative corners extend 13px beyond .bloom; test actual tools.
    check(await p.locator(section==='calendar'?'.bloom-calendar':section==='command-center'?'.system-panel-inline':'.island-overview').evaluate(el=>el.scrollWidth<=el.clientWidth+1),`${section} has no horizontal overflow ${config.lang}`);
   }
   await p.locator('[data-island-section=command-center]').click();const panel=p.locator('.system-panel-inline');await panel.waitFor();
   await panel.getByRole('button',{name:/Bluetooth/}).click();await panel.locator('.bluetooth-heading').waitFor();
   await p.locator('[data-island-section=status]').focus();check(await p.locator('[data-island-section=status]').evaluate(el=>el===document.activeElement),`inline controls do not trap navigation focus ${config.lang}`);
   await p.locator('[data-island-section=status]').press('Enter');await p.locator('.island-overview').waitFor();
   await p.evaluate(()=>window.previewMedia(true,'After hours'));await p.locator('[data-island-section=music]').click();await p.locator('.cmp-play').waitFor();await p.waitForTimeout(450);
   const play=await p.locator('.cmp-play').evaluate(el=>({fg:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor,label:el.getAttribute('aria-label')}));check(play.fg!==play.bg&&!!play.label,`media play has readable contrast and label ${config.lang}`);
   await p.evaluate(()=>window.previewEmit('bloom-preview-notification',{id:77,app_id:'test',app_name:'Telegram',title:'Project',body:'A complete short message to check the notification layout.',created:Date.now()}));await p.locator('.notice-card').waitFor();await p.waitForTimeout(500);
   const fit=await p.locator('.notice-list').evaluate(el=>{const card=el.querySelector('.notice-card').getBoundingClientRect(),r=el.getBoundingClientRect();return card.top>=r.top-1&&card.bottom<=r.bottom+1;});if(!fit)await p.locator('.bloom').screenshot({path:`output/playwright/notice-clip-${config.lang}.png`});check(fit,`short notification card visible without clipping ${config.lang}`);
   await p.locator('.notice-source button').click();await p.locator('.notice-card').waitFor({state:'hidden'});
   check(errors.length===0,`no runtime errors ${config.lang}`);
  }finally{await c.close();}
 }
 return results;
}
