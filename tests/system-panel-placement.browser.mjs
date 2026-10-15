/** Synthetic browser fixtures only; never launches the native shell. */
export async function verifySystemPanelPlacement(page,baseUrl='http://127.0.0.1:1440'){
 const results=[];const check=(v,label)=>{if(!v)throw Error(label);results.push(label);};
 for(const edge of ['left','right','bottom']){
  const ctx=await page.context().browser().newContext({viewport:{width:390,height:450}});await ctx.addInitScript(edge=>{const s={'bloom-language':'ru','bloom-unified-appearance':'true','bloom-dock-mode':'fixed','bloom-dock-design':JSON.stringify({edge})};for(const[k,v]of Object.entries(s))localStorage.setItem(k,v);localStorage.setItem('dinox-v4-demo-settings',JSON.stringify(s));},edge);const p=await ctx.newPage();
  try{
   await p.goto(baseUrl+'/personal-preview.html?dock');await p.getByRole('button',{name:'Быстрые настройки',exact:true}).click();const panel=p.getByRole('dialog',{name:'Быстрые настройки',exact:true});await panel.waitFor();const b=await panel.boundingBox();check(b.x>=0&&b.y>=0&&b.x+b.width<=390&&b.y+b.height<=450,`${edge}: quick controls fit a small screen`);
   await panel.locator('footer button').last().scrollIntoViewIfNeeded();const foot=await panel.locator('footer button').last().boundingBox();check(foot.y+foot.height<=450,`${edge}: last action remains reachable by scroll`);
   await p.screenshot({path:`output/playwright/after-dock-quick-${edge}-390.png`});await p.keyboard.press('Escape');await panel.waitFor({state:'hidden'});check(true,`${edge}: Escape closes quick controls`);
  }finally{await ctx.close();}
 }
 return results;
}
