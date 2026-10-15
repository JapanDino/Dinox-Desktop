/** Synthetic browser fixtures only; never launches the native shell. */
export async function verifyIslandHover(page,baseUrl='http://127.0.0.1:1440'){
 const results=[], browser=page.context().browser();
 for(const position of ['top-left','top-center','top-right','left','right','bottom']){
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.addInitScript(position=>{const s={'bloom-first-run':'false','bloom-app-version':'4.2.2','bloom-scale':'1.3','bloom-notch-mode':'hover','bloom-island-position':position};for(const[k,v]of Object.entries(s))localStorage.setItem(k,v);localStorage.setItem('dinox-v4-demo-settings',JSON.stringify(s));},position);
  const p=await context.newPage();try{
   await p.goto(baseUrl+'/personal-preview.html?app');await p.locator('.bloom').waitFor({state:'attached'});await p.mouse.move(1200,800);
   await p.waitForFunction(()=>{const s=getComputedStyle(document.querySelector('.bloom'));return s.opacity==='0'&&s.pointerEvents==='none';});results.push(position+': hidden without intercepting clicks');
   await p.evaluate(()=>window.previewEmit('notch-edge-hover',true));await p.waitForFunction(()=>getComputedStyle(document.querySelector('.bloom')).opacity==='1');results.push(position+': edge hover reveals');
   await p.evaluate(()=>window.previewEmit('notch-edge-hover',false));await p.waitForFunction(()=>getComputedStyle(document.querySelector('.bloom')).opacity==='0');results.push(position+': hides after hover grace');
  }finally{await context.close();}
 }
 return results;
}
