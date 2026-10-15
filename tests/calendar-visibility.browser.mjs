// Synthetic browser regression helper; no provider accounts or live calendar writes.
export async function verifyCalendarVisibility(page) {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 await page.goto('http://127.0.0.1:1439/personal-preview.html?calendar-sync&calendar-many');
 await page.getByRole('tab',{name:'Неделя',exact:true}).click();
 const height=await page.locator('.cal-week-scroll').evaluate(e=>e.clientHeight);
 await page.locator('.cal-sources-button').click();
 check(await page.locator('.cal-week-scroll').evaluate(e=>e.clientHeight)===height,'Source list must not shrink the timeline');
 const source=page.getByRole('checkbox',{name:'Личный календарь · Google События',exact:true});
 await source.uncheck();
 await page.getByRole('button',{name:'Готово',exact:true}).click();
 await page.getByRole('button',{name:'Обновить календарь',exact:true}).click();
 await page.getByRole('button',{name:'Personal planning 10:00–11:00',exact:true}).waitFor({state:'detached'});
 await page.locator('.cal-sources-button').click();
 check(!await source.isChecked(),'Refresh must preserve disabled calendar');
 await page.getByRole('button',{name:'Скрыть все',exact:true}).click();
 await page.getByRole('button',{name:'Готово',exact:true}).click();
 await page.getByRole('heading',{name:'Все календари скрыты',exact:true}).waitFor();
 await page.getByRole('button',{name:'Выбрать календари',exact:true}).click();
 await page.getByRole('button',{name:'Показать все',exact:true}).click();
 await page.getByRole('searchbox',{name:'Найти календарь',exact:true}).fill('Личный');
 check(await page.locator('.cal-picker-list input').count()===1,'Search must narrow the list');
 await page.getByRole('searchbox',{name:'Найти календарь',exact:true}).press('Escape');
 check(await page.locator('.cal-picker').count()===0,'Escape must dismiss the picker');
 return {passed:5};
}
