import {test,expect} from 'bun:test';
import {paletteText,contrastRatio} from '../src/appearance/contrast';
test('opaque palettes always have readable primary, muted, error and focus roles',()=>{
 for(let r=0;r<=255;r+=17)for(let g=0;g<=255;g+=17)for(let b=0;b<=255;b+=17){
  const bg='#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join(''),p=paletteText(bg);
  expect(contrastRatio(p.foreground,bg)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(p.muted,bg)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(p.error,bg)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(p.focus,bg)).toBeGreaterThanOrEqual(3);
  for(const surface of [p.raised,p.input,p.control,p.hover]){
   for(const text of [p.foreground,p.muted,p.error])expect(contrastRatio(text,surface)).toBeGreaterThanOrEqual(4.5);
   expect(contrastRatio(p.focus,surface)).toBeGreaterThanOrEqual(3);
   expect(contrastRatio(p.fieldBorder,surface)).toBeGreaterThanOrEqual(3);
  }
 }
},20000);
test('saturated yellow chooses dark text, equal-lightness blue keeps white',()=>{expect(paletteText('#ffff00').darkText).toBe(true);expect(paletteText('#0000ff').darkText).toBe(false);});
