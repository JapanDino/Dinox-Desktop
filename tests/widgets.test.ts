import {describe,it,expect} from 'bun:test';
import {newFocus,readFocus,secondsLeft,toggleFocus,shiftMonth} from '../src/widgets/model';
describe('widget focus session',()=>{
  it('uses a deadline across hide, reload and sleep, with no background ticks',()=>{
    const running=toggleFocus({...newFocus(),task:'Write'},1000);
    const restored=readFocus(JSON.stringify(running));
    expect(secondsLeft(restored,1000+10*60000)).toBe(15*60);
    expect(secondsLeft(restored,1000+40*60000)).toBe(0);
    expect(restored.task).toBe('Write');
  });
  it('pauses, resumes and restarts completed sessions',()=>{
    const running=toggleFocus(newFocus(15),5000),paused=toggleFocus(running,65000);
    expect(paused.deadline).toBeNull();expect(secondsLeft(paused,999999)).toBe(840);
    const resumed=toggleFocus(paused,100000);expect(resumed.deadline).toBe(940000);
    const restarted=toggleFocus(resumed,1000000);expect(secondsLeft(restarted,1000000)).toBe(900);
  });
  it('rejects corrupt persisted state and clamps backward-clock jumps',()=>{
    for(const raw of ['bad','null','{}',JSON.stringify({...newFocus(),remaining:-1}),JSON.stringify({...newFocus(),deadline:'tomorrow'})])expect(readFocus(raw)).toEqual(newFocus());
    const state=toggleFocus(newFocus(),100000);expect(secondsLeft(state,0)).toBe(1500);
    expect(readFocus(JSON.stringify({...newFocus(),task:'a'.repeat(500)})).task.length).toBe(160);
  });
  it('month navigation never skips February from January 31',()=>{
    const next=shiftMonth(new Date(2026,0,31),1);expect(next.getMonth()).toBe(1);expect(next.getDate()).toBe(1);
    expect(shiftMonth(new Date(2026,0,1),-1).getFullYear()).toBe(2025);
  });
});
