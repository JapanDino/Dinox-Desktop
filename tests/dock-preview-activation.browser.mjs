/** Synthetic dock/window fixtures; no real window activation. */
export async function verifyDockPreviewActivation(page,baseUrl='http://127.0.0.1:1440'){
 const results=[],check=(value,label)=>{if(!value)throw Error(label);results.push(label);};
 const context=await page.context().browser().newContext({viewport:{width:1280,height:800}}),p=await context.newPage();
 try{
  const duplicateWarnings=[];p.on('console',message=>{if(/same key|unique.*key/i.test(message.text()))duplicateWarnings.push(message.text());});
  await context.addInitScript(()=>{
   localStorage.setItem('bloom-language','ru');localStorage.setItem('dinox-v4-demo-settings',JSON.stringify({'bloom-language':'ru','bloom-dock-mode':'fixed'}));
   localStorage.setItem('dinox-v4-demo-pins-false',JSON.stringify([{path:'C:/Apps/chrome.exe',name:'Browser',icon:null,is_running:false}]));
   window.syntheticWindows=[{path:'C:/Apps/chrome.exe',name:'First tab',hwnd:5100,is_running:true,icon:null},{path:'C:/Apps/chrome.exe',name:'Second tab',hwnd:5200,is_running:true,icon:null},{path:'Chrome.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',name:'Mail',hwnd:6100,is_running:true,icon:null},{path:'Chrome.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',name:'Calendar',hwnd:6200,is_running:true,icon:null}];
   window.syntheticCalls=[];let internals;
   Object.defineProperty(window,'__TAURI_INTERNALS__',{configurable:true,get:()=>internals,set:value=>{const original=value.invoke;value.invoke=async(command,args)=>{
    if(command==='get_active_windows')return window.syntheticWindows;
    if(command==='capture_window_thumbnail')return ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=',0];
    if(command==='focus_window'||command==='close_window'){window.syntheticCalls.push({command,...args});if(window.syntheticFocusError&&command==='focus_window')throw Error('Window closed');return;}
    return original(command,args);
   };internals=value;}});
  });
  await p.goto(baseUrl+'/personal-preview.html?dock');await p.locator('.dock-expanded').waitFor();
  const browser=p.locator('.dock-icon[role=button][aria-label="Browser"]');await browser.waitFor();
  await p.waitForFunction(()=>document.querySelectorAll('.dock-icon[role=button][aria-label="Mail"]').length===1);
  check(await p.locator('.dock-icon[role=button][aria-label="Browser"]').count()===1,'multiple browser title groups have one stable dock icon');
  check(await p.locator('.dock-icon[role=button][aria-label="Mail"]').count()===1&&await p.locator('.dock-icon[role=button][aria-label="Calendar"]').count()===1,'distinct PWA AUMIDs retain separate dock icons');
  await browser.hover();await p.locator('.preview-item[aria-label="Second tab"]').waitFor();
  await p.locator('.preview-item[aria-label="Second tab"]').click();
  let calls=await p.evaluate(()=>window.syntheticCalls);
  check(calls.length===1&&calls[0].hwnd===5200&&calls[0].toggle===false,'preview click activates chosen HWND once without icon toggle');
  await browser.click();calls=await p.evaluate(()=>window.syntheticCalls);
  check(calls.length===2&&calls[1].hwnd===5100&&calls[1].toggle===true,'icon click explicitly requests exact-window toggle');
  await p.mouse.move(0,0);await browser.hover();const first=p.locator('.preview-item[aria-label="First tab"]');await first.waitFor();await first.focus();await first.press('Enter');
  calls=await p.evaluate(()=>window.syntheticCalls);check(calls.length===3&&calls[2].toggle===false,'keyboard preview activation never toggles application group');
  await p.mouse.move(0,0);await browser.hover();const second=p.locator('.preview-item[aria-label="Second tab"]');await second.waitFor();await second.locator('button').focus();await second.locator('button').press('Enter');
  await p.waitForFunction(()=>window.syntheticCalls.length===4);calls=await p.evaluate(()=>window.syntheticCalls);
  check(calls[3].command==='close_window'&&calls[3].hwnd===5200,'Enter on preview close closes only, never activates parent');
  await p.evaluate(()=>{window.syntheticWindows[0].name='Renamed first tab';window.syntheticWindows[1].name='Renamed second tab';window.previewEmit('windows-changed',null);});
  await p.mouse.move(0,0);await browser.hover();await p.locator('.preview-item[aria-label="Renamed second tab"]').waitFor();
  check(await p.locator('.dock-icon[role=button][aria-label="Browser"]').count()===1,'tab renaming keeps pinned application icon and merged windows');
  check(duplicateWarnings.length===0,'no duplicate React key warnings across group refresh');
  await p.evaluate(()=>{window.syntheticFocusError=true;});await p.locator('.preview-item[aria-label="Renamed second tab"]').click();
  await p.locator('.dock-toast').filter({hasText:'Не удалось активировать окно'}).waitFor();
  check(await p.locator('.preview-item[aria-label="Renamed second tab"]').isVisible(),'failed native activation shows recovery and keeps preview');
  return results;
 }finally{await context.close();}
}
