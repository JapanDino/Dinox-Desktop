const tabs = [...document.querySelectorAll('[data-preview]')];
const captions = {calendar:'Месяц, неделя и ближайшие встречи — в одном месте.',search:'Приложение, файл или расчёт — начните с одной строки.',widgets:'Задачи, заметки и проекты — поверх ваших окон.'};
function select(tab, focus = false) {
  for (const item of tabs) {
    const active = item === tab;
    item.setAttribute('aria-selected', String(active));
    item.tabIndex = active ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !active;
  }
  document.querySelector('.preview-caption').textContent = captions[tab.dataset.preview];
  if (focus) tab.focus();
}
for (const tab of tabs) {
  tab.addEventListener('click', () => select(tab));
  tab.addEventListener('keydown', event => {
    const i = tabs.indexOf(tab);
    const next = {ArrowRight:(i+1)%tabs.length,ArrowLeft:(i+tabs.length-1)%tabs.length,Home:0,End:tabs.length-1}[event.key];
    if (next !== undefined) { event.preventDefault(); select(tabs[next], true); }
  });
}
