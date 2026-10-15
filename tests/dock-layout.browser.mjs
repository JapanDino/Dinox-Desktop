/** Browser fixture only: no Windows settings, apps or accounts are changed. */
export async function verifyDockLayout(page,base='http://127.0.0.1:1440'){
 const results=[];const assert=(condition,label)=>{if(!condition)throw new Error(label);results.push(label);};
 for(const edge of ['bottom','left','right']){
  const context=await page.context().browser().newContext({viewport:{width:1280,height:800}});
  const test=await context.newPage();
  try{
   await context.addInitScript(edge=>{localStorage.setItem('bloom-language','ru');localStorage.setItem('bloom-dock-design',JSON.stringify({edge}));localStorage.setItem('dinox-v4-demo-settings',JSON.stringify({'bloom-dock-design':JSON.stringify({edge}),'bloom-dock-mode':'fixed'}));},edge);
   await test.goto(`${base}/personal-preview.html?dock`);await test.locator('.dock-expanded').waitFor();await test.waitForTimeout(900);
   const box=await test.locator('.dock').boundingBox();assert(box&&box.x>=-1&&box.y>=-1&&box.x+box.width<=1281&&box.y+box.height<=801,`${edge}: dock fits viewport`);
   assert(await test.locator(`[data-dock-edge="${edge}"]`).count()===1,`${edge}: edge applied`);
   if(edge==='left')assert(box.x<40,`${edge}: dock at left`);
   if(edge==='right')assert(box.x+box.width>1240,`${edge}: dock at right`);
   const icon=test.locator('.dock-icon[role=button]').nth(1);await icon.focus();await icon.press('Shift+F10');await test.locator('.context-menu').waitFor();
   assert(await test.locator('.context-menu').getAttribute('role')==='menu',`${edge}: keyboard context menu`);
   await test.getByRole('button',{name:'Добавить приложение в док…',exact:true}).click();await test.getByRole('dialog',{name:'Приложения в доке'}).waitFor();
   const dialogBox=await test.locator('.dock-pin-manager').boundingBox();assert(dialogBox&&dialogBox.x>=0&&dialogBox.y>=0&&dialogBox.x+dialogBox.width<=1280&&dialogBox.y+dialogBox.height<=800,`${edge}: unified manager fits`);
   const rows=test.locator('.dock-pin-list li');await rows.first().waitFor();assert(await rows.first().locator('.dock-pin-app-icon').count()===1,`${edge}: pin icons visible`);
   if(edge==='bottom'){
    const before=await rows.locator('.dock-pin-name').allTextContents();await rows.first().getByRole('button',{name:/Ниже:/}).click();await test.getByRole('status').filter({hasText:'Изменения сохранены'}).waitFor();
    const after=await rows.locator('.dock-pin-name').allTextContents();assert(after[1]===before[0]&&after.length===before.length,'saved full-list order preserves pins');
    await test.locator('.dock-pin-manager>header button').press('Escape');await test.locator('.dock-pin-manager').waitFor({state:'hidden'});await test.reload();await test.locator('.dock-expanded').waitFor();
    const persisted=await test.evaluate(()=>JSON.parse(localStorage.getItem('dinox-v4-demo-pins-false')).map(a=>a.name));assert(persisted.join('|')===after.join('|'),'order survives browser reload');
   }else{await test.locator('.dock-pin-manager>header button').press('Escape');await test.locator('.dock-pin-manager').waitFor({state:'hidden'});assert(await test.locator('.dock-pin-manager').count()===0,`${edge}: Escape closes manager`);}
  }finally{await context.close();}
 }
 return results;
}
