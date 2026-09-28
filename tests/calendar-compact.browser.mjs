async function verifyCompactComposer(page){
 const checks=[],check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
 await page.goto('http://127.0.0.1:1439/personal-preview.html?calendar-sync');
 await page.setViewportSize({width:1280,height:900});
 await page.getByRole('button',{name:'+ Создать',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Создание записи'});
 await dialog.getByRole('textbox',{name:'Название записи',exact:true}).fill('Обсудить дизайн Dinox');
 const bounds=await dialog.boundingBox();
 await dialog.screenshot({path:'output/playwright/calendar-create-card.png'});
 await dialog.getByRole('button',{name:'Детали',exact:true}).click();
 await dialog.getByRole('textbox',{name:'Дата окончания',exact:true}).fill('2026-10-03');
 await dialog.getByRole('textbox',{name:'Описание записи',exact:true}).fill('Обсудим детали и следующий шаг.');
 await dialog.getByRole('button',{name:'Свернуть детали',exact:true}).click();
 check(await dialog.getByRole('button',{name:/^до /}).count()===1,'Collapsed card shows changed end date');
 await dialog.getByRole('button',{name:'Детали · есть описание',exact:true}).click();
 check(await dialog.getByRole('textbox',{name:'Дата окончания',exact:true}).inputValue()==='2026-10-03','End date retained on collapse');
 await page.setViewportSize({width:390,height:600});
 check(await dialog.evaluate(e=>e.scrollWidth===e.clientWidth&&e.getBoundingClientRect().right<=innerWidth),'Expanded details fit narrow window');
 await dialog.getByRole('button',{name:'Создать',exact:true}).scrollIntoViewIfNeeded();
 check(await dialog.getByRole('button',{name:'Создать',exact:true}).isVisible(),'Save stays reachable on short window');
 await dialog.getByRole('button',{name:'Создать',exact:true}).focus();
 await page.keyboard.press('Tab');
 check(await dialog.getByRole('button',{name:'Закрыть создание'}).evaluate(e=>e===document.activeElement),'Keyboard focus stays in dialog');
 await page.keyboard.press('Escape');
 check(await dialog.count()===0,'Escape closes dialog');
 return {passed:checks.length,checks,compact:{width:bounds.width,height:bounds.height}};
}
