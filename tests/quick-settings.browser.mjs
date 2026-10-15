/** Synthetic browser fixtures. These checks do not change Windows devices. */
export async function verifyQuickSettings(page,base='http://127.0.0.1:1440'){
 const checks=[],browser=page.context().browser();const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 async function open({width=1000,height=850,light=false,lang='ru',query=''}={}){
  const c=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await c.addInitScript(({light,lang})=>{const s={'bloom-language':lang,'bloom-unified-appearance':light?'false':'true','bloom-dock-design':JSON.stringify({preset:'custom',background:light?'#f4f5f7':'#000000',accent:light?'#6350b8':'#f5f5f5'})};for(const[k,v]of Object.entries(s))localStorage.setItem(k,v);localStorage.setItem('dinox-v4-demo-settings',JSON.stringify(s));},{light,lang});
  await p.goto(base+'/personal-preview.html?dock'+query);await p.getByRole('button',{name:lang==='ru'?'Быстрые настройки':'Quick settings',exact:true}).click();const panel=p.locator('.quick-settings');await panel.waitFor();return{c,p,panel,errors};
 }
 for(const config of [{width:320,height:450},{width:390,height:600,lang:'en'}, {light:false},{light:true}]){
  const {c,p,panel,errors}=await open(config);try{
   const b=await panel.boundingBox();const {width=1000,height=850,lang='ru'}=config;
   check(b.x>=0&&b.y>=0&&b.x+b.width<=width+1&&b.y+b.height<=height+1,`Panel fits ${width} ${lang} ${config.light?'light':'dark'}`);
   check(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth),`No horizontal scroll ${width}`);
   await panel.locator('.quick-connection-label small').first().filter({hasText:'Home network'}).waitFor();
   check(await panel.locator('.system-connections button[data-active=true]').count()===2,`Confirmed connection indicators ${width}`);
   check(await panel.evaluate(el=>{const all=[...el.querySelectorAll('.system-connections button')].map(x=>x.getBoundingClientRect());return all[0].right<=all[1].left;}),`Connection tiles do not overlap ${width}`);
   await panel.locator('footer button').last().scrollIntoViewIfNeeded();const f=await panel.locator('footer button').last().boundingBox();check(f.y>=0&&f.y+f.height<=height+1,`Footer reachable ${width}`);
   await p.keyboard.press('Escape');await panel.waitFor({state:'hidden'});check(await p.getByRole('button',{name:lang==='ru'?'Быстрые настройки':'Quick settings',exact:true}).evaluate(el=>el===document.activeElement),`Closing restores trigger focus ${width}`);
   check(errors.length===0,`No runtime errors ${width}`);
  }finally{await c.close();}
 }
 {
  const {c,p,panel}=await open();try{
   const volume=panel.getByRole('slider',{name:'Громкость системы',exact:true});await volume.focus();await volume.press('End');await p.waitForFunction(()=>document.documentElement.dataset.systemVolume==='1');check(await volume.inputValue()==='100','Volume keyboard commit confirmed');
   await volume.press('Home');await p.waitForFunction(()=>document.documentElement.dataset.systemVolume==='0');check(await volume.inputValue()==='0','Volume zero confirmed');
   await volume.press('ArrowRight');await p.waitForFunction(()=>document.documentElement.dataset.systemVolume==='0.01');check(await volume.inputValue()==='1','Volume near-zero fill remains usable');
   const brightness=panel.getByRole('slider',{name:'Яркость экрана',exact:true});await brightness.focus();await brightness.press('End');await p.waitForFunction(()=>document.documentElement.dataset.systemBrightness==='100');check(await brightness.inputValue()==='100','Brightness keyboard commit confirmed');
   check(await brightness.evaluate(el=>getComputedStyle(el).outlineStyle==='solid'),'Range keyboard focus visible');
   await panel.getByRole('button',{name:'Выключить звук',exact:true}).click();await panel.getByRole('button',{name:'Включить звук',exact:true}).waitFor();check(await panel.getByRole('button',{name:'Включить звук',exact:true}).getAttribute('aria-pressed')==='true','Mute exposes selected state');
   await panel.getByRole('button',{name:'Включить звук',exact:true}).click();await panel.getByRole('button',{name:'Выключить звук',exact:true}).waitFor();check(true,'Unmute works');
   await panel.locator('.system-connections button').first().click();await p.getByRole('dialog',{name:'Wi-Fi',exact:true}).waitFor();await p.getByRole('switch',{name:'Включить Wi-Fi',exact:true}).click();await p.waitForFunction(()=>document.querySelector('[role=switch]')?.getAttribute('aria-checked')==='false');await p.keyboard.press('Escape');await panel.locator('.quick-connection-label small').first().filter({hasText:'Выключен'}).waitFor();check(await panel.locator('.system-connections button').first().getAttribute('data-active')==='false','Wi-Fi status updates after device subpage');
   await panel.locator('.system-connections button').last().click();await p.getByRole('dialog',{name:'Bluetooth',exact:true}).waitFor();await p.getByRole('switch').click();await p.waitForFunction(()=>document.querySelector('[role=switch]')?.getAttribute('aria-checked')==='false');await p.keyboard.press('Escape');await panel.locator('.quick-connection-label small').last().filter({hasText:'Выключен'}).waitFor();check(await panel.locator('.system-connections button').last().getAttribute('data-active')==='false','Bluetooth status updates after device subpage');
   await panel.getByRole('button',{name:'Микшер приложений',exact:true}).click();await p.getByRole('dialog',{name:'Микшер приложений',exact:true}).waitFor();await p.keyboard.press('Escape');await panel.waitFor();check(true,'Mixer remains accessible');
   await panel.locator('.quick-keyboard').click();await p.getByRole('dialog',{name:'Раскладка клавиатуры',exact:true}).waitFor();await p.keyboard.press('Escape');await panel.waitFor();check(true,'Layout picker remains accessible');
   await panel.getByRole('button',{name:'Скрытые значки',exact:true}).click();await p.getByRole('dialog',{name:'Скрытые значки',exact:true}).waitFor();await p.keyboard.press('Escape');await panel.waitFor();check(true,'Tray remains accessible');
  }finally{await c.close();}
 }
 {
  const {c,panel}=await open({query:'&no-hardware&wifi-error&bluetooth-error'});try{
   check(await panel.getByRole('slider',{name:'Громкость системы'}).isDisabled(),'Unavailable audio stays disabled');
   check(await panel.getByRole('slider',{name:'Яркость экрана'}).isDisabled(),'Unavailable screen stays disabled');
   check(await panel.locator('.system-connections button').first().isEnabled(),'Failed status read does not block Wi-Fi panel');
   check(await panel.locator('.system-connections button[data-active=true]').count()===0,'Unknown connections are not marked active');
   check(await panel.locator('.system-slider output').allTextContents().then(s=>s.every(x=>x==='—')),'Unknown device values are not shown as zero');
  }finally{await c.close();}
 }
 return checks;
}
