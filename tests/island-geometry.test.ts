import {describe,expect,test} from 'bun:test';
import {islandPosition,islandEdge,islandInsets,clampIslandSize} from '../src/settings/islandGeometry';
describe('island placement',()=>{
 test('fitted dock measurements reserve actual CSS extent without changing saved design',()=>{
  expect(islandInsets('top-center','{}',true,225,{edge:'bottom',thickness:32}).bottom).toBe(32);
  expect(islandInsets('bottom','{}',true,225,{edge:'bottom',thickness:32}).bottom).toBe(44);
  for(const thickness of [0,-5,NaN,Infinity])expect(islandInsets('top-center','{}',true,225,{edge:'bottom',thickness}).bottom).toBe(90);
  expect(islandInsets('top-center','{}',true,225,{edge:'left',thickness:32}).bottom).toBe(90);
 });
 test('old or corrupt settings keep the top-center position',()=>{expect(islandPosition(undefined)).toBe('top-center');expect(islandPosition('rotated')).toBe('top-center');expect(islandEdge('top-right')).toBe('top');});
 test('shared edges leave room for the real dock thickness and labels',()=>{const dock=JSON.stringify({edge:'left',size:64,padding:18,offset:28,labels:true});expect(islandInsets('left',dock).left).toBe(169);expect(islandInsets('right',dock).right).toBe(12);expect(islandInsets('left',dock,false).left).toBe(12);});
 test('invalid dock values cannot push the panel beyond the desktop',()=>{for(const raw of ['broken','null','[]','1'])expect(islandInsets('bottom',raw).bottom).toBe(102);const d=islandInsets('bottom',JSON.stringify({size:999,padding:999,offset:999}));expect(d.bottom).toBe(154);});
 test('expanded content fits small viewports and either side',()=>{const inset=islandInsets('right',JSON.stringify({edge:'right'}));expect(clampIslandSize(820,650,{width:390,height:600},inset)).toEqual({width:276,height:576});});
 test('side expansion keeps the header anchored and reserves inward space',()=>{const inset=islandInsets('left','{}',true,600);expect(inset.top).toBe(120);expect(clampIslandSize(820,650,{width:390,height:600},inset).height).toBe(378);expect(islandInsets('left','{}',true,1800).top).toBe(180);});
 test('expanded panels also avoid a dock on the opposite edge',()=>{const inset=islandInsets('left',JSON.stringify({edge:'right'}),true,600);expect(inset.right).toBe(90);expect(clampIslandSize(820,650,{width:390,height:600},inset).width).toBe(276);expect(islandInsets('top-center','{}').bottom).toBe(90);});
});
