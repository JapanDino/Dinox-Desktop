// Bounded arithmetic parser. It never evaluates JavaScript or calls a shell.
export function calculate(source:string):{value?:string;error?:'syntax'|'zero'|'range'}{
 const text=source.replace(/,/g,'.').replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-').trim();
 if(!text)return {};
 if(text.length>256)return {error:'range'};
 const tokens=text.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[()+\-*/%^]|\S/gi)??[];
 if(tokens.length>128)return {error:'range'};
 let i=0,depth=0;
 const fail=(code:'syntax'|'zero'|'range'):never=>{throw code;};
 const primary=():number=>{if(++depth>32)fail('range');let n:number;
  if(tokens[i]==='('){i++;n=sum();if(tokens[i++]!==')')fail('syntax');}
  else{const token=tokens[i++];if(!token||! /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(token))fail('syntax');n=Number(token);}
  depth--;return n;
 };
 const power=():number=>{const a=primary();if(tokens[i]==='^'){i++;return a**unary();}return a;};
 const unary=():number=>{if(tokens[i]==='+'||tokens[i]==='-'){const negative=tokens[i++]==='-';return (negative?-1:1)*unary();}return power();};
 const product=():number=>{let a=unary();while(['*','/','%'].includes(tokens[i])){const op=tokens[i++],b=unary();if((op==='/'||op==='%')&&b===0)fail('zero');a=op==='*'?a*b:op==='/'?a/b:a%b;}return a;};
 const sum=():number=>{let a=product();while(tokens[i]==='+'||tokens[i]==='-'){const op=tokens[i++],b=product();a=op==='+'?a+b:a-b;}return a;};
 try{const n=sum();if(i!==tokens.length)fail('syntax');if(!Number.isFinite(n))fail('range');return {value:String(Number(n.toPrecision(14)))};}catch(error){return {error:['syntax','zero','range'].includes(String(error))?error as 'syntax'|'zero'|'range':'syntax'};}
}
