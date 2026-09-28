async function verifyPersonalWidgets(page){
  const base='http://127.0.0.1:1439/personal-preview.html?desktop=widgets',checks=[];
  const check=(ok,name)=>{if(!ok)throw new Error(name);checks.push(name);};
  const go=async(s='')=>{await page.goto(base+s);await page.getByRole('heading',{name:'Мой день',exact:true}).waitFor();};
  await go();await page.evaluate(()=>{for(const key of ['dinox-widget-tasks-data','dinox-widget-note-data','dinox-widget-projects-data'])localStorage.removeItem(key);});await go();
  check(await page.locator('.wb-card').count()===7,'Seven independent cards');
  check(await page.locator('.wb-month').isVisible(),'Compact month by default');
  await page.getByRole('textbox',{name:'Новая задача',exact:true}).fill('Подготовить проект');await page.getByLabel('Срок новой задачи',{exact:true}).fill('2026-10-01');await page.getByRole('button',{name:'Добавить задачу',exact:true}).click();
  await page.getByRole('checkbox',{name:/Подготовить проект/}).check();await go();
  check(await page.getByRole('checkbox',{name:/Подготовить проект/}).isChecked(),'Task completion and date survive reload');
  await page.getByRole('button',{name:'Удалить: Подготовить проект'}).click();await page.getByRole('button',{name:'Вернуть удалённую задачу'}).click();
  check(await page.getByRole('checkbox',{name:/Подготовить проект/}).count()===1,'Task deletion can be undone');
  const add=async(target)=>{await page.getByRole('button',{name:'Добавить ссылку или путь'}).click();await page.getByRole('textbox',{name:'Название проекта'}).fill('FAIO');await page.getByRole('textbox',{name:'Ссылка или путь',exact:true}).fill(target);await page.getByRole('button',{name:'Закрепить',exact:true}).click();};
  await add('javascript:alert(1)');check(await page.getByRole('alert').count()===1,'Unsafe project target rejected');
  await page.getByRole('textbox',{name:'Ссылка или путь',exact:true}).fill('https://example.com/faio');await page.getByRole('button',{name:'Закрепить',exact:true}).click();await go();
  await page.locator('.wb-project-list').getByRole('button',{name:/FAIO https/}).click();
  check(await page.evaluate(()=>document.documentElement.dataset.widgetTarget)==='https://example.com/faio','Pinned link uses native command contract');
  await page.getByRole('button',{name:'Удалить: FAIO'}).click();await page.getByRole('button',{name:'Вернуть закрепление'}).click();
  check(await page.locator('.wb-project-list li').count()===1,'Pin deletion can be undone');
  await page.getByRole('button',{name:'Приостановить музыку'}).click();await page.getByRole('button',{name:'Воспроизвести музыку'}).waitFor();check(true,'Music pause follows session event');
  await page.getByRole('button',{name:'Следующий трек'}).click();await page.getByRole('heading',{name:'Morning light',exact:true}).waitFor();check(true,'Next track refreshes title');
  await go('&media-empty');check(await page.getByRole('button',{name:'Воспроизвести музыку'}).isDisabled(),'Empty media disables controls');
  await go('&media-error');await page.locator('.wb-music [role=alert]').waitFor();check(true,'Unavailable media is explained');
  await go('&open-error');await page.locator('.wb-project-list').getByRole('button',{name:/FAIO https/}).click();await page.locator('.wb-projects [role=alert]').waitFor();check(true,'Missing project target is explained');
  await go();await page.getByRole('button',{name:'Настроить виджеты'}).click();await page.getByRole('checkbox',{name:'Заметки',exact:true}).uncheck();await page.getByRole('button',{name:'К виджетам'}).click();
  check(await page.locator('.wb-note').count()===0,'Individual custom card can be hidden');
  await page.getByRole('button',{name:'Настроить виджеты'}).click();await page.getByRole('checkbox',{name:'Заметки',exact:true}).check();await page.getByRole('button',{name:'К виджетам'}).click();
  await page.getByRole('button',{name:'Настроить виджеты'}).click();
  await page.getByRole('button',{name:'Выше: Заметки'}).click();await page.getByRole('combobox',{name:'Размер: Заметки'}).selectOption('wide');await go();
  check(await page.locator('.wb-personal-grid>.wb-card').first().evaluate(e=>e.classList.contains('wb-note')),'Reordering changes DOM order and persists');
  check(await page.locator('.wb-note').evaluate(e=>getComputedStyle(e).gridColumnStart==='span 2'),'Wide card uses two columns');
  for(const width of [1440,800,390]){await page.setViewportSize({width,height:900});check(await page.locator('.widget-board').evaluate(e=>e.scrollWidth===e.clientWidth),`Cards fit ${width}px`);await page.getByRole('button',{name:'Начать',exact:true}).scrollIntoViewIfNeeded();check(await page.getByRole('button',{name:'Начать',exact:true}).isVisible(),`Lower cards reachable at ${width}px`);}
  check(await page.locator('.wb-note').evaluate(e=>getComputedStyle(e).gridColumnStart==='1'),'Wide card collapses on narrow screens');
  await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Настроить виджеты'}).click();await page.getByRole('combobox',{name:'Размер: Заметки'}).selectOption('normal');await page.getByRole('button',{name:'Ниже: Заметки'}).click();await page.getByRole('button',{name:'К виджетам'}).click();
  await page.setViewportSize({width:1440,height:1000});await go();
  await page.evaluate(()=>localStorage.setItem('dinox-widget-tasks-data','{"broken":true}'));await go();check(await page.getByRole('textbox',{name:'Новая задача',exact:true}).isDisabled(),'Corrupt task data preserved without overwrite');
  await page.evaluate(()=>localStorage.setItem('dinox-widget-tasks-data',JSON.stringify([{id:'demo',text:'Подготовить презентацию',done:false,due:'2026-10-01'}])));await go();
  return {passed:checks.length,checks};
}
