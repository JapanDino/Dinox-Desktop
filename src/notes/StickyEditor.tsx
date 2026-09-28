import {useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {Extension} from '@tiptap/core';
import {Plugin} from '@tiptap/pm/state';
import {EditorContent,useEditor} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import {Bold,Italic,Underline,Strikethrough,List,ImagePlus,Undo2,Redo2,Pin,ExternalLink,Copy,Trash2,Link2} from 'lucide-react';
import {invoke} from '@tauri-apps/api/core';
import {tx} from '../desktopText';
import {noteColors,safeImage,safeSource,validateNote,type StickyNote,type NoteColor} from './model';
import {saveNote,duplicateNote,useNotes} from './store';

const LocalImage=Image.extend({parseHTML(){return [{tag:'img[src]',getAttrs:element=>safeImage((element as HTMLElement).getAttribute('src'))?null:false}];}}).configure({allowBase64:true});
const extensions=[StarterKit.configure({link:false,heading:false,blockquote:false,codeBlock:false,horizontalRule:false}),LocalImage];
async function imageData(file:File){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10_000_000)throw new Error();
  const bitmap=await createImageBitmap(file);
  try{const ratio=Math.min(1,1400/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));const ctx=canvas.getContext('2d');if(!ctx)throw new Error();ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);const src=canvas.toDataURL('image/jpeg',.86);if(!safeImage(src))throw new Error();return src;}finally{bitmap.close();}
}
export function StickyEditor({note,onOpenCopy,onPopout,onDelete}:{note:StickyNote;onOpenCopy:(id:string)=>void;onPopout?:()=>void;onDelete:()=>void}){
  const current=useRef(note),lastDoc=useRef(note.doc),fileInput=useRef<HTMLInputElement>(null);
  current.current=note;
  const [error,setError]=useState(''),[imageBusy,setImageBusy]=useState(false),[sourceEdit,setSourceEdit]=useState(false),[source,setSource]=useState(note.source);
  const {unsaved,saving,error:storeError}=useNotes();
  const patch=(change:Partial<StickyNote>)=>{const next={...current.current,...change};try{validateNote(next);current.current=next;saveNote(next);setError('');}catch{setError(tx('Заметка слишком большая: до 100 000 знаков и 8 изображений.','Note too large: up to 100,000 characters and 8 images.'));}};
  const insertFile=useRef<(file:File)=>Promise<void>>(async()=>{});
  const guardedExtensions=useMemo(()=>[...extensions,Extension.create({name:'noteLimits',addProseMirrorPlugins(){return [new Plugin({filterTransaction:transaction=>{if(!transaction.docChanged)return true;try{validateNote({...current.current,doc:transaction.doc.toJSON()});return true;}catch{queueMicrotask(()=>setError(tx('Изменение слишком большое. Разделите текст на несколько заметок.','This edit is too large. Split the text into several notes.')));return false;}}})];}})],[]);
  const editor=useEditor({extensions:guardedExtensions,content:note.doc,editable:!note.deletedAt,shouldRerenderOnTransaction:true,
    editorProps:{attributes:{role:'textbox','aria-label':tx('Текст заметки','Note text'),'aria-multiline':'true','aria-readonly':String(!!note.deletedAt),spellcheck:'true'},
      handlePaste:(_view,event)=>{const image=Array.from(event.clipboardData?.files||[]).find(f=>f.type.startsWith('image/'));if(image){event.preventDefault();void insertFile.current(image);return true;}return false;},
      handleDrop:(_view,event)=>{const image=Array.from(event.dataTransfer?.files||[]).find(f=>f.type.startsWith('image/'));if(image){event.preventDefault();void insertFile.current(image);return true;}return false;},
      transformPastedHTML:html=>{const doc=new DOMParser().parseFromString(html,'text/html');doc.querySelectorAll('img').forEach(img=>{if(!safeImage(img.getAttribute('src')))img.remove();});return doc.body.innerHTML;}
    },
    onUpdate:({editor})=>{const doc=editor.getJSON();lastDoc.current=doc;patch({doc});}
  },[note.id]);
  useEffect(()=>{if(!editor)return;if(editor.isEditable===Boolean(note.deletedAt))editor.setEditable(!note.deletedAt,false);if(note.doc!==lastDoc.current){lastDoc.current=note.doc;if(JSON.stringify(editor.getJSON())!==JSON.stringify(note.doc))editor.commands.setContent(note.doc,{emitUpdate:false});}},[editor,note.doc,note.deletedAt]);
  useEffect(()=>{setSource(note.source);},[note.source]);
  useEffect(()=>{const input=fileInput.current;const clear=()=>{delete document.documentElement.dataset.notesFilePicker;};input?.addEventListener('cancel',clear);return()=>{input?.removeEventListener('cancel',clear);clear();};},[]);
  insertFile.current=async file=>{if(!editor||note.deletedAt||imageBusy)return;setImageBusy(true);setError('');try{const src=await imageData(file);if(editor.isDestroyed)return;let count=0;editor.state.doc.descendants(n=>{if(n.type.name==='image')count++;});if(count>=8)throw new Error();editor.chain().focus().setImage({src}).run();}catch{setError(tx('Не удалось добавить изображение. Используйте PNG, JPEG или WebP до 10 МБ; максимум 8 на заметку.','Could not add image. Use PNG, JPEG or WebP up to 10 MB; maximum 8 per note.'));}finally{setImageBusy(false);}};
  const tools=editor?[
    {label:tx('Жирный','Bold'),Icon:Bold,active:editor.isActive('bold'),run:()=>editor.chain().focus().toggleBold().run()},
    {label:tx('Курсив','Italic'),Icon:Italic,active:editor.isActive('italic'),run:()=>editor.chain().focus().toggleItalic().run()},
    {label:tx('Подчёркнутый','Underline'),Icon:Underline,active:editor.isActive('underline'),run:()=>editor.chain().focus().toggleUnderline().run()},
    {label:tx('Зачёркнутый','Strikethrough'),Icon:Strikethrough,active:editor.isActive('strike'),run:()=>editor.chain().focus().toggleStrike().run()},
    {label:tx('Список','Bullet list'),Icon:List,active:editor.isActive('bulletList'),run:()=>editor.chain().focus().toggleBulletList().run()}
  ]:[];
  return <section className="dn-editor" style={{'--note-color':noteColors[note.color]} as CSSProperties}>
    <div className="dn-editor-top"><div className="dn-swatches" role="group" aria-label={tx('Цвет заметки','Note color')}>{(Object.entries(noteColors) as [NoteColor,string][]).map(([color,hex],index)=><button key={color} style={{background:hex}} aria-label={[tx('Жёлтый','Yellow'),tx('Зелёный','Green'),tx('Синий','Blue'),tx('Фиолетовый','Purple'),tx('Розовый','Pink'),tx('Серый','Gray')][index]} aria-pressed={note.color===color} disabled={!!note.deletedAt} onClick={()=>patch({color})}/>)}</div><div className="dn-actions">
      <button aria-label={tx('Закрепить заметку','Pin note')} aria-pressed={note.pinned} disabled={!!note.deletedAt} onClick={()=>patch({pinned:!note.pinned})}><Pin size={17}/></button>
      {onPopout&&<button aria-label={tx('Открыть отдельным окном','Open separate window')} onClick={onPopout}><ExternalLink size={17}/></button>}
      <button aria-label={tx('Создать копию','Duplicate note')} onClick={()=>onOpenCopy(duplicateNote(current.current).id)}><Copy size={17}/></button><button aria-label={tx('Удалить заметку','Delete note')} disabled={!!note.deletedAt} onClick={onDelete}><Trash2 size={17}/></button>
    </div></div>
    <input className="dn-title" aria-label={tx('Название заметки','Note title')} placeholder={tx('Без названия','Untitled')} maxLength={160} value={note.title} readOnly={!!note.deletedAt} onChange={e=>patch({title:e.target.value})}/>
    <div className="dn-paper"><EditorContent editor={editor}/></div>
    {sourceEdit&&<form className="dn-source-form" onSubmit={e=>{e.preventDefault();if(source.trim()&&!safeSource(source.trim())){setError(tx('Нужна ссылка HTTP или HTTPS без пароля.','Use an HTTP or HTTPS link without credentials.'));return;}patch({source:source.trim()});setSourceEdit(false);}}><input aria-label={tx('Ссылка на источник','Source URL')} placeholder="https://…" maxLength={2048} value={source} onChange={e=>setSource(e.target.value)}/><button>{tx('Сохранить ссылку','Save link')}</button></form>}
    {!sourceEdit&&note.source&&<button className="dn-source" onClick={()=>{if(safeSource(note.source))void invoke('widgets_open_target',{target:note.source}).catch(()=>setError(tx('Не удалось открыть ссылку.','Could not open link.')));}}><Link2 size={14}/><span>{note.source}</span></button>}
    {!note.deletedAt&&<div className="dn-format" role="toolbar" aria-label={tx('Форматирование','Formatting')}>
      {tools.map(tool=><button key={tool.label} aria-label={tool.label} title={tool.label} aria-pressed={tool.active} onMouseDown={e=>e.preventDefault()} onClick={tool.run}><tool.Icon size={18}/></button>)}
      <button aria-label={tx('Добавить изображение','Add image')} disabled={imageBusy} onClick={()=>{document.documentElement.dataset.notesFilePicker='true';fileInput.current?.click();}}><ImagePlus size={18}/></button>
      <button aria-label={tx('Источник заметки','Note source')} aria-pressed={sourceEdit} onClick={()=>setSourceEdit(v=>!v)}><Link2 size={18}/></button>
      <button aria-label={tx('Отменить изменение','Undo edit')} disabled={!editor?.can().undo()} onClick={()=>editor?.chain().focus().undo().run()}><Undo2 size={18}/></button><button aria-label={tx('Повторить изменение','Redo edit')} disabled={!editor?.can().redo()} onClick={()=>editor?.chain().focus().redo().run()}><Redo2 size={18}/></button>
      {editor?.isActive('image')&&<button aria-label={tx('Удалить изображение','Delete image')} onClick={()=>editor.chain().focus().deleteSelection().run()}><Trash2 size={18}/></button>}
      <input ref={fileInput} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={e=>{delete document.documentElement.dataset.notesFilePicker;const file=e.target.files?.[0];if(file)void insertFile.current(file);e.target.value='';}}/>
    </div>}
    <div className="dn-editor-status" role={error?'alert':'status'}>{error|| (imageBusy?tx('Добавление изображения…','Adding image…'):storeError?tx('Есть несохранённые изменения — проверьте сообщение библиотеки.','Check the library message for unsaved changes.'):unsaved||saving?tx('Сохранение…','Saving…'):tx('Сохранено на этом устройстве','Saved on this device'))}</div>
  </section>;
}
