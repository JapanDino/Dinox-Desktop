// Same rounded battery geometry as Bloom's upper panel; currentColor supports light themes.
export function BatteryGlyph({level,charging}:{level:number;charging:boolean}) {
 const value=Math.max(0,Math.min(100,level));
 return <span className="system-battery-glyph" aria-hidden="true"><svg width="22" height="11" viewBox="0 0 20 10" fill="none">
   <rect x="2" y=".75" width="14" height="8.5" rx="2.4" stroke="currentColor" strokeOpacity=".45" strokeWidth="1.1"/>
   <path d="M17.5 3.5V6.5" stroke="currentColor" strokeOpacity=".45" strokeWidth="1.2" strokeLinecap="round"/>
   <rect x="3.8" y="2.5" width={Math.max(.5,value*.104)} height="5" rx="1" fill={charging?'#66c991':value<=20?'#eb776f':'currentColor'}/>
 </svg>{charging&&<svg className="system-charge-bolt" width="7" height="10" viewBox="0 0 8 12" fill="currentColor"><path d="M4.5 0L0 7H3.5L2.5 12L8 5H4.5L5.5 0H4.5Z"/></svg>}</span>;
}
