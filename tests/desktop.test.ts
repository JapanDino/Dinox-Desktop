import {test,expect} from 'bun:test';
import {rankApps,moveSelection} from '../src/launcher/model';
import {layoutDraft,layoutChanges,layoutWidgets} from '../src/settings/layoutModel';
test('search ranks exact and prefix matches before token matches and deduplicates paths',()=>{
 const apps=[{name:'My Code Editor',path:'C:/my.exe'},{name:'Code editor',path:'C:/prefix.exe'},{name:'Code',path:'C:/code.exe'},{name:'Code duplicate',path:'c:/CODE.exe'},{name:'Unrelated',path:'C:/other.exe'}];
 expect(rankApps(apps,' CODE ').map(a=>a.name)).toEqual(['Code','Code editor','My Code Editor']);
 expect(rankApps(apps,'editor my').map(a=>a.name)).toEqual(['My Code Editor']);
 expect(rankApps([{name:'Заметки',path:'notes'}],'ЗАМ')).toHaveLength(1);
});
test('search handles empty results, keyboard wrapping and limits initial list',()=>{
 expect(moveSelection(0,-1,4)).toBe(3);expect(moveSelection(3,1,4)).toBe(0);expect(moveSelection(0,1,0)).toBe(0);
 expect(rankApps(Array.from({length:30},(_,i)=>({name:'App '+i,path:String(i)})),'')).toHaveLength(8);
});
test('layout sends changed allowlisted keys only and preserves unrelated snapshot values',()=>{
 const snapshot={'bloom-dock-design':'{"size":40,"showSearch":false}','bloom-language':'ru'};const draft=layoutDraft(snapshot);
 expect(layoutChanges(draft,snapshot)).toEqual({});draft['bloom-island-date']='true';draft['bloom-language']='en';
 expect(layoutChanges(draft,snapshot)).toEqual({'bloom-island-date':'true'});expect(snapshot['bloom-dock-design']).toContain('40');
});
test('malformed and duplicate widget settings cannot crash or overfill the preview',()=>{
 expect(layoutWidgets('bad')).toEqual({left:['weather'],right:['battery']});
 expect(layoutWidgets('{"left":["cpu","ram","disk"],"right":["cpu","net","unknown"]}')).toEqual({left:['cpu','ram'],right:['net']});
});
