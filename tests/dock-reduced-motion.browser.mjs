/** Browser fixtures only. Motion runs normally; animations are never paused. */
export async function verifyDockReducedMotion(page,baseUrl='http://127.0.0.1:1440'){
 const ctx=await page.context().browser().newContext({viewport:{width:1280,height:600},reducedMotion:'reduce'}),p=await ctx.newPage(),results=[];
 const check=(value,label)=>{if(!value)throw Error(label);results.push(label);};
 const active=()=>document.getAnimations().filter(a=>['running','pending'].includes(a.playState)).length;
 try{
  await ctx.addInitScript(()=>{const s={'bloom-language':'ru','bloom-unified-appearance':'true','bloom-dock-mode':'fixed','bloom-personal-eco':'false'};for(const[k,v]of Object.entries(s))localStorage.setItem(k,v);localStorage.setItem('dinox-v4-demo-settings',JSON.stringify(s));});
  await p.goto(baseUrl+'/personal-preview.html?dock');await p.locator('.dock-expanded').waitFor();await p.waitForFunction(()=>document.querySelectorAll('.dock-reorder-group .dock-icon[role=button]').length>=2);
  check(await p.evaluate(active)===0,'reduced-motion initial dock has no active browser animation');
  const pin=p.locator('.dock-reorder-group .dock-icon[role=button]').first();await pin.focus();await pin.press('Alt+ArrowRight');
  await p.waitForFunction(()=>JSON.parse(localStorage.getItem('dinox-v4-demo-pins-false')||'[]')[0]?.name==='Telegram');
  await p.waitForFunction(()=>document.querySelector('.dock-reorder-group .dock-icon[role=button]')?.getAttribute('aria-label')==='Telegram');
  check(await p.evaluate(active)===0,'reduced-motion reorder has no active browser animation');
  const frames=await p.locator('.dock-reorder-group').evaluate(async el=>{const sample=()=>Array.from(el.querySelectorAll('[role=button]')).map(n=>[n.getAttribute('aria-label'),Math.round(n.getBoundingClientRect().x*10)/10,getComputedStyle(n).transform]);const snapshots=[];for(let i=0;i<8;i++){await new Promise(requestAnimationFrame);snapshots.push(sample());}return snapshots;});
  check(frames.every(frame=>JSON.stringify(frame)===JSON.stringify(frames[0])),'reordered icon positions stay stable across live animation frames');
  await p.reload();await p.locator('.dock-expanded').waitFor();await p.locator('.dock-reorder-group .dock-icon[role=button]').first().waitFor();
  check(await p.evaluate(active)===0,'reduced-motion reload has no active browser animation');
  await p.emulateMedia({reducedMotion:'no-preference'});
  await p.goto(baseUrl+'/personal-preview.html?dock&stress');const next=p.getByRole('button',{name:'Следующие приложения',exact:true});await next.waitFor();await p.waitForTimeout(500);const first=await p.locator('.dock-reorder-group .dock-icon').first().getAttribute('aria-label');await next.click();
  await p.waitForFunction(name=>document.querySelector('.dock-reorder-group .dock-icon')?.getAttribute('aria-label')!==name,first);
  check(await p.getByRole('button',{name:'Предыдущие приложения',exact:true}).isEnabled(),'normal-motion page arrows still switch dock pages');
  await p.getByRole('button',{name:'Быстрые настройки',exact:true}).click();const panel=p.getByRole('dialog',{name:'Быстрые настройки',exact:true});await panel.waitFor();await panel.getByRole('button',{name:/Wi-Fi/}).click();await p.getByRole('dialog',{name:'Wi-Fi',exact:true}).waitFor();await p.keyboard.press('Escape');await panel.waitFor();
  check(await panel.isVisible(),'normal-motion quick settings and Wi-Fi navigation still work');await p.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
  return results;
 }finally{await ctx.close();}
}
