/** Synthetic browser fixtures only; never launches the native shell. */
export async function verifyUXDialogs(page,baseUrl='http://127.0.0.1:1440'){
 const results=[];const check=(v,label)=>{if(!v)throw Error(label);results.push(label);};const browser=page.context().browser();
 async function open(query,extra={}){const context=await browser.newContext({viewport:{width:800,height:900}});await context.addInitScript(s=>{for(const[k,v]of Object.entries(s))localStorage.setItem(k,v);localStorage.setItem('dinox-v4-demo-settings',JSON.stringify(s));},{'bloom-language':'ru','bloom-unified-appearance':'true','bloom-app-version':'4.2.2',...extra});const p=await context.newPage();await p.goto(baseUrl+'/personal-preview.html'+query);return {context,p};}
 {
  const {context,p}=await open('?calendar-sync&spanning-events');try{
   const event=p.locator('.cal-span-event').first();await event.waitFor();await event.click();const dialog=p.getByRole('dialog');await dialog.waitFor();check(await dialog.evaluate(el=>el.contains(document.activeElement)),'calendar detail focuses close button');await p.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});check(await event.evaluate(el=>el===document.activeElement),'calendar detail Escape restores focus');
  }finally{await context.close();}
 }
 {
  const {context,p}=await open('?desktop=widgets');try{
   await p.getByRole('button',{name:'Новая заметка',exact:true}).click();await p.locator('.tiptap').waitFor();check(await p.locator('.tiptap').evaluate(el=>el.contains(document.activeElement)),'new note focuses editable text');await p.keyboard.type('Проверка заметки');check(await p.locator('.tiptap').innerText()==='Проверка заметки','new note accepts text immediately');await p.screenshot({path:'output/playwright/after-notes.png',fullPage:true});
  }finally{await context.close();}
 }
 for(const mode of ['search','widgets']){
  const {context,p}=await open('?desktop='+mode,{'bloom-unified-appearance':'false','bloom-theme-mode':'light'});try{
   await p.locator(mode==='search'?'.dinox-launcher':'.widget-board').waitFor();await p.screenshot({path:`output/playwright/theme-light-${mode}.png`,fullPage:true});check(await p.evaluate(()=>document.documentElement.classList.contains('light-mode')),`${mode}: applies saved light theme without settings window`);
  }finally{await context.close();}
 }
 {
  const {context,p}=await open('?workspace&notifications-allowed');try{
   await p.getByRole('button',{name:'Тестовое сообщение Telegram'}).waitFor();await p.getByRole('button',{name:'Тестовое сообщение Telegram'}).click();await p.locator('.bloom-notifications').waitFor();check(await p.locator('.bloom-notifications').getAttribute('role')==='region','incoming notice uses nonmodal region');check(await p.locator('.bloom-notifications').evaluate(el=>!el.contains(document.activeElement)),'background notice does not steal keyboard focus');await p.keyboard.press('Escape');await p.locator('.bloom-notifications').waitFor({state:'hidden'});check(true,'Escape closes notification popup');
  }finally{await context.close();}
 }
 return results;
}
