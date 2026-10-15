// Regression scenario for the real App shell; provider commands use synthetic fixtures.
// Run with a Playwright page, alongside the existing browser regression helpers.
async function verifyCalendarIslandComposer(page) {
 const checks=[],check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
 await page.goto('http://127.0.0.1:1439/personal-preview.html?app&calendar-sync');
 await page.getByRole('button',{name:'Открыть календарь',exact:true}).click();
 await page.getByRole('button',{name:'+ Создать',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Создание записи'});
 await dialog.getByRole('textbox',{name:'Название записи',exact:true}).fill('Island regression');
 await page.mouse.move(5,700);await page.waitForTimeout(1000);
 check(await dialog.isVisible(),'Pointer leave cannot unmount the composer');
 check(await dialog.evaluate(d=>!!d.closest('.bloom-calendar')&&!!d.closest('.bloom')),'Composer stays in the native island hit region');
 await page.getByRole('button',{name:'Демо-карточка',exact:true}).click();await page.waitForTimeout(500);
 check(await dialog.isVisible(),'Incoming notification cannot replace an active composer');
 check(await dialog.getByRole('textbox',{name:'Название записи',exact:true}).inputValue()==='Island regression','Draft remains intact');
 await dialog.getByRole('textbox',{name:'Название записи',exact:true}).press('Escape');
 check(await dialog.count()===0,'Escape closes and releases the composer');
 const notices=page.getByRole('button',{name:'Закрыть панель уведомлений',exact:true});
 if(await notices.count())await notices.click();
 await page.getByRole('button',{name:'Открыть календарь',exact:true}).click();
 await page.getByRole('button',{name:/^Задачи ·/}).click();
 await page.getByRole('button',{name:'Создать задачу в календаре',exact:true}).click();
 await page.mouse.move(5,700);await page.waitForTimeout(1000);
 check(await dialog.isVisible(),'The task-list plus uses the same hold-open policy');
 await page.setViewportSize({width:390,height:600});
 check(await dialog.evaluate(d=>{const r=d.getBoundingClientRect(),b=d.closest('.bloom').getBoundingClientRect();return r.left>=b.left&&r.right<=b.right&&r.bottom<=b.bottom&&d.scrollWidth<=d.clientWidth;}),'Small-screen composer fits inside clickable bounds');
 await dialog.getByRole('button',{name:'Отмена',exact:true}).click();
 await page.mouse.move(5,590);await page.waitForTimeout(1000);
 check(await page.locator('.bloom').evaluate(b=>b.getBoundingClientRect().height<50),'Normal auto-collapse resumes after dismissal');
 return {passed:checks.length,checks};
}
