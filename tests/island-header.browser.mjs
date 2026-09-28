async function verifyHeader(page) {
  const context=await page.context().browser().newContext({viewport:{width:1280,height:800}});
  const p=await context.newPage(),checks=[];
  try {
    await p.addInitScript(()=>{
      localStorage.setItem('bloom-first-run','false');localStorage.setItem('bloom-app-version','4.1.0');
      const settings={'bloom-language':'ru','bloom-island-date':'true','bloom-island-cpu':'true','bloom-island-battery':'true','bloom-notch-mode':'fixed'};
      for(const [key,value] of Object.entries(settings))localStorage.setItem(key,value);
      localStorage.setItem('dinox-v4-demo-settings',JSON.stringify(settings));
    });
    await p.goto('http://127.0.0.1:1439/personal-preview.html?app');
    await p.evaluate(()=>document.fonts.ready);
    await p.waitForFunction(()=>document.querySelector('.bloom')?.getBoundingClientRect().height===36);
    const measure=async(name,action)=>{
      await p.evaluate(()=>{
        window.headerFrames=[];window.headerDone=false;
        const start=performance.now(),capture=()=>{
          window.headerFrames.push(['.time','.island-date','.side-content.left .passive-feature','.side-content.right .passive-feature'].map(s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{x:r.x,y:r.y}:null;}));
          if(performance.now()-start<800)requestAnimationFrame(capture);else window.headerDone=true;
        };capture();
      });
      await action();await p.waitForFunction(()=>window.headerDone);
      const drift=await p.evaluate(()=>[0,1,2,3].map(i=>{
        const values=window.headerFrames.map(f=>f[i]).filter(Boolean);
        return Math.max(Math.max(...values.map(v=>v.x))-Math.min(...values.map(v=>v.x)),Math.max(...values.map(v=>v.y))-Math.min(...values.map(v=>v.y)));
      }));
      if(drift.some(d=>d>1))throw new Error(`${name}: header drift ${drift}`);
      checks.push({name,drift});
    };
    for(const width of [1280,390]){
      await p.setViewportSize({width,height:800});await p.mouse.move(20,700);await p.waitForTimeout(550);
      await measure(`${width}: hover`,()=>p.getByRole('button',{name:'Открыть календарь',exact:true}).hover());
      await measure(`${width}: calendar`,()=>p.getByRole('button',{name:'Открыть календарь',exact:true}).click());
      await measure(`${width}: collapse`,()=>p.mouse.move(20,700));
      await measure(`${width}: notification`,()=>p.getByRole('button',{name:'Демо-карточка',exact:true}).click());
      await p.getByRole('button',{name:'Закрыть панель уведомлений',exact:true}).click();await p.mouse.move(20,700);await p.waitForTimeout(550);
    }
    return {passed:checks.length,checks};
  }finally{await context.close();}
}
