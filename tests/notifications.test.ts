import {test,expect} from 'bun:test';
import {notificationDefaults as defaults,parseNotificationOptions,isQuiet,freshNotices,sampleNotice} from '../src/notifications/model';
import {parseDockDesign,dockDefaults} from '../src/dockDesign';
import {messengerIdentity} from '../src/notifications/model';

test('messenger identity supports Cyrillic and hides identifying initials in private mode',()=>{
  const notice={...sampleNotice,title:'Команда проекта'};
  expect(messengerIdentity(notice,'full')).toEqual({name:'Команда проекта',initials:'КП'});
  expect(messengerIdentity({...notice,title:'🌿 Anna'},'full')?.initials).toBe('A');
  expect(messengerIdentity(notice,'hidden')?.initials).toBe('');
  expect(messengerIdentity(notice,'hidden')?.name).not.toBe(notice.title);
  expect(messengerIdentity({...notice,app_name:'Calculator'},'full')).toBe(null);
});
test('notification access is opt-in even with malformed saved values',()=>{for(const raw of ['', 'null','[]','{"enabled":"true","windowsEnabled":1}']){const o=parseNotificationOptions(raw);expect(o.enabled).toBe(false);expect(o.windowsEnabled).toBe(false);}});
test('notification settings reject invalid times, colors and limits',()=>{const o=parseNotificationOptions('{"quietStart":"25:00","quietEnd":"1:99","accent":"url(x)","duration":0,"maxVisible":100,"blocked":[1,"app"]}');expect(o.quietStart).toBe('22:00');expect(o.quietEnd).toBe('08:00');expect(o.duration).toBe(8);expect(o.maxVisible).toBe(2);expect(o.accent).toBe(defaults.accent);expect(o.blocked).toEqual(['app']);});
test('quiet hours wrap midnight with exclusive end',()=>{const o={...defaults,quiet:true};for(const [h,m,wanted] of [[21,59,false],[22,0,true],[0,0,true],[7,59,true],[8,0,false]]){const d=new Date(2026,8,23,Number(h),Number(m));expect(isQuiet(o,d)).toBe(wanted);}});
test('daytime and all-day quiet hours',()=>{expect(isQuiet({...defaults,quiet:true,quietStart:'09:00',quietEnd:'17:00'},new Date(2026,8,23,12))).toBe(true);expect(isQuiet({...defaults,quiet:true,quietStart:'09:00',quietEnd:'09:00'})).toBe(true);expect(isQuiet(defaults)).toBe(false);});
test('new identities and replacement messages appear',()=>{const old={...sampleNotice,created:10};const next={...old,created:20};expect(freshNotices([old],[old,next])).toEqual([next]);expect(freshNotices([old],[{...old,body:'updated'}])).toEqual([{...old,body:'updated'}]);});
test('dock settings clamp dimensions and reject CSS injection',()=>{const o=parseDockDesign('{"size":999,"gap":-20,"opacity":0,"background":"url(x)","align":"invalid"}');expect(o.size).toBe(64);expect(o.gap).toBe(2);expect(o.opacity).toBe(45);expect(o.background).toBe(dockDefaults.background);expect(o.align).toBe('center');});
