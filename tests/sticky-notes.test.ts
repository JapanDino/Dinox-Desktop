import {describe,it,expect} from 'bun:test';
import {newNote,validateNote,textDocument,filterNotes,safeSource,safeImage} from '../src/notes/model';
describe('sticky note data boundaries',()=>{
 it('rejects active content, remote images and excessive documents',()=>{
  const note=newNote('Text');expect(validateNote(note)).toBe(note);
  for(const doc of [{type:'doc',content:[{type:'script',text:'x'}]},{type:'doc',content:[{type:'image',attrs:{src:'https://remote/image'}}]},textDocument('a'.repeat(100001))])expect(()=>validateNote({...note,doc})).toThrow();
  expect(safeSource('javascript:alert(1)')).toBe(false);expect(safeSource('https://user:pass@example.com')).toBe(false);expect(safeSource('https://example.com')).toBe(true);expect(safeImage('data:image/svg+xml;base64,abcd')).toBe(false);
 });
 it('separates trash, searches text and puts pinned notes first',()=>{
  const a={...newNote('Alpha'),updated:100},b={...newNote('Beta'),pinned:true,updated:50},c={...newNote('Alpha deleted'),deletedAt:10};
  expect(filterNotes([a,b,c],'').map(n=>n.id)).toEqual([b.id,a.id]);expect(filterNotes([a,b,c],'alpha')).toEqual([a]);expect(filterNotes([a,b,c],'',true)).toEqual([c]);
 });
});
