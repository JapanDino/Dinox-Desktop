import {describe,it,expect} from 'bun:test';
import {tasksFrom,linksFrom,noteFrom,validTarget,validDate,readWidgetLayout} from '../src/widgets/personalModel';
describe('personal widget persisted data',()=>{
  it('repairs invalid layout without duplicate or injected cards',()=>{
    const layout=readWidgetLayout('{"order":["music","music",99,"unknown"],"wide":["music","unknown"]}');
    expect(layout.order[0]).toBe('music');expect(layout.order.length).toBe(7);expect(layout.wide).toEqual(['music']);expect(readWidgetLayout('broken').order.length).toBe(7);
  });
  it('rejects corrupt records and duplicate IDs without silently filtering them',()=>{
    const row={id:'a',text:'Task',done:false};expect(tasksFrom([row])).toEqual([row]);
    for(const value of [null,{},[row,row],[{...row,done:1}],[{...row,due:'2026-02-30'}]])expect(()=>tasksFrom(value)).toThrow();
    expect(()=>linksFrom([{id:'a',name:22,target:'x'}])).toThrow();
    expect(()=>noteFrom({text:'do not erase'})).toThrow();expect(()=>noteFrom('x'.repeat(20001))).toThrow();
  });
  it('keeps dates exact, including leap years',()=>{
    expect(validDate('2028-02-29')).toBe(true);expect(validDate('2026-02-29')).toBe(false);expect(validDate('')).toBe(true);expect(validDate('September')).toBe(false);
  });
  it('accepts explicit web destinations and Windows paths but rejects commands and script protocols',()=>{
    for(const target of ['https://example.com/a?q=x','C:\\Projects\\FAIO','D:/apps/app.exe','\\\\server\\share\\file.md'])expect(validTarget(target)).toBe(true);
    for(const target of ['javascript:alert(1)','file:///C:/x','cmd /c calc','https://user:pass@example.com','https://','C:\\foo\nbar','data:text/html,a'])expect(validTarget(target)).toBe(false);
  });
});
