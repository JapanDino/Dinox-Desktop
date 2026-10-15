/** Synthetic DataTransfer and window handles; no native app or real file. */
export async function verifyDockFileDrag(page,base='http://127.0.0.1:1440'){
 const checks=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const c=await page.context().browser().newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'}),p=await c.newPage();
 try{
  await c.addInitScript(()=>{
   const s={'bloom-language':'ru','bloom-dock-mode':'peek','bloom-personal-eco':'off','bloom-dock-design':JSON.stringify({hover:'magnify'})};localStorage.setItem('dinox-v4-demo-settings',JSON.stringify(s));
   localStorage.setItem('dinox-v4-demo-pins-false',JSON.stringify([{path:'C:/Apps/closed.exe',name:'Closed app',icon:null,is_running:false}]));
   window.syntheticCalls=[];let internals;
   Object.defineProperty(window,'__TAURI_INTERNALS__',{configurable:true,get:()=>internals,set:value=>{const original=value.invoke;value.invoke=async(command,args)=>{
    if(command==='get_active_windows')return [{path:'C:/Apps/single.exe',name:'Single',hwnd:1001,is_running:true,icon:null},{path:'C:/Apps/group.exe',name:'First window',hwnd:2001,is_running:true,icon:null},{path:'C:/Apps/group.exe',name:'Second window',hwnd:2002,is_running:true,icon:null}];
    if(command==='capture_window_thumbnail')return ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=',0];
    if(command==='focus_window'||command==='open_app'){window.syntheticCalls.push({command,...args});return;}
    return original(command,args);
   };internals=value;}});
  });
  await p.goto(base+'/personal-preview.html?dock');await p.locator('.dock').waitFor();await p.waitForFunction(()=>!!window.previewEmit);
  await p.mouse.move(0,0);await p.waitForTimeout(1200);
  await p.evaluate(()=>window.previewEmit('dock-edge-hover',true));await p.locator('.dock-expanded').waitFor();
  const dt=await p.evaluateHandle(()=>{const dt=new DataTransfer();dt.items.add(new File(['synthetic'],'test.txt',{type:'text/plain'}));return dt;});
  const single=p.locator('.dock-icon[aria-label="Single"]');await single.waitFor();
  await single.dispatchEvent('dragover',{dataTransfer:dt});await p.locator('.file-drag').waitFor();
  await p.evaluate(()=>window.previewEmit('dock-edge-hover',false));await p.waitForTimeout(750);
  let calls=await p.evaluate(()=>window.syntheticCalls);
  check(calls.length===1&&calls[0].hwnd===1001&&calls[0].toggle===false,'file dwell activates exact running window without minimize toggle');
  check(await p.locator('.dock-expanded').count()===1,'external drag holds auto-hiding dock open after edge exit');
  await single.dispatchEvent('dragover',{dataTransfer:dt});await p.waitForTimeout(700);
  check(await p.evaluate(()=>window.syntheticCalls.length)===1,'repeated dragover does not repeatedly activate window');
  check(await dt.evaluate(d=>d.files.length===1&&d.files[0].name==='test.txt'),'source file payload remains intact');
  check(await p.locator('.dock-icon[aria-label="Closed app"]').getAttribute('data-drag-window')===null,'closed app has no drag activation target');
  await p.locator('.dock-icon[aria-label="Closed app"]').dispatchEvent('dragover',{dataTransfer:dt});await p.waitForTimeout(700);
  check(await p.evaluate(()=>window.syntheticCalls.length)===1,'file hover never launches closed application');
  const group=p.locator('.dock-icon[data-drag-window]').filter({hasText:'impossible'});
  const multi=p.locator('.dock-icon[aria-label="First window"]');await multi.waitFor();
  check(await multi.getAttribute('data-drag-window')===null,'multi-window icon does not guess destination');
  await multi.dispatchEvent('dragover',{dataTransfer:dt});const second=p.locator('.preview-item[aria-label="Second window"]');await second.waitFor();
  await second.dispatchEvent('dragover',{dataTransfer:dt});await p.waitForTimeout(750);calls=await p.evaluate(()=>window.syntheticCalls);
  check(calls.length===2&&calls[1].hwnd===2002&&calls[1].toggle===false,'file dwell on preview activates chosen window');
  await p.evaluate(()=>window.previewEmit('dock-drag-release',null));await p.locator('.file-drag').waitFor({state:'hidden'});
  check(await p.locator('[data-file-drag-target]').count()===0,'native release clears temporary target and lease');
  await p.evaluate(()=>window.previewEmit('dock-edge-hover',true));await p.locator('.dock-expanded').waitFor();
  await single.dispatchEvent('dragover',{dataTransfer:dt});await p.keyboard.press('Escape');await p.waitForTimeout(750);
  check(await p.evaluate(()=>window.syntheticCalls.length)===2,'Escape cancels pending activation');
  const url=await p.evaluateHandle(()=>{const d=new DataTransfer();d.setData('text/uri-list','https://example.org');return d;});
  await single.dispatchEvent('dragover',{dataTransfer:url});await p.waitForTimeout(750);
  check(await p.locator('.file-drag').count()===0&&await p.evaluate(()=>window.syntheticCalls.length)===2,'URL drag does not engage file bridge');
  await single.dispatchEvent('dragover',{dataTransfer:dt});await single.dispatchEvent('drop',{dataTransfer:dt});await p.waitForTimeout(750);
  check(await p.evaluate(()=>window.syntheticCalls.length)===2&&p.url().endsWith('?dock'),'dropping on dock cancels safely without file navigation');
  await c.close();return checks;
 }catch(e){await p.screenshot({path:'output/playwright/file-drag-failure.png'});await c.close();throw e;}
}
