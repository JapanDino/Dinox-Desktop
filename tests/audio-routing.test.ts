import {describe,it,expect} from 'bun:test';
import {canRoute,confirmRoute,routeKey} from '../src/system/audioRouting';
describe('app audio output confirmation',()=>{
 const app={id:'session',name:'Music',process_id:42,process_started_at:'133071638117671502',route_supported:true};
 it('requires a live process identity and native capability',()=>{
  expect(canRoute(app)).toBe(true);
  expect(canRoute({...app,process_id:0})).toBe(false);
  expect(canRoute({...app,process_started_at:null})).toBe(false);
  expect(canRoute({...app,route_supported:false})).toBe(false);
  expect(canRoute({id:'legacy',name:'Legacy fixture'})).toBe(false);
 });
 it('distinguishes a restarted PID from the previous process',()=>expect(routeKey(app)).not.toBe(routeKey({...app,process_started_at:'133071638117671503'})));
 it('accepts a confirmed preference while an old stream stays on its old output',()=>{
  expect(confirmRoute({state:'preference_confirmed',process_id:42,device_id:'headphones',stream_on_target:false},42,'headphones').stream_on_target).toBe(false);
 });
 it('requires exact app and endpoint readback, including reset to default',()=>{
  expect(()=>confirmRoute({state:'preference_confirmed',process_id:43,device_id:'headphones',stream_on_target:true},42,'headphones')).toThrow();
  expect(()=>confirmRoute({state:'preference_confirmed',process_id:42,device_id:'speakers',stream_on_target:true},42,'headphones')).toThrow();
  expect(()=>confirmRoute({state:'preference_confirmed',process_id:42,device_id:'headphones'},42,'headphones')).toThrow();
  expect(()=>confirmRoute(undefined,42,null)).toThrow();
  expect(confirmRoute({state:'preference_confirmed',process_id:42,device_id:null,stream_on_target:false},42,null).device_id).toBeNull();
 });
});
