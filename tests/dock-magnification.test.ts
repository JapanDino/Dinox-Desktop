import {describe,expect,test} from 'bun:test';
import {magnification} from '../src/dock/magnification';
describe('dock magnification spacing',()=>{
 test('bounded artwork cannot exceed the available icon spacing',()=>{
  for(const size of [24,32,40,48,64,80])for(const gap of [0,2,4,8,16,24]){
   const center=magnification(0,size,gap);
   expect(center).toBeGreaterThanOrEqual(1);
   expect(center).toBeLessThanOrEqual(1.22);
   expect((center-1)*size).toBeLessThanOrEqual(Math.max(0,gap-2)+1e-8);
   expect(magnification(size*3,size,gap)).toBe(1);
   expect(magnification(size/2,size,gap)).toBe(magnification(-size/2,size,gap));
   expect(magnification(size/2,size,gap)).toBeLessThanOrEqual(center);
  }
 });
 test('invalid geometry produces no animation',()=>{
  for(const args of [[NaN,40,8],[0,0,8],[0,NaN,8],[0,40,Infinity]])expect(magnification(...args as [number,number,number])).toBe(1);
 });
});
