import type {JSONContent} from '@tiptap/react';
export const noteColors={yellow:'#dec482',green:'#9fc8a2',blue:'#9ebdda',purple:'#baa4da',pink:'#d8a0bb',gray:'#b4b4b4'};
export type NoteColor=keyof typeof noteColors;
export interface StickyNote{id:string;title:string;doc:JSONContent;color:NoteColor;pinned:boolean;created:number;updated:number;revision:number;deletedAt:number|null;source:string}
export const textDocument=(text:string):JSONContent=>({type:'doc',content:text.split('\n').map(line=>({type:'paragraph',...(line?{content:[{type:'text',text:line}]}:{})}))});
export function newNote(text=''):StickyNote{const now=Date.now();return {id:crypto.randomUUID(),title:'',doc:textDocument(text),color:'yellow',pinned:false,created:now,updated:now,revision:0,deletedAt:null,source:''};}
export function documentText(doc:JSONContent):string{if(doc.type==='image')return '';if(doc.type==='text')return doc.text||'';return (doc.content||[]).map(documentText).join(['doc','bulletList','orderedList'].includes(doc.type||'')?'\n':'');}
export const noteName=(note:StickyNote)=>note.title.trim()||documentText(note.doc).trim().split('\n')[0].slice(0,90);
export const safeImage=(src:unknown):src is string=>typeof src==='string'&&src.length<=3_000_000&&/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(src);
export const safeSource=(value:string)=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!!u.hostname&&!u.username&&!u.password;}catch{return false;}};
export function validateNote(value:unknown):StickyNote{
  const n=value as StickyNote;
  if(!n||typeof n.id!=='string'||!/^[a-z0-9-]{1,64}$/i.test(n.id)||typeof n.title!=='string'||n.title.length>160||!Object.prototype.hasOwnProperty.call(noteColors,n.color)||typeof n.pinned!=='boolean'||typeof n.source!=='string'||n.source.length>2048||!Number.isFinite(n.created)||!Number.isFinite(n.updated)||!Number.isInteger(n.revision)||n.revision<0||(n.deletedAt!==null&&!Number.isFinite(n.deletedAt))||n.doc?.type!=='doc')throw new Error('Invalid note');
  let nodes=0,characters=0,images=0;
  const visit=(node:JSONContent,depth:number)=>{
    if(depth>24||++nodes>30000||!['doc','paragraph','text','hardBreak','bulletList','orderedList','listItem','image'].includes(node.type||''))throw new Error('Invalid document');
    if(node.text!==undefined){if(typeof node.text!=='string')throw new Error('Invalid text');characters+=node.text.length;}
    if(node.marks&&(!Array.isArray(node.marks)||node.marks.some(m=>!['bold','italic','underline','strike','code'].includes(m.type))))throw new Error('Invalid formatting');
    if(node.type==='image'&&(!safeImage(node.attrs?.src)||++images>8))throw new Error('Invalid image');
    if(node.content){if(!Array.isArray(node.content))throw new Error('Invalid content');node.content.forEach(child=>visit(child,depth+1));}
  };
  visit(n.doc,0);if(characters>100000||JSON.stringify(n).length>12_000_000)throw new Error('Note is too large');return n;
}
export function filterNotes(notes:StickyNote[],query:string,trash=false,color='all'){
  const q=query.trim().toLocaleLowerCase();
  return notes.filter(n=>Boolean(n.deletedAt)===trash&&(color==='all'||n.color===color)&&(!q||`${n.title}\n${documentText(n.doc)}\n${n.source}`.toLocaleLowerCase().includes(q)))
    .sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updated-a.updated||a.id.localeCompare(b.id));
}
