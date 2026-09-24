import {test,expect} from 'bun:test';
import {pairs} from '../src/i18n/catalog';
import {setLanguage,tr,trError,locale,subscribeLanguage} from '../src/i18n/core';
import {eventTitle, type CalendarEvent} from '../src/calendar/model';
test('both languages preserve every template parameter',()=>{
  for(const [ru,en] of pairs){const parameters=(s:string)=>[...s.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort();expect(parameters(ru)).toEqual(parameters(en));}
});
test('live language changes translate labels and keep user payloads intact',()=>{
  let changes=0;const stop=subscribeLanguage(()=>changes++);
  setLanguage('ru');const initial=changes;
  expect(tr('Open calendar')).toBe('Открыть календарь');expect(locale()).toBe('ru-RU');
  setLanguage('en');expect(changes).toBe(initial+1);expect(tr('Открыть календарь')).toBe('Open calendar');
  expect(tr('Скрыть уведомление {0}','Мой Telegram')).toBe('Dismiss notification from Мой Telegram');
  expect(tr('Моя встреча с командой')).toBe('Моя встреча с командой');
  setLanguage('en');expect(changes).toBe(initial+1);stop();setLanguage('ru');
});
test('native and worker errors translate with values preserved',()=>{
  setLanguage('en');
  expect(trError(new Error('Введите ссылку подписки'))).toBe('Enter a subscription URL');
  expect(trError('Сервис календаря ответил HTTP 403. Проверьте доступ к подписке.')).toBe('The calendar service returned HTTP 403. Check subscription access.');
  expect(trError('Error: Календарь не найден')).toBe('Calendar not found');
  setLanguage('unsupported');expect(locale()).toBe('ru-RU');
});

test('cached calendar titles localize only when missing',()=>{
  const empty={title:''} as CalendarEvent;
  const supplied={title:'Без названия'} as CalendarEvent;
  setLanguage('ru');expect(eventTitle(empty)).toBe('Без названия');
  setLanguage('en');expect(eventTitle(empty)).toBe('Untitled');
  expect(eventTitle(supplied)).toBe('Без названия');
  setLanguage('ru');
});
