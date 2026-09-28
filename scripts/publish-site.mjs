// Publish only reviewed public assets; application files never enter the Pages tree.
import {spawnSync} from 'node:child_process';
import {readFileSync, lstatSync} from 'node:fs';
const run=(args,input)=>{const r=spawnSync('git',args,{input,encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr||'Git failed');return r.stdout.trim();};
const files=['.nojekyll','assets/calendar.png','assets/cover.png','assets/dinox.svg','assets/dock.png','assets/search.png','assets/widgets.png','index.html','privacy.html','site.js','style.css'];
const nodes={};
for(const path of files){
  if(!lstatSync(`site/${path}`).isFile() || lstatSync(`site/${path}`).isSymbolicLink())throw new Error(`Not a regular public file: ${path}`);
  const parts=path.split('/');let node=nodes;
  for(const part of parts.slice(0,-1))node=node[part]??={};
  node[parts.at(-1)]=run(['hash-object','-w','--stdin'],readFileSync(`site/${path}`));
}
function treeOf(node){return run(['mktree'],Object.entries(node).map(([name,value])=>typeof value==='string'?`100644 blob ${value}\t${name}`:`040000 tree ${treeOf(value)}\t${name}`).sort().join('\n')+'\n');}
const tree=treeOf(nodes);
const actual=run(['ls-tree','-r','--name-only',tree]).split('\n');
if(JSON.stringify(actual)!==JSON.stringify([...files].sort()))throw new Error('Unexpected website tree');
if(process.argv.includes('--check')){console.log(`Public tree verified: ${files.length} files, ${tree}`);process.exit(0);}
run(['fetch','origin','gh-pages']);
const parent=run(['rev-parse','FETCH_HEAD']);
const commit=run(['-c','user.name=JapanDino','-c','user.email=klim.i.rumyantsev@gmail.com','commit-tree',tree,'-p',parent,'-m','docs: publish Dinox 4.2.0 product website']);
run(['push','origin',`${commit}:refs/heads/gh-pages`]);
console.log(`Published public site commit ${commit}; verify GitHub Pages deployment separately.`);
