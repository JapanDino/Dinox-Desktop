/** Synthetic browser fixtures only; never launches the native shell. */
export async function verifyUXIntegration(page,baseUrl='http://127.0.0.1:1440'){
 const results=[]; const check=(v,label)=>{if(!v)throw Error(label);results.push(label);};
 const browser=page.context().browser(),base=baseUrl+'/personal-preview.html';
 const settings={'bloom-language':'ru','bloom-unified-appearance':'true','bloom-first-run':'false','bloom-app-version':'4.2.2','bloom-notch-mode':'fixed','bloom-island-date':'true','bloom-island-cpu':'true','bloom-island-battery':'true'};
 async function open(query,extra={},size={width:1280,height:900}){
  const ctx=await browser.newContext({viewport:size}); await ctx.addInitScript(s=>{for(const[k,v]of Object.entries(s))localStorage.setItem(k,v);localStorage.setItem('dinox-v4-demo-settings',JSON.stringify(s));},{...settings,...extra});
  const p=await ctx.newPage();await p.goto(base+query); return {ctx,p};
 }
 function inside(b,size){return b&&b.x>=-1&&b.y>=-1&&b.x+b.width<=size.width+1&&b.y+b.height<=size.height+1;}
 for(const size of [{width:1280,height:900},{width:390,height:844}])for(const position of ['top-left','top-center','top-right','left','right','bottom']){
  const {ctx,p}=await open('?app',{'bloom-island-position':position,'bloom-scale':'1.3'},size);
  try{
   const clock=p.getByRole('button',{name:'Открыть календарь',exact:true});await clock.waitFor(); await p.mouse.move(size.width-2,size.height/2);await p.waitForTimeout(900);
   const before=await clock.boundingBox();await clock.click();await p.locator('.bloom-calendar').waitFor();await p.waitForTimeout(550);
   const timeline=await p.locator(".cal-week-scroll").boundingBox();check(timeline&&timeline.height>=60,`${position} ${size.width}: usable time grid`);const pill=await p.locator('.bloom').boundingBox(),after=await clock.boundingBox();check(inside(pill,size),`${position} ${size.width}: expanded island fits`);const footer=await p.locator(".cal-footer").boundingBox();check(footer&&footer.y>=pill.y&&footer.y+footer.height<=pill.y+pill.height+1,`${position} ${size.width}: calendar footer stays inside`);if(position==="top-center")check(Math.abs(pill.x+pill.width/2-size.width/2)<1,`${position} ${size.width}: horizontally centered`);
   check(Math.abs(before.x-after.x)<1&&Math.abs(before.y-after.y)<1,`${position} ${size.width}: date/CPU/clock stable`);
   await p.screenshot({path:`output/playwright/after-island-${position}-${size.width}.png`});
  }finally{await ctx.close();}
 }
 {
  const {ctx,p}=await open('?desktop=layout');try{
   const select=p.getByRole('combobox',{name:'Расположение острова'});await select.waitFor();await select.selectOption('right');
   check(await p.evaluate(()=>!window.previewSettings['bloom-island-position']),'layout draft is not immediately applied');
   await p.getByRole('button',{name:'Отменить',exact:true}).click();check(await select.inputValue()==='top-center','layout cancel restores original');
   await select.selectOption('left');await p.getByRole('button',{name:'Сохранить',exact:true}).click();await p.getByRole('status').filter({hasText:'Сохранено'}).waitFor();
   check(await p.evaluate(()=>window.previewSettings['bloom-island-position']==='left'),'layout save persists island position');
   await p.getByRole('button',{name:'Док',exact:true}).click();await p.getByRole('combobox',{name:'Сторона дока'}).selectOption('right');await p.getByRole('button',{name:'Сохранить',exact:true}).click();await p.getByRole('status').filter({hasText:'Сохранено'}).waitFor();
   check(await p.evaluate(()=>JSON.parse(window.previewSettings['bloom-dock-design']).edge==='right'),'layout save persists dock edge');
   await p.screenshot({path:'output/playwright/after-layout.png',fullPage:true});
  }finally{await ctx.close();}
 }
 for(const query of ['?desktop=mixer','?desktop=mixer&mixer-route-error','?desktop=mixer&mixer-route-unsupported']){
  const {ctx,p}=await open(query,{}, {width:390,height:844});try{
   await p.locator('.mixer-app').first().waitFor();const route=p.getByRole('combobox',{name:'Выход приложения: Музыка'});
   if(query.includes('unsupported')){check(await route.count()===0,'unsupported Windows build hides unavailable routing');}
   else {await route.selectOption('headphones');
    if(query.includes('error')){await p.getByRole('alert').waitFor();check(await route.inputValue()==='','routing failure restores selected output');}
    else {await p.locator('.mixer-route-status').filter({hasText:'Текущий поток может остаться'}).waitFor();check(await route.inputValue()==='headphones','app output stored');check(await p.evaluate(()=>JSON.parse(document.documentElement.dataset.mixerRoute).processStartedAt==='133777000000000001'),'routing preserves exact process identity');await route.selectOption('');await p.locator('.mixer-route-status').filter({hasText:'по умолчанию'}).waitFor();check(await route.inputValue()==='','reset only app output to Windows default');}
   }
   check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mixer no horizontal page overflow');
   await p.screenshot({path:`output/playwright/after-mixer${query.includes('error')?'-error':query.includes('unsupported')?'-unsupported':''}.png`,fullPage:true});
  }finally{await ctx.close();}
 }
 {
  const {ctx,p}=await open('?settings&save-error',{}, {width:390,height:844});try{
   await p.getByRole('button',{name:'Оформление',exact:true}).click();const unified=p.getByRole('checkbox',{name:'Единый стиль Dinox'});await unified.waitFor();
   check(await p.getByRole('combobox',{name:/Тема/}).count()===0,'unified appearance does not offer ineffective themes');
   await unified.click();const error=p.getByRole('alert').filter({hasText:'Не удалось сохранить оформление'});await error.waitFor();const box=await error.boundingBox();check(inside(box,{width:390,height:844}),'appearance save error stays visible inside settings');
   await p.screenshot({path:'output/playwright/after-settings-error.png',fullPage:true});
  }finally{await ctx.close();}
 }
 {
  const {ctx,p}=await open('?calendar-sync&calendar-many&spanning-events');try{
   await p.locator('.cal-span-event').first().waitFor();const event=p.locator('.cal-span-event').first();await event.click();const dialog=p.getByRole('dialog');await dialog.waitFor();
   check(await dialog.evaluate(el=>el.contains(document.activeElement)),'event detail receives keyboard focus');await p.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});check(await event.evaluate(el=>el===document.activeElement),'event detail restores focus');
  }finally{await ctx.close();}
 }
 return results;
}
