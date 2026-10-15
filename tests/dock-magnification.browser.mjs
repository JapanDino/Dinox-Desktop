export async function verifyDockMagnification(page,base='http://127.0.0.1:1440'){
 const checks=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const c=await page.context().browser().newContext({viewport:{width:1280,height:800},reducedMotion:'no-preference'}),p=await c.newPage();
 try{
  await c.addInitScript(()=>localStorage.setItem('dinox-v4-demo-settings',JSON.stringify({'bloom-language':'ru','bloom-dock-mode':'fixed','bloom-personal-eco':'off','bloom-dock-design':JSON.stringify({hover:'none',size:44,gap:10})})));
  await p.goto(base+'/personal-preview.html?dock');await p.locator('.dock-expanded').waitFor();const icon=p.locator('.dock-reorder-group .dock-icon[role=button]').first();await icon.waitFor();await p.waitForTimeout(900);await icon.hover();
  check(await icon.evaluate(el=>getComputedStyle(el).scale)==='none','magnification is disabled by default');
  await p.evaluate(()=>window.__TAURI_INTERNALS__.invoke('save_setting',{key:'bloom-dock-design',value:JSON.stringify({hover:'magnify',size:44,gap:10})}));await p.locator('.hover-magnify').waitFor();
  const before=await icon.boundingBox();await p.mouse.move(before.x+before.width/2,before.y+before.height/2);await p.waitForTimeout(180);
  const after=await icon.boundingBox();check(after.width>before.width,'opt-in hover magnifies target icon');
  check(Math.abs(before.x+before.width/2-after.x-after.width/2)<1,'magnification leaves icon center anchored');
  const rects=await p.locator('.dock-reorder-group .dock-icon').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().toJSON()));check(rects.every((r,i)=>!i||rects[i-1].right<=r.left+1),'neighboring icon artwork never overlaps');
  const d=await p.evaluateHandle(()=>{const d=new DataTransfer();d.items.add(new File(['x'],'synthetic.txt'));return d;});await icon.dispatchEvent('dragover',{dataTransfer:d});await p.locator('.file-drag').waitFor();
  check(await icon.evaluate(el=>el.style.getPropertyValue('--dock-magnify'))==='','file drag clears magnification');await p.evaluate(()=>window.previewEmit('dock-drag-release',null));
  await p.emulateMedia({reducedMotion:'reduce'});await p.mouse.move(0,0);await icon.hover();await p.waitForTimeout(100);
  check(await icon.evaluate(el=>getComputedStyle(el).scale)==='1','reduced-motion preference disables magnification');
  return checks;
 }finally{await c.close();}
}
