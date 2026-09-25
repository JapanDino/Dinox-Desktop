import {test,expect} from 'bun:test';
import {calculate} from '../src/launcher/calculator';
import {parseQuery,parseRecent,addRecent,type SearchResult} from '../src/launcher/model';
test('calculator respects precedence, parentheses, unary signs and right associative powers',()=>{
 for(const [input,output]of [['5*3-2','13'],['(120+80)/4','50'],['-2^2','-4'],['2^-2','0.25'],['2^3^2','512'],['1,5 × 2','3'],['0.1+0.2','0.3'],['1e3/4','250'],['10%3','1'],['--3','3']])expect(calculate(input)).toEqual({value:output});
});
test('calculator rejects code, invalid syntax, divide by zero and unbounded work',()=>{
 for(const input of ['alert(1)','Math.random()','1;2','1 2','()','1+','(1+2','2**3'])expect(calculate(input).error).toBe('syntax');
 expect(calculate('1/0').error).toBe('zero');expect(calculate('1%0').error).toBe('zero');expect(calculate('10^10000').error).toBe('range');expect(calculate('1+'.repeat(150))).toEqual({error:'range'});expect(calculate('('.repeat(40)+'1'+')'.repeat(40)).error).toBe('range');
});
test('launcher command prefixes are explicit and removed from search terms',()=>{
 expect(parseQuery(' ? проект ')).toMatchObject({scope:'files',term:'проект'});
 expect(parseQuery('. Telegram')).toMatchObject({scope:'apps',term:'Telegram'});
 expect(parseQuery('!! notes')).toMatchObject({scope:'recent',term:'notes'});
 expect(parseQuery('=5*3-2')).toMatchObject({scope:'calc',term:'5*3-2'});
 expect(parseQuery('y hello & world')).toMatchObject({scope:'web',engine:'yandex',term:'hello & world'});
 expect(parseQuery('google')).toMatchObject({scope:'all',term:'google'});
});
test('session history validates stored data and excludes web queries and calculations',()=>{
 const item:SearchResult={id:'a',kind:'app',name:'App',target:'C:/app.exe',detail:'Application'};
 expect(parseRecent('bad')).toEqual([]);expect(parseRecent('[{"kind":"hint","target":"unsafe"}]')).toEqual([]);
 expect(addRecent([item],{...item,name:'Renamed'})).toEqual([{...item,name:'Renamed'}]);
 expect(addRecent([item],{...item,kind:'web'})).toEqual([item]);expect(addRecent([item],{...item,kind:'calc'})).toEqual([item]);
 expect(addRecent(Array.from({length:30},(_,i)=>({...item,id:String(i),target:String(i)})),item)).toHaveLength(20);
});
