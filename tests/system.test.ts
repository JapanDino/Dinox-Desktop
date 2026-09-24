import {describe,it,expect} from 'bun:test';
import {parseSystemOptions,systemDefaults,systemStripWidth,panelPosition} from '../src/system/model';
describe('system controls',()=>{
 it('repairs old or malformed preferences without coercing strings',()=>{
   for(const raw of ['null','oops','42'])expect(parseSystemOptions(raw)).toEqual(systemDefaults);
   expect(parseSystemOptions('{"enabled":false,"layout":"false","tray":false}')).toEqual({...systemDefaults,enabled:false,tray:false});
 });
 it('budgets fixed system strip width when fitting many apps',()=>{
   expect(systemStripWidth({...systemDefaults,enabled:false})).toBe(0);
   expect(systemStripWidth({...systemDefaults,compact:true})).toBeLessThan(systemStripWidth(systemDefaults));
   expect(systemStripWidth({...systemDefaults,layout:false,tray:false,percent:false})).toBe(96);
 });
 it('keeps the panel inside native dock viewport at either edge and high DPI',()=>{
   for(const width of [360,640,960,1920])for(const height of [400,600])for(const right of [20,width/2,width-10]){
     const p=panelPosition({right,top:height-70},{width,height});
     expect(p.left).toBeGreaterThanOrEqual(12);expect(p.left+p.width).toBeLessThanOrEqual(width-12);
     expect(p.bottom).toBeGreaterThanOrEqual(82);expect(p.bottom+p.maxHeight).toBeLessThanOrEqual(height-12);
   }
 });
});
