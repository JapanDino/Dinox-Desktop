import {test,expect} from 'bun:test';
import {confirmedAdjustment} from '../src/system/confirmedAdjustment';
test('last slider input survives an in-flight write and stale hardware poll',async()=>{
 let release!:(value:number)=>void;let shown=20;const writes:number[]=[];
 const c=confirmedAdjustment(20,v=>{writes.push(v);return writes.length===1?new Promise(resolve=>{release=resolve;}):Promise.resolve(v);},v=>shown=v,()=>{});
 c.change(30);const first=c.flush();c.change(41);c.receive(20);expect(shown).toBe(41);release(30);await first;await Promise.resolve();expect(writes).toEqual([30,41]);expect(shown).toBe(41);c.cancelTimer();
});
test('failed hardware apply restores confirmed value; repeated flush does not duplicate writes',async()=>{
 let shown=20,error:unknown=null,calls=0;
 const c=confirmedAdjustment(20,async()=>{calls++;throw 'driver refused';},v=>shown=v,e=>error=e);
 c.change(35);await c.flush();await c.flush();expect(shown).toBe(20);expect(error).toBe('driver refused');expect(calls).toBe(1);c.receive(22);expect(shown).toBe(22);c.cancelTimer();
});
