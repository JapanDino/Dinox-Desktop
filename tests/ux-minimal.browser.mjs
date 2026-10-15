/** Declutter checks use only isolated demo storage. */
export async function verifyMinimalUX(page,base='http://127.0.0.1:1440') {
 const browser=page.context().browser(),checks=[],check=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const context=await browser.newContext({viewport:{width:1100,height:850},reducedMotion:'reduce'}),p=await context.newPage();
 try{
  await context.addInitScript(()=>{const s={'bloom-language':'ru','bloom-unified-appearance':'true','dinox-widgets-enabled':'true'};for(const[k,v]of Object.entries(s))if(localStorage.getItem(k)===null)localStorage.setItem(k,v);if(localStorage.getItem('dinox-v4-demo-settings')===null)localStorage.setItem('dinox-v4-demo-settings',JSON.stringify(s));});
  await p.goto(base+'/personal-preview.html?desktop=widgets');await p.locator('.wb-card').first().waitFor();
  check(await p.locator('.wb-card').count()===4,'Fresh board has four widgets');
  check(await p.locator('.wb-projects,.wb-music,.wb-today').count()===0,'Optional duplicate or secondary widgets not forced');
  check(await p.locator('.wb-save-status').count()===0,'No repeated successful-save captions');
  await p.getByRole('button',{name:'Настроить виджеты',exact:true}).click();
  for(const name of ['Мои проекты','Музыка','Сегодня'])check(!(await p.getByRole('checkbox',{name,exact:true}).isChecked()),'Settings agree with default: '+name);
  for(const name of ['Мои проекты','Музыка','Сегодня'])await p.getByRole('checkbox',{name,exact:true}).check();
  await p.getByRole('button',{name:'К виджетам',exact:true}).click();check(await p.locator('.wb-card').count()===7,'All optional tools remain available');
  const persisted=await p.evaluate(()=>JSON.parse(localStorage.getItem('dinox-v4-demo-settings')));
  check(['projects','music','today'].every(id=>persisted['dinox-widget-'+id]==='true'),'Explicit optional choices persisted');
  await p.reload();await p.locator('.wb-card').first().waitFor();await p.waitForFunction(()=>document.querySelectorAll('.wb-card').length===7,{},{timeout:10000});check(true,'Saved explicit choices survive reload');
  await p.goto(base+'/personal-preview.html?settings');await p.getByRole('button',{name:'Верхняя панель',exact:true}).click();
  const help=p.locator('.ai-limits-setup');await help.scrollIntoViewIfNeeded();check(!(await help.evaluate(el=>el.open)),'Connection instructions collapsed initially');
  await help.locator('summary').click();check(await help.getByText(/Подключение Claude добавляет/).isVisible(),'Connection disclosure available on demand');
  await p.goto(base+'/personal-preview.html?desktop=search');await p.locator('.dinox-launcher').waitFor();check(await p.locator('.launcher-privacy').count()===0,'Search avoids permanent technical privacy caption');
  await p.locator('.launcher-preferences summary').click();check(await p.getByText(/Файлы: индекс Windows/).isVisible(),'Search privacy remains in preferences');
  await p.goto(base+'/personal-preview.html?desktop=search&shortcut-conflict');await p.getByRole('alert').filter({hasText:'Горячая клавиша занята'}).waitFor();check(true,'Important shortcut warning remains visible');
  await p.goto(base+'/personal-preview.html?calendar-sync');await p.locator('.cal-footer').waitFor();check(await p.locator('.cal-footer small').count()===0,'Calendar avoids duplicated sync metadata row');
  check((await p.locator('.cal-footer>span').getAttribute('title'))?.includes('Автообновление'),'Calendar refresh details remain available');
 }finally{await context.close();}
 return checks;
}
