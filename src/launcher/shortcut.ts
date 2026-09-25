// Win32 modifier values. Use physical letter keys so bindings survive RU/EN changes.
export function validShortcut(mods: number, key: number) {
  if (!Number.isInteger(mods) || mods < 1 || mods > 7 || !(mods & 3)) return false;
  if (!Number.isInteger(key) || !((key >= 65 && key <= 90) || (key >= 48 && key <= 57) ||
    (key >= 112 && key <= 135 && key !== 123) || [8,9,13,32,33,34,35,36,37,38,39,40,45,46].includes(key))) return false;
  return !((key === 9 && !!(mods & 1)) || (key === 115 && !!(mods & 1)) ||
    (key === 46 && (mods & 3) === 3) || (key === 66 && (mods & 3) === 3));
}

export function parseShortcut(value: string): [number, number] | null {
  if (value === 'alt-space') return [1,32];
  if (value === 'ctrl-alt-space') return [3,32];
  const match = /^custom:(\d+):(\d+)$/.exec(value);
  if (!match) return null;
  const mods = Number(match[1]), key = Number(match[2]);
  return validShortcut(mods,key) ? [mods,key] : null;
}

export function shortcutLabel(value: string) {
  const parsed = parseShortcut(value);
  if (!parsed) return '';
  const [mods,key] = parsed;
  const names: Record<number,string> = {8:'Backspace',9:'Tab',13:'Enter',32:'Space',33:'Page Up',34:'Page Down',35:'End',36:'Home',37:'←',38:'↑',39:'→',40:'↓',45:'Insert',46:'Delete'};
  const name = names[key] ?? (key >= 112 ? `F${key-111}` : String.fromCharCode(key));
  return [...(mods & 2 ? ['Ctrl'] : []), ...(mods & 1 ? ['Alt'] : []), ...(mods & 4 ? ['Shift'] : []), name].join(' + ');
}

export function captureShortcut(event: Pick<KeyboardEvent,'code'|'ctrlKey'|'altKey'|'shiftKey'|'metaKey'>): string | null {
  if (event.metaKey) return null;
  const keys: Record<string,number> = {Space:32,Tab:9,Enter:13,Backspace:8,PageUp:33,PageDown:34,End:35,Home:36,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Insert:45,Delete:46};
  let key = keys[event.code];
  if (/^Key[A-Z]$/.test(event.code)) key = event.code.charCodeAt(3);
  if (/^Digit[0-9]$/.test(event.code)) key = event.code.charCodeAt(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(event.code)) key = 111 + Number(event.code.slice(1));
  const mods = (event.altKey?1:0) | (event.ctrlKey?2:0) | (event.shiftKey?4:0);
  if (!validShortcut(mods,key)) return null;
  return mods === 1 && key === 32 ? 'alt-space' : mods === 3 && key === 32 ? 'ctrl-alt-space' : `custom:${mods}:${key}`;
}
