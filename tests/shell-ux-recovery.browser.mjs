/** Read/write only synthetic browser fixtures, never the installed shell. */
export async function verifyShellUXRecovery(page,baseUrl='http://127.0.0.1:1440'){
 const results=[],check=(value,label)=>{if(!value)throw Error(label);results.push(label);};
 const browser=page.context().browser();
 async function open(query,{width=390,height=450,scale=1,edge='bottom'}={}){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
  await context.addInitScript(({scale,edge})=>{const settings={'bloom-language':'ru','bloom-unified-appearance':'true','bloom-scale':String(scale),'bloom-dock-mode':'fixed','bloom-dock-design':JSON.stringify({edge}),'bloom-notch-mode':'fixed','bloom-island-date':'true','bloom-island-cpu':'true','bloom-island-battery':'true','bloom-notifications':JSON.stringify({enabled:true,privacy:'full',duration:20})};for(const[key,value]of Object.entries(settings))localStorage.setItem(key,value);localStorage.setItem('dinox-v4-demo-settings',JSON.stringify(settings));},{scale,edge});
  const p=await context.newPage();await p.goto(baseUrl+'/personal-preview.html'+query);return {context,p};
 }
 for(const edge of ['bottom','left','right']){
  const {context,p}=await open('?dock',{edge,scale:2});try{
   await p.getByRole('button',{name:'Быстрые настройки',exact:true}).click();const panel=p.getByRole('dialog',{name:'Быстрые настройки',exact:true});await panel.waitFor();
   check(await panel.evaluate(el=>el.contains(document.activeElement)),`${edge}: quick panel receives keyboard focus`);
   await p.getByRole('button',{name:'Закрыть быстрые настройки',exact:true}).click();await panel.waitFor({state:'hidden'});
   check(await p.getByRole('button',{name:'Быстрые настройки',exact:true}).evaluate(el=>el===document.activeElement),`${edge}: close button returns focus to quick trigger`);
   const tray=p.getByRole('button',{name:'Скрытые значки приложений',exact:true});await tray.click();await p.getByRole('dialog',{name:'Скрытые значки',exact:true}).waitFor();await p.keyboard.press('Escape');await panel.waitFor();
   check(await panel.evaluate(el=>el.contains(document.activeElement)),`${edge}: Escape from tray focuses quick panel instead of body`);
   await p.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
   check(await tray.evaluate(el=>el===document.activeElement),`${edge}: closing tray flow restores original tray trigger`);
   const icon=p.locator('.dock-icon[role=button]').nth(1);await icon.focus();await icon.press('Shift+F10');await p.locator('.context-menu').waitFor();await p.keyboard.press('Escape');await p.locator('.context-menu').waitFor({state:'hidden'});
   check(await icon.evaluate(el=>el===document.activeElement),`${edge}: Escape returns context menu focus to icon`);
  }finally{await context.close();}
 }
 {
  const {context,p}=await open('?dock',{height:600});try{
   await p.getByRole('button',{name:'Быстрые настройки',exact:true}).click();
   await p.evaluate(()=>{const original=window.__TAURI_INTERNALS__.invoke;let failed=true;window.recoverSyntheticStatus=()=>{failed=false;};window.__TAURI_INTERNALS__.invoke=(command,...args)=>command==='system_controls_status'&&failed?Promise.reject('Synthetic status unavailable'):original(command,...args);});
   await p.locator('.system-error').waitFor();await p.evaluate(()=>window.recoverSyntheticStatus());await p.locator('.system-error').waitFor({state:'hidden'});
   check(true,'successful status polling clears only recovered status error');
   await p.evaluate(()=>{const original=window.__TAURI_INTERNALS__.invoke;window.__TAURI_INTERNALS__.invoke=(command,...args)=>command==='system_control_action'?Promise.reject('Synthetic action refused'):original(command,...args);});
   await p.getByRole('button',{name:'VPN',exact:true}).click();await p.locator('.system-error').filter({hasText:'Synthetic action refused'}).waitFor();await p.waitForTimeout(2100);
   check(await p.locator('.system-error').innerText()==='Synthetic action refused','successful polling preserves unresolved action error');
   await p.screenshot({path:'output/playwright/new-shell-after-system-error390.png'});
  }finally{await context.close();}
 }
 {
  const {context,p}=await open('?dock&pins-load-error',{scale:2,height:600});try{
   await p.locator('.dock-toast').waitFor();await p.waitForTimeout(200);const b=await p.locator('.dock-toast').boundingBox();
   check(b.x>=0&&b.x+b.width<=390,'scaled dock error toast remains inside390px viewport');
   await p.evaluate(()=>window.previewEmit('dock-pins-changed','classic'));await p.screenshot({path:'output/playwright/new-shell-after-toast390-s2.png'});
  }finally{await context.close();}
 }
 {
  const {context,p}=await open('?app',{scale:2});try{
   await p.locator('.main-row').waitFor();await p.waitForTimeout(800);await p.getByRole('button',{name:'Демо-карточка',exact:true}).click();const panel=p.locator('.bloom-notifications');await panel.waitFor();await p.waitForTimeout(250);
   check(await panel.locator('.notice-list').evaluate(el=>el.clientHeight>=32),'narrow scaled notice preserves message scrolling area');
   const text=p.locator('.notice-card h3');await text.scrollIntoViewIfNeeded();await panel.evaluate(el=>{if(el.scrollHeight>el.clientHeight){const title=el.querySelector('.notice-card h3'),header=el.querySelector('header');if(title&&header)el.scrollTop+=title.getBoundingClientRect().top-(el.getBoundingClientRect().top+header.getBoundingClientRect().height+2);}});const b=await text.boundingBox(),list=await panel.locator('.notice-list').boundingBox();
   check(b.y+b.height>list.y&&b.y<list.y+list.height,'notification title is reachable and visible');
   await p.screenshot({path:'output/playwright/new-shell-after-notification390-s2-message.png'});
   const last=panel.getByRole('button',{name:'Настройки уведомлений',exact:true});await last.scrollIntoViewIfNeeded();const action=await last.boundingBox(),bounds=await panel.boundingBox();
   check(action.y>=bounds.y&&action.y+action.height<=bounds.y+bounds.height,'short notification panel can scroll to last action');
   const header=await panel.locator('header').boundingBox();check(action.y>=header.y+header.height-1,'sticky notification header does not cover footer action');
   await p.screenshot({path:'output/playwright/new-shell-after-notification390-s2.png'});
  }finally{await context.close();}
 }
 {
  const {context,p}=await open('?app',{height:600});try{
   const pageErrors=[];p.on('pageerror',error=>pageErrors.push(error.message));await p.getByRole('button',{name:'Демо-карточка',exact:true}).click();const panel=p.locator('.bloom-notifications');await panel.waitFor();
   await p.evaluate(()=>{const original=window.__TAURI_INTERNALS__.invoke;window.__TAURI_INTERNALS__.invoke=async(command,...args)=>{if(command==='open_notification_settings'){await new Promise(resolve=>setTimeout(resolve,150));throw 'Synthetic settings failed '.repeat(40);}return original(command,...args);};});
   const settings=p.getByRole('button',{name:'Настройки уведомлений',exact:true});await settings.click();check(await settings.isDisabled(),'notification launch displays pending and blocks duplicate requests');
   await panel.getByRole('alert').waitFor();check(await panel.isVisible(),'failed notification settings launch preserves panel');
   check(await panel.getByRole('alert').innerText().then(s=>s.length<=340),'long launch failure is bounded and wraps');check(pageErrors.length===0,'notification launch failure produces no unhandled rejection');
   await p.screenshot({path:'output/playwright/new-shell-after-notification-error390.png'});
  }finally{await context.close();}
 }
 return results;
}
