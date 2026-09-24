// One-time source migration. Runtime performs no DOM rewriting or network translation.
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import {pairs} from '../src/i18n/catalog';
const known=new Set(pairs.flat());const root=path.resolve('src');
const printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
const call=(key:string,args:ts.Expression[]=[])=>ts.factory.createCallExpression(ts.factory.createIdentifier('tr'),undefined,[ts.factory.createStringLiteral(key),...args]);
let counts:Record<string,number>={};
function walk(dir:string){for(const f of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,f.name);if(f.isDirectory()){if(!['i18n','icons'].includes(f.name))walk(file);continue}if(!/\.tsx?$/.test(file))continue;
  let source=fs.readFileSync(file,'utf8');
  // Repair a legacy mojibake error message before translating it.
  if(file.endsWith('useNotifications.ts'))source=source.replace(/РќРµ[^'"\n]*РЅР°СЃС‚СЂРѕР№РєР°С…\./g,'Не удалось прочитать уведомления. Проверь доступ в настройках.');
  const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);let count=0;
  const result=ts.transform(tree,[context=>{
    const visit:ts.Visitor=node=>{
      if(ts.isImportDeclaration(node)||ts.isLiteralTypeNode(node)||ts.isTypeAliasDeclaration(node)||ts.isInterfaceDeclaration(node))return node;
      if(ts.isJsxText(node)){const key=node.text.replace(/\s+/g,' ').trim();if(known.has(key)){count++;return ts.factory.createJsxExpression(undefined,call(key));}return node}
      if(ts.isJsxAttribute(node)&&node.initializer&&ts.isStringLiteral(node.initializer)&&known.has(node.initializer.text)){
        if(['className','id','value','type','key','name','href','src'].includes(node.name.getText(tree)))return node;
        count++;return ts.factory.updateJsxAttribute(node,node.name,ts.factory.createJsxExpression(undefined,call(node.initializer.text)));
      }
      if(ts.isTemplateExpression(node)){
        const key=node.head.text+node.templateSpans.map((span,i)=>`{${i}}`+span.literal.text).join('');
        if(known.has(key)){count++;return call(key,node.templateSpans.map(span=>ts.visitNode(span.expression,visit) as ts.Expression));}
      }
      if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)){
        if(!known.has(node.text))return node;
        const parent=node.parent;
        if((ts.isPropertyAssignment(parent)&&parent.name===node)||ts.isJsxAttribute(parent)||ts.isCaseClause(parent)||ts.isBinaryExpression(parent)&&[ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken,ts.SyntaxKind.EqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsToken].includes(parent.operatorToken.kind))return node;
        if(ts.isCallExpression(parent)&&parent.expression.getText(tree).startsWith('console.'))return node;
        count++;return call(node.text);
      }
      // Getters keep module-level UI metadata responsive to language changes.
      if(ts.isPropertyAssignment(node)&&['label','name','title','desc','description'].includes(node.name.getText(tree))&&ts.isStringLiteral(node.initializer)&&known.has(node.initializer.text)){
        count++;return ts.factory.createGetAccessorDeclaration(undefined,node.name,[],undefined,ts.factory.createBlock([ts.factory.createReturnStatement(call(node.initializer.text))],true));
      }
      return ts.visitEachChild(node,visit,context);
    };return node=>ts.visitNode(node,visit) as ts.SourceFile;
  }]);
  if(count){let relative=path.relative(path.dirname(file),path.join(root,'i18n/core')).replace(/\\/g,'/');if(!relative.startsWith('.'))relative='./'+relative;fs.writeFileSync(file,`import {tr} from '${relative}';\n`+printer.printFile(result.transformed[0] as ts.SourceFile));counts[path.relative(root,file)]=count;}
  result.dispose();
}}
walk(root);fs.writeFileSync('../logs/i18n-migration.json',JSON.stringify(counts,null,2));console.log(counts);
