import {test,expect} from 'bun:test';
import cases from './shortcut-cases.json';
import {captureShortcut,parseShortcut,shortcutLabel} from '../src/launcher/shortcut';
test('shortcut parser matches native validation fixtures',()=>{
  for(const c of cases) expect(parseShortcut(c.value)).toEqual(c.valid&&c.value!=='off'?[c.mods,c.key]:null);
});
test('recorder uses physical keys and rejects plain typing, Windows keys and recovery shortcut',()=>{
  const key={code:'KeyK',ctrlKey:true,shiftKey:true,altKey:false,metaKey:false};
  expect(captureShortcut(key)).toBe('custom:6:75');
  expect(shortcutLabel('custom:6:75')).toBe('Ctrl + Shift + K');
  expect(captureShortcut({...key,ctrlKey:false})).toBeNull();
  expect(captureShortcut({...key,metaKey:true})).toBeNull();
  expect(captureShortcut({...key,code:'KeyB',altKey:true})).toBeNull();
  expect(captureShortcut({...key,code:'Unidentified'})).toBeNull();
  expect(captureShortcut({...key,code:'F12'})).toBeNull();
  expect(captureShortcut({...key,code:'Space',ctrlKey:false,shiftKey:false,altKey:true})).toBe('alt-space');
  expect(shortcutLabel('custom:3:135')).toBe('Ctrl + Alt + F24');
});
