/** Synthetic preview only. Never registers real Windows hotkeys. */
export async function verifySearchShortcutSettings(page,baseUrl='http://127.0.0.1:1440'){
 const browser=page.context().browser(),results=[];
 const check=(value,label)=>{if(!value)throw Error(label);results.push(label);};
 async function open(query,width=800,extra={},setup){
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.addInitScript(s=>{localStorage.setItem('bloom-language','ru');localStorage.setItem('dinox-v4-demo-settings',JSON.stringify({'bloom-language':'ru','bloom-unified-appearance':'true',...s}));},extra);
  if(setup)await context.addInitScript(setup);
  const p=await context.newPage();await p.goto(baseUrl+'/personal-preview.html'+query);return {context,p};
 }
 {
  const {context,p}=await open('?desktop=search');
  try{
   await p.locator('.launcher-preferences summary').click();
   await p.getByRole('button',{name:'Настроить горячую клавишу',exact:true}).click();
   await p.waitForURL('**/personal-preview.html?settings&search-settings');
   const section=await editor(p);
   await p.waitForFunction(()=>document.activeElement?.id==='dinox-search-settings');
   check(await section.isVisible(),'launcher Configure opens canonical General settings');
   check(await section.evaluate(el=>el===document.activeElement),'opening search settings focuses canonical shortcut section');
  }finally{await context.close();}
 }
 async function editor(p){const section=p.locator('#dinox-search-settings');await section.waitFor();return section;}
 async function record(p,section){await section.getByRole('button',{name:'Задать своё сочетание…'}).click();await section.getByRole('button',{name:'Запись сочетания',exact:true}).waitFor();}
 async function waitStatus(section,state){await section.locator(`.shortcut-connection[data-state="${state}"]`).waitFor();}
 {
  const {context,p}=await open('?desktop=search',390);
  try{
   await p.locator('.launcher-preferences summary').click();
   const preferences=p.locator('.launcher-preferences-body');
   check(await preferences.getByRole('combobox').count()===1,'launcher has only search-engine select, no second shortcut editor');
   check(await preferences.locator('kbd').innerText()==='Alt + Space','launcher displays current shortcut');
   await waitStatus(preferences,'active');
   await preferences.getByRole('combobox',{name:'Поисковая система',exact:true}).selectOption('bing');
   check(await p.evaluate(()=>window.previewSettings['dinox-search-engine'])==='bing','launcher search-engine preference remains functional');
   check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'launcher preferences do not overflow at 390px');
   await p.screenshot({path:'output/playwright/search-shortcut-summary-390.png',fullPage:true});
   await p.evaluate(()=>{const internals=window.__TAURI_INTERNALS__,original=internals.invoke;internals.invoke=async(command,...args)=>{if(command==='open_search_settings'){document.documentElement.dataset.openSearchSettings='true';throw Error('Synthetic settings unavailable');}return original(command,...args);};});
   await preferences.getByRole('button',{name:'Настроить горячую клавишу',exact:true}).click();
   await p.getByRole('alert').filter({hasText:'Не удалось открыть настройки поиска'}).waitFor();
   check(await p.locator('.dinox-launcher').isVisible(),'failed Settings opening keeps search and recovery message visible');
   check(await p.evaluate(()=>document.documentElement.dataset.openSearchSettings)==='true','launcher requests canonical native open_search_settings command');
  }finally{await context.close();}
 }
 {
  const {context,p}=await open('?settings',390);
  try{
   const section=await editor(p);await waitStatus(section,'active');
   await record(p,section);await p.keyboard.press('Control+Shift+KeyK');
   check(await section.getByRole('button',{name:'Запись сочетания',exact:true}).innerText()==='Ctrl + Shift + K','recorder captures physical Ctrl+Shift+K');
   check(await section.locator('#launcher-shortcut-candidate').innerText()==='Выбрано сочетание Ctrl + Shift + K','candidate combination is present in live accessible description');
   await p.keyboard.press('Tab');
   check(await section.getByRole('button',{name:'Сохранить',exact:true}).evaluate(el=>el===document.activeElement),'Tab reaches Save without cancelling recording');
   await p.keyboard.press('Enter');await section.getByRole('button',{name:'Задать своё сочетание…'}).waitFor();
   check(await p.evaluate(()=>window.previewSettings['dinox-search-shortcut'])==='custom:6:75','custom shortcut persists through canonical Settings editor');
   check(await p.evaluate(()=>document.documentElement.dataset.shortcutRecording)==='false','successful Save releases recorder');
   await waitStatus(section,'active');
   await record(p,section);await p.keyboard.press('Alt+KeyQ');await p.keyboard.press('Escape');
   await section.getByRole('button',{name:'Задать своё сочетание…'}).waitFor();
   check(await p.evaluate(()=>window.previewSettings['dinox-search-shortcut'])==='custom:6:75','Escape cancels candidate and preserves saved shortcut');
   check(await p.evaluate(()=>document.documentElement.dataset.shortcutRecording)==='false','Escape releases native recorder');
   await record(p,section);await p.keyboard.press('KeyQ');await section.getByRole('alert').waitFor();
   check(await section.getByRole('button',{name:'Сохранить',exact:true}).isDisabled(),'plain typing is rejected instead of becoming global hotkey');
   await p.keyboard.press('Control+F12');
   check(await section.getByRole('button',{name:'Сохранить',exact:true}).isDisabled(),'reserved F12 shortcut is rejected');
   await p.keyboard.press('Control+Shift+KeyK');
   check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'canonical editor has no horizontal overflow at 390px');
   await p.screenshot({path:'output/playwright/search-shortcut-recorder-390.png',fullPage:true});
   await section.getByRole('button',{name:'Отмена',exact:true}).click();
   await section.getByRole('combobox',{name:'Горячая клавиша поиска'}).selectOption('off');await waitStatus(section,'disabled');
   check(await section.locator('.search-shortcut-conflict').count()===0,'disabled shortcut does not show false conflict');
  }finally{await context.close();}
 }
 {
  const {context,p}=await open('?settings&shortcut-conflict');
  try{
   const section=await editor(p);await waitStatus(section,'unavailable');
   await section.getByRole('button',{name:'Подключить повторно',exact:true}).click();await waitStatus(section,'unavailable');
   check((await section.locator('.search-shortcut-conflict').innerText()).includes('не меняет чужие настройки автоматически'),'conflict retry remains truthful and documents manual third-party change');
  }finally{await context.close();}
 }
 {
  const {context,p}=await open('?settings&save-error');
  try{
   const section=await editor(p);await record(p,section);await p.keyboard.press('Control+Shift+KeyK');
   await section.getByRole('button',{name:'Сохранить',exact:true}).click();await section.getByRole('alert').filter({hasText:'Не удалось подтвердить сохранение'}).waitFor();
   check(await section.getByRole('button',{name:'Запись сочетания',exact:true}).isVisible(),'failed save keeps candidate available for retry');
   check(await section.getByRole('combobox').inputValue()==='alt-space','failed save does not report candidate as saved value');
   await section.getByRole('button',{name:'Отмена',exact:true}).click();await section.getByRole('button',{name:'Задать своё сочетание…'}).waitFor();
   check(await p.evaluate(()=>document.documentElement.dataset.shortcutRecording)==='false','cancel after failed save releases recorder');
  }finally{await context.close();}
 }
 {
  const {context,p}=await open('?settings&capture-error');
  try{
   const section=await editor(p);await section.getByRole('button',{name:'Задать своё сочетание…'}).click();await section.getByRole('alert').filter({hasText:'Не удалось начать запись'}).waitFor();
   check(await section.getByRole('button',{name:'Задать своё сочетание…'}).isEnabled(),'recorder startup failure leaves retry available');
   check(await p.evaluate(()=>document.documentElement.dataset.shortcutRecording)==='false','recorder startup failure restores normal shortcut handling');
  }finally{await context.close();}
 }
 {
  const setup=()=>{let internals,allowCheck=false;Object.defineProperty(window,'__TAURI_INTERNALS__',{configurable:true,get:()=>internals,set:value=>{const original=value.invoke;value.invoke=async(command,...args)=>{if(command==='launcher_hotkey_status'&&!allowCheck)throw Error('Synthetic unavailable status');if(command==='launcher_retry_shortcut')allowCheck=true;return original(command,...args);};internals=value;}});};
  const {context,p}=await open('?settings',800,{},setup);
  try{
   const section=await editor(p);await waitStatus(section,'unverified');
   check(await section.getByRole('button',{name:'Подключить повторно',exact:true}).isVisible(),'failed registration check offers retry instead of indefinite spinner');
   check(await section.locator('.search-shortcut-conflict').getByRole('status').count()===0,'failed status check does not falsely accuse another app of conflict');
   await section.getByRole('button',{name:'Подключить повторно',exact:true}).click();await waitStatus(section,'active');
   check(true,'retry confirms recovered native registration status');
  }finally{await context.close();}
 }
 return results;
}
