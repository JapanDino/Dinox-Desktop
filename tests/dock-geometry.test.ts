import {test,expect} from 'bun:test';
import {dockEdge,clampPopup,reorderVisible,moveTo} from '../src/dock/geometry';
import {parseDockDesign} from '../src/dockDesign';
const apps=Array.from({length:12},(_,i)=>({path:String(i),name:`App ${i}`}));
test('dock edge defaults migrate old settings and reject unsupported edges',()=>{expect(parseDockDesign('{}').edge).toBe('bottom');expect(parseDockDesign('{"edge":"left"}').edge).toBe('left');expect(parseDockDesign('{"edge":"top"}').edge).toBe('bottom');expect(dockEdge('right')).toBe('right');});
test('visible reorder preserves every pin on other pages',()=>{const next=reorderVisible(apps,['5','4','3']);expect(next.map(a=>a.path)).toEqual(['0','1','2','5','4','3','6','7','8','9','10','11']);expect(apps[3].path).toBe('3');expect(new Set(next.map(a=>a.path)).size).toBe(apps.length);});
test('invalid drag snapshots never lose pins',()=>{expect(reorderVisible(apps,['3','missing'])).toBe(apps);expect(reorderVisible(apps,['3','3'])).toBe(apps);});
test('global move crosses page boundaries without duplicates',()=>{const next=moveTo(apps,2,8);expect(next[8].path).toBe('2');expect(next.length).toBe(12);expect(new Set(next.map(a=>a.path)).size).toBe(12);expect(moveTo(apps,0,-1)).toBe(apps);});
test('popup remains in viewport at every corner and scaled size',()=>{for(const x of [-300,0,800,1600])for(const y of [-200,0,600,1400]){const fit=clampPopup({x,y},{width:360,height:320},{width:1280,height:720});expect(fit.x).toBeGreaterThanOrEqual(8);expect(fit.y).toBeGreaterThanOrEqual(8);expect(fit.x+360).toBeLessThanOrEqual(1272);expect(fit.y+320).toBeLessThanOrEqual(712);}});
