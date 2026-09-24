import {readFileSync,writeFileSync,mkdirSync,readdirSync,copyFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
export function manifest(version, signature, date = new Date().toISOString()) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Stable numeric version required');
  if (!signature.trim()) throw new Error('Updater signature missing');
  return {version,notes:`Dinox Desktop ${version}. Release notes: https://github.com/JapanDino/Dinox-Desktop/releases/tag/v${version}`,pub_date:date,
    platforms:{'windows-x86_64':{signature:signature.trim(),url:`https://github.com/JapanDino/Dinox-Desktop/releases/download/v${version}/Dinox-Desktop_${version}_x64-setup.exe`}}};
}
if (import.meta.main) {
  const version=JSON.parse(readFileSync('package.json','utf8')).version;
  const input=resolve(process.argv[2]||'src-tauri/target/release/bundle/nsis');
  const output=resolve(process.argv[3]||'artifacts');
  const files=readdirSync(input).filter(n=>n.endsWith('-setup.exe')&&n.includes(version));
  if(files.length!==1) throw new Error('Expected exactly one installer for this version');
  const file=files[0], signature=readFileSync(join(input,file+'.sig'),'utf8');
  const name=`Dinox-Desktop_${version}_x64-setup.exe`;
  mkdirSync(output,{recursive:true});copyFileSync(join(input,file),join(output,name));
  writeFileSync(join(output,name+'.sig'),signature);
  writeFileSync(join(output,'latest.json'),JSON.stringify(manifest(version,signature),null,2)+'\n');
  const hashes=[name,name+'.sig','latest.json'].map(n=>createHash('sha256').update(readFileSync(join(output,n))).digest('hex')+'  '+n);
  writeFileSync(join(output,'SHA256SUMS.txt'),hashes.join('\n')+'\n');
  console.log(`Prepared ${version}: installer, signature, latest.json, SHA256SUMS.txt`);
}
