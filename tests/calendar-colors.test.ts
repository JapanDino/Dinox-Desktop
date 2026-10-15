import {test,expect} from 'bun:test';
import {accountSources,collectionColor,type CalendarAccount} from '../src/calendar/accounts';
import {parseCalendar} from '../src/calendar/model';
const account:CalendarAccount={id:'a',provider:'google',label:'Demo',collections:[
 {id:'one',name:'Work',kind:'event',color:'#4285F4',enabled:true,writable:true,ics:'',checked:0,items:[{id:'e',title:'Meeting',start:'2026-09-28',end:'2026-09-29',all_day:true,task:false,completed:false,description:'',url:''}]},
 {id:'two',name:'Other',kind:'event',color:'#e67c73',enabled:false,writable:false,ics:'',checked:0,items:[]}
]};
test('provider colors survive mapping and reach rendered event data',()=>{
 const sources=accountSources([account]);
 expect(sources.map(s=>s.color)).toEqual(['#4285F4','#e67c73']);
 expect(sources.map(s=>s.enabled)).toEqual([true,false]);
 expect(parseCalendar(sources[0],Date.parse('2026-09-27'),Date.parse('2026-09-30'))[0].color).toBe('#4285F4');
});
test('fallback colors remain stable across ordering and invalid metadata',()=>{
 const a={id:'one',kind:'event' as const},b={id:'two',kind:'event' as const};
 expect(collectionColor(a)).not.toBe(collectionColor(b));
 expect(collectionColor({...a,color:'var(--bad)'})).toBe(collectionColor(a));
 expect(collectionColor({...a,color:''})).toBe(collectionColor(a));
 const reversed=accountSources([{...account,collections:[...account.collections].reverse()}]);
 expect(reversed.find(s=>s.collectionId==='one')?.color).toBe('#4285F4');
});
