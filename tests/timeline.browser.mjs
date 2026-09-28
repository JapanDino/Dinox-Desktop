// Synthetic calendars only; both surfaces use the same WeekTimeline component.
async function verifyTimeline(page) {
  const checks=[];
  const check=(ok,name)=>{if(!ok)throw new Error(name);checks.push(name);};
  const context=await page.context().browser().newContext({viewport:{width:1280,height:920},timezoneId:'Europe/Moscow'});
  const test=await context.newPage();
  const inspect=()=>test.locator('.cal-week-scroll').evaluate(el=>{
    const line=el.querySelector('.cal-now-track'),rect=el.getBoundingClientRect(),mark=line?.getBoundingClientRect();
    return {scroll:el.scrollTop,visible:!!mark&&mark.top>=rect.top&&mark.top<rect.bottom,clock:line?.textContent,offset:line?.style.top};
  });
  try {
    await test.clock.install({time:new Date('2026-09-25T18:35:00+03:00')});
    await test.goto('http://127.0.0.1:1439/personal-preview.html');
    await test.getByRole('tab',{name:'Неделя',exact:true}).click();
    await test.getByRole('button',{name:'Сегодня',exact:true}).first().click();
    await test.locator('.cal-now-track').waitFor();
    check((await inspect()).visible,'Main calendar opens at current hour');
    await test.locator('.cal-week-head button').first().click();
    await test.getByRole('tab',{name:'Неделя',exact:true}).click();
    check((await inspect()).visible,'Monday selection in current week still opens at now');
    await test.locator('.cal-week-scroll').evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll',{bubbles:true}));});
    const before=await inspect();
    await test.clock.runFor(60050);
    const after=await inspect();
    check(after.scroll===0,'Minute update preserves manual scroll');
    check(after.offset!==before.offset&&after.clock==='18:36','Clock line advances each minute');
    await test.getByRole('button',{name:'Сегодня',exact:true}).first().click();
    check((await inspect()).visible,'Today recenters even on the same day');
    await test.getByRole('button',{name:'Следующий период',exact:true}).click();
    check(await test.locator('.cal-now-track,.cal-now').count()===0,'Other weeks have no misleading now line');
    await test.getByRole('button',{name:'Сегодня',exact:true}).first().click();
    check((await inspect()).visible,'Return from another week centers now');
    await test.locator('.cal-week-scroll').evaluate(el=>{el.scrollTop=100;el.dispatchEvent(new Event('scroll',{bubbles:true}));});
    await test.getByRole('searchbox').fill('встреча');
    await test.getByRole('searchbox').fill('');
    check(Math.abs((await inspect()).scroll-100)<2,'Search preserves timeline position');
    await test.goto('http://127.0.0.1:1439/personal-preview.html?desktop=widgets');
    await test.locator('.cal-now-track').waitFor();
    check((await inspect()).visible,'Widget defaults to current week and hour');
    check(await test.locator('.cal-now-track>span').evaluate(el=>{const r=el.getBoundingClientRect(),f=el.closest('.cal-week-frame').getBoundingClientRect();return r.left>=f.left&&r.right<=f.right;}),'Time badge visible in desktop widget');
    await test.setViewportSize({width:390,height:844});
    await test.reload();await test.locator('.cal-now-track').waitFor();
    check((await inspect()).visible,'Narrow widget opens at current hour');
    check(await test.locator('.cal-day-column.today').evaluate(el=>{const r=el.getBoundingClientRect(),f=el.closest('.cal-week-frame').getBoundingClientRect();return r.left>=f.left&&r.right<=f.right;}),'Narrow widget brings today column into view');
    return {passed:checks.length,checks};
  } finally {await context.close();}
}
