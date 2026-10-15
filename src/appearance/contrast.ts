/** Contrast is guaranteed for opaque sRGB palettes; a translucent surface's
 * actual backdrop is unknown to the renderer and cannot carry that guarantee. */
type RGB=[number,number,number];
function rgb(hex:string):RGB {const value=hex.replace('#','');const full=value.length===3?value.split('').map(c=>c+c).join(''):value;return [0,2,4].map(i=>parseInt(full.slice(i,i+2),16)||0) as RGB;}
export function luminance(hex:string){const values=rgb(hex).map(c=>{const v=c/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return values[0]*.2126+values[1]*.7152+values[2]*.0722;}
export function contrastRatio(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
function mix(a:string,b:string,amount:number){const x=rgb(a),y=rgb(b);return '#'+x.map((c,i)=>Math.round(c+(y[i]-c)*amount).toString(16).padStart(2,'0')).join('');}
function readableOn(seed:string,backgrounds:string[],foreground:string,min=4.5){for(let step=0;step<=100;step++){const value=mix(seed,foreground,step/100);if(backgrounds.every(bg=>contrastRatio(value,bg)>=min))return value;}return foreground;}
export function readableColor(seed:string,bg:string,foreground:string,min=4.5){return readableOn(seed,[bg],foreground,min);}
export function paletteText(background:string){
 let foreground=contrastRatio('#1c1c1e',background)>=contrastRatio('#ffffff',background)?'#1c1c1e':'#ffffff';
 if(contrastRatio(foreground,background)<4.5)foreground='#000000';
 const darkText=foreground!=='#ffffff';
 const surface=(amount:number)=>{const candidate=mix(background,foreground,amount);return contrastRatio(foreground,candidate)>=4.5?candidate:background;};
 const [raised,input,control,hover]=(darkText?[.015,.025,.04,.08]:[.06,.08,.10,.16]).map(surface),surfaces=[background,raised,input,control,hover];
 return {foreground,darkText,raised,input,control,hover,border:mix(background,foreground,darkText?.12:.20),fieldBorder:readableOn(mix(background,foreground,.2),surfaces,foreground,3),muted:readableOn(mix(background,foreground,.6),surfaces,foreground),focus:readableOn(darkText?'#634ab8':'#b7a6ff',surfaces,foreground,3),error:readableOn(darkText?'#963f2a':'#f0b5a5',surfaces,foreground)};
}
