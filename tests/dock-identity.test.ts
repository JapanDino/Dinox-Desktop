import {test,expect} from 'bun:test';
import {appIdentity,mergeWindowGroups} from '../src/dock/identity';
test('application identity ignores changing titles and redundant executable metadata',()=>{
 expect(appIdentity('C:\\Apps\\chrome.exe','chrome.exe','Inbox')).toBe(appIdentity('c:/apps/chrome.exe',undefined,'New tab'));
 expect(appIdentity('shell:AppsFolder\\Package_Pub!App')).toBe(appIdentity('Package_Pub!App'));
 expect(appIdentity('Chrome.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).not.toBe(appIdentity('Chrome.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'));
});
test('native title groups merge under stable application identity and preserve every window',()=>{
 const apps=mergeWindowGroups([{path:'C:/Apps/chrome.exe',name:'Inbox',hwnd:10,all_hwnds:[[10,'Inbox']]},{path:'c:\\Apps\\chrome.exe',name:'New tab',hwnd:20,all_hwnds:[[20,'New tab'],[10,'Inbox updated']]}]);
 expect(apps).toHaveLength(1);expect(apps[0].hwnd).toBe(10);expect(apps[0].all_hwnds).toEqual([[10,'Inbox updated'],[20,'New tab']]);
});
test('separate PWA and Store AUMIDs remain separate applications',()=>{
 const apps=mergeWindowGroups([{path:'Chrome.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',name:'Mail',hwnd:10},{path:'Chrome.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',name:'Mail',hwnd:20},{path:'Package_Pub!App',name:'Mail',hwnd:30}]);
 expect(apps).toHaveLength(3);expect(apps.map(a=>a.all_hwnds?.[0][0])).toEqual([10,20,30]);
});
test('duplicate pins normalize without altering order or mutating input',()=>{
 const pins=[{path:'C:/Apps/notes.exe',name:'Notes'},{path:'c:\\apps\\NOTES.exe',name:'Duplicate'},{path:'Other!App',name:'Other'}];
 expect(mergeWindowGroups(pins).map(a=>a.name)).toEqual(['Notes','Other']);expect(pins).toHaveLength(3);
});
