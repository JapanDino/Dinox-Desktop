import {Activity,CalendarDays,Music2,SlidersHorizontal} from 'lucide-react';
import {tx} from '../desktopText';
export type IslandSection='status'|'calendar'|'music'|'command-center';
export function IslandSections({current,calendar,music,onSelect}:{current:IslandSection;calendar:boolean;music:boolean;onSelect:(section:IslandSection)=>void}){
 const sections=[{id:'status',name:tx('Обзор','Overview'),Icon:Activity},{id:'calendar',name:tx('Календарь','Calendar'),Icon:CalendarDays},{id:'music',name:tx('Музыка','Music'),Icon:Music2},{id:'command-center',name:tx('Управление','Controls'),Icon:SlidersHorizontal}].filter(s=>s.id!=='calendar'||calendar).filter(s=>s.id!=='music'||music);
 return <nav className="island-sections" aria-label={tx('Разделы Dinox','Dinox sections')}>{sections.map(({id,name,Icon})=><button key={id} type="button" data-island-section={id} aria-pressed={current===id} onClick={e=>{e.stopPropagation();onSelect(id as IslandSection);}}><Icon size={14}/><span>{name}</span></button>)}</nav>;
}
