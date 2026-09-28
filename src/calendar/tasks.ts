import ICAL from 'ical.js';
import {parseCalendar,remoteEntries,registerIana,type CalendarSource,type CalendarEvent} from './model';

// VTODO deadlines are inclusive. Keep undated tasks outside the time grid.
export function parseTasks(source:CalendarSource,from:number,to:number):CalendarEvent[]{
 if(source.items)return remoteEntries(source).filter(e=>e.kind==='task');
 const root=new ICAL.Component(ICAL.parse(source.ics.replace(/^\uFEFF/,'')));
 const out:CalendarEvent[]=[],mapped=new ICAL.Component('vcalendar');
 mapped.addPropertyWithValue('version','2.0');
 ICAL.TimezoneService.reset();
 for(const zone of root.getAllSubcomponents('vtimezone')){
  ICAL.TimezoneService.register(new ICAL.Timezone(zone));
  mapped.addSubcomponent(new ICAL.Component(JSON.parse(JSON.stringify(zone.toJSON()))));
 }
 const parts=root.getAllSubcomponents('vtodo');
 for(const part of parts)for(const prop of part.getAllProperties()){
  const id=prop.getParameter('tzid');if(typeof id==='string')registerIana(id);
 }
 const time=(part:ICAL.Component,key:string)=>part.getFirstPropertyValue(key) as ICAL.Time|null;
 for(const part of parts){
  const uid=String(part.getFirstPropertyValue('uid')||''),rid=time(part,'recurrence-id');
  if(!uid)continue;
  const status=String(part.getFirstPropertyValue('status')).toUpperCase();
  if(status==='CANCELLED'&&!rid)continue;
  const due=time(part,'due'),start=time(part,'dtstart'),anchor=due||start;
  const completed=status==='COMPLETED'||!!part.getFirstPropertyValue('completed')||Number(part.getFirstPropertyValue('percent-complete'))===100;
  if(!anchor&&!rid){out.push({id:`${source.id}:task:${uid}`,uid,sourceId:source.id,title:String(part.getFirstPropertyValue('summary')||''),start:0,end:0,allDay:true,kind:'task',unscheduled:true,completed,description:String(part.getFirstPropertyValue('description')||''),location:'',url:'',meeting:'',color:source.color,sourceName:source.name});continue;}
  const json=JSON.parse(JSON.stringify(part.toJSON()));json[0]='vevent';const event=new ICAL.Component(json);
  event.removeAllProperties('due');event.removeAllProperties('duration');event.removeAllProperties('dtend');event.removeAllProperties('dtstart');
  if(anchor){
   // Preserve recurrence rules in DTSTART's coordinate system. DUE becomes
   // DTEND only for expansion; parseCalendar renders the resulting deadline.
   const prop=JSON.parse(JSON.stringify(part.getFirstProperty(start?'dtstart':'due')!.toJSON()));prop[0]='dtstart';event.addProperty(new ICAL.Property(prop));
   if(due){const endProp=JSON.parse(JSON.stringify(part.getFirstProperty('due')!.toJSON()));endProp[0]='dtend';event.addProperty(new ICAL.Property(endProp));event.updatePropertyWithValue('x-dinox-task-deadline','true');}
   else{const endProp=JSON.parse(JSON.stringify(prop));endProp[0]='dtend';const end=anchor.clone();end.adjust(anchor.isDate?1:0,0,anchor.isDate?0:1,0);const endProperty=new ICAL.Property(endProp);endProperty.setValue(end);event.addProperty(endProperty);}
  }
  if(completed)event.updatePropertyWithValue('status','COMPLETED');
  mapped.addSubcomponent(event);
 }
 const scheduled=parseCalendar({...source,id:`${source.id}:tasks`,kind:'task',ics:mapped.toString()},from,to).map(e=>({...e,sourceId:source.id}));
 return [...out,...scheduled];
}
