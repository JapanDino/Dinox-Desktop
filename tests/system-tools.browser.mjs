/** Synthetic fixtures only; no Windows settings are changed. */
export async function verifyInternalSystemTools(page){
 const browser=page.context().browser(),checks=[];const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 async function open(query='',width=1000,height=850){const c=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});await c.addInitScript(()=>{const s={'bloom-language':'ru','bloom-unified-appearance':'true','bloom-personal-eco':'auto'};for(const[k,v]of Object.entries(s))localStorage.setItem(k,v);localStorage.setItem('dinox-v4-demo-settings',JSON.stringify(s));});const p=await c.newPage();await p.goto('http://127.0.0.1:1440/personal-preview.html?dock'+query);await p.getByRole('button',{name:'Быстрые настройки',exact:true}).click();await p.locator('.quick-settings').waitFor();return{c,p};}
 {
  const{c,p}=await open();try{
   check(await p.getByRole('button',{name:'Панель Windows',exact:true}).isHidden(),'Windows links hidden behind disclosure');
   const dnd=p.getByRole('switch',{name:'Не беспокоить Dinox',exact:true});await dnd.click();await p.waitForFunction(()=>window.previewSettings['dinox-do-not-disturb']==='true');check(await dnd.getAttribute('aria-checked')==='true','Do Not Disturb saves directly');await dnd.click();await p.waitForFunction(()=>window.previewSettings['dinox-do-not-disturb']==='false');check(true,'Do Not Disturb can be disabled');
   await p.getByRole('button',{name:'Выход и микрофон',exact:true}).click();const audio=p.getByRole('dialog',{name:'Аудиоустройства',exact:true});await audio.waitFor();await audio.getByRole('button',{name:/Studio Headphones/}).click();await p.waitForFunction(()=>JSON.parse(document.documentElement.dataset.audioChange||'{}').deviceId==='headphones');check(await audio.getByRole('button',{name:/Studio Headphones/}).getAttribute('aria-pressed')==='true','Output device switched in Dinox');
   const tab=audio.getByRole('tab',{name:'Микрофон',exact:true});await tab.click();await audio.getByRole('button',{name:/USB microphone/}).click();await p.waitForFunction(()=>JSON.parse(document.documentElement.dataset.audioChange||'{}').deviceId==='usb-mic');check(true,'Microphone selected in Dinox');
   await audio.getByRole('button',{name:'Выключить микрофон',exact:true}).click();await audio.getByRole('button',{name:'Включить микрофон',exact:true}).waitFor();check(await p.evaluate(()=>JSON.parse(document.documentElement.dataset.audioChange).muted)===true,'Microphone muted in Dinox');
   const input=audio.getByRole('slider',{name:'Громкость микрофона',exact:true});await input.focus();await input.press('End');await p.waitForFunction(()=>JSON.parse(document.documentElement.dataset.audioChange||'{}').volume===1);check(await input.inputValue()==='100','Microphone volume committed');
   await tab.focus();await tab.press('ArrowLeft');check(await audio.getByRole('tab',{name:'Выход',exact:true}).getAttribute('aria-selected')==='true','Audio tabs support arrows');
   check(await p.evaluate(()=>!document.documentElement.dataset.systemAction),'Audio controls do not launch Windows settings');await p.keyboard.press('Escape');
   await p.locator('.quick-power').click();const power=p.getByRole('dialog',{name:'Питание',exact:true});await power.waitFor();await power.getByRole('button',{name:/Экономия энергии/}).click();await p.waitForFunction(()=>document.documentElement.dataset.powerScheme==='a1841308-3541-4fab-bc81-f71556f20b4a');check(await power.getByRole('button',{name:/Экономия энергии/}).getAttribute('aria-pressed')==='true','Power plan switched in Dinox');
   const eco=power.getByRole('combobox',{name:'Экономия ресурсов Dinox',exact:true});await eco.selectOption('on');await p.waitForFunction(()=>window.previewSettings['bloom-personal-eco']==='on');check(true,'Dinox resource-saving mode saves independently');
   check(await p.evaluate(()=>!document.documentElement.dataset.systemAction),'Power controls do not launch Windows settings');await p.keyboard.press('Escape');
   await p.locator('.quick-windows summary').click();check(await p.getByRole('button',{name:'Панель Windows',exact:true}).isVisible(),'Advanced Windows options still available');
  }finally{await c.close();}
 }
 for(const query of ['&audio-save-error','&power-save-error','&save-error']){
  const{c,p}=await open(query);try{
   if(query.includes('audio')){await p.getByRole('button',{name:'Выход и микрофон',exact:true}).click();await p.getByRole('button',{name:/Studio Headphones/}).click();await p.getByRole('alert').waitFor();check(await p.getByRole('button',{name:/Speakers/}).getAttribute('aria-pressed')==='true','Failed output write preserves confirmed device');}
   else if(query.includes('power')){await p.locator('.quick-power').click();await p.getByRole('button',{name:/Экономия энергии/}).click();await p.getByRole('alert').waitFor();check(await p.getByRole('button',{name:/Сбалансированная/}).getAttribute('aria-pressed')==='true','Failed power write preserves confirmed plan');}
   else{await p.getByRole('switch',{name:'Не беспокоить Dinox',exact:true}).click();await p.getByRole('alert').waitFor();check(await p.getByRole('switch',{name:'Не беспокоить Dinox',exact:true}).getAttribute('aria-checked')==='false','Failed DND save does not report enabled');}
  }finally{await c.close();}
 }
 for(const [query,selector]of [['&no-hardware','.audio-devices-content'],['&power-one-plan','.power-panel-body'],['&audio-error','.audio-devices-content'],['&power-error','.power-panel-body']]){
  const{c,p}=await open(query,320,450);try{
   if(selector.includes('audio'))await p.getByRole('button',{name:'Выход и микрофон',exact:true}).click();else await p.locator('.quick-power').click();await p.locator(selector).waitFor();
   if(query.includes('error'))await p.getByRole('alert').waitFor();else if(query.includes('no-hardware'))await p.getByText('Выходные устройства не найдены.',{exact:false}).waitFor();else await p.getByText('Windows предоставляет только один план на этом компьютере.',{exact:true}).waitFor();
   check(await p.locator('.system-panel').evaluate(el=>el.scrollWidth<=el.clientWidth),`No horizontal overflow ${query}`);await p.keyboard.press('Escape');await p.locator('.quick-settings').waitFor();check(true,`Back navigation works ${query}`);
  }finally{await c.close();}
 }
 return checks;
}
