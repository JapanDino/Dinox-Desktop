import {test,expect} from 'bun:test';
import {popup,livePopups,resumePopups,READING_GRACE_MS} from '../src/notifications/lifetime';
import {sampleNotice} from '../src/notifications/model';

test('popups expire at the configured deadline without pointer interaction',()=>{
  const item=popup(sampleNotice,8,1000);
  expect(livePopups([item],8999,false)).toHaveLength(1);
  expect(livePopups([item],9000,false)).toHaveLength(0);
});
test('lost pointer leave cannot leave a paused popup stuck forever',()=>{
  const item=popup(sampleNotice,8,1000);
  expect(livePopups([item],9000,true)).toHaveLength(1);
  expect(livePopups([item],9000+READING_GRACE_MS,true)).toHaveLength(0);
});
test('hover extensions are bounded across repeated enters and leaves',()=>{
  const items=resumePopups(resumePopups([popup(sampleNotice,8,1000)],10000),10000);
  expect(items[0].expires).toBe(24000);
  expect(livePopups(items,24000,false)).toHaveLength(0);
});
test('sleep/resume drops expired cards and new arrivals have independent lifetimes',()=>{
  const old=popup(sampleNotice,8,1000),fresh=popup({...sampleNotice,id:99},8,100000);
  expect(livePopups([old,fresh],100000,true)).toEqual([fresh]);
  expect(livePopups([old,fresh],200000,true)).toHaveLength(0);
});
