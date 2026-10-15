import {test,expect} from 'bun:test';
import {emptyLimits,remaining,stale,summary,usableWindow,type QuotaWindow} from '../src/aiLimits/model';
const at=1800000000;
const w=(used:number,minutes=300,resets:number|null=at+100):QuotaWindow=>({id:String(minutes),label:'',used,minutes,resets});
test('indicator uses tightest of 5-hour and weekly windows',()=>{const p={...emptyLimits('codex'),checked:at,windows:[w(20),w(85,10080)]};expect(summary(p,at)).toBe('15%');});
test('missing, stale, failed and expired data are never presented as live percentages',()=>{
 expect(summary(emptyLimits('claude'),at)).toBe('—');
 const p={...emptyLimits('claude'),checked:at-601,windows:[w(40)]};expect(stale(p,at)).toBe(true);expect(summary(p,at)).toBe('—');
 expect(summary({...p,checked:at,error:'offline'},at)).toBe('—');
 expect(summary({...p,checked:at,windows:[w(40,300,at)]},at)).toBe('—');
});
test('expiration of one window does not reset the other',()=>{expect(summary({...emptyLimits('codex'),checked:at,windows:[w(90,300,at),w(30,10080)]},at)).toBe('70%');});
test('zero usage is valid but out-of-range usage is not',()=>{expect(usableWindow(w(0),at)).toBe(true);expect(remaining(w(100))).toBe(0);for(const n of [NaN,Infinity,-1,101])expect(usableWindow(w(n),at)).toBe(false);});
test('unknown reset time does not fabricate a reset or a five-hour window',()=>{const other=w(25,60,null);expect(usableWindow(other,at)).toBe(true);expect(other.minutes).toBe(60);expect(summary({...emptyLimits('codex'),checked:at,windows:[other]},at)).toBe('75%');});
