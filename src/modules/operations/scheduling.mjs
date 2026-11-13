import { z } from "zod";
import { parse, date, ManageError } from "./manage.mjs";
import { planningDay } from "./daily-capacity.mjs";
import { workforce } from "./workforce.mjs";
import { visitList, saveVisit } from "./visits.mjs";

import { accessWindow, fitsAccess, planningInstant } from "./access-window.mjs";
const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
const span=v=>[Date.parse(v.scheduled_at)-Number(v.travel_minutes||0)*60000,Date.parse(v.scheduled_at)+Number(v.planned_minutes||0)*60000];
export async function suggestSlots(db,input,now=new Date()){
 const f=parse(z.object({id:z.string().min(1),from:date,to:date}),input);
 const [visits,w]=await Promise.all([visitList(db),workforce(db)]);
 return slots(visits,w,f,now);
}
function slots(visits,w,f,now){
 if(f.from<planningDay(now)||f.to<f.from||Date.parse(f.to)-Date.parse(f.from)>27*86400000)throw new ManageError("Busca desde hoy en un intervalo de hasta 28 días.");
 const visit=visits.find(v=>v.id===f.id);
 if(visit?.status!=="scheduled")throw new ManageError("Selecciona una visita programada de esta empresa.",404);
 const window=accessWindow(visit.service_hours);
 if(!window)return {id:visit.id,revision:visit.revision,options:[],reason:"Registra el horario de acceso de la localidad como HH:mm–HH:mm (por ejemplo 09:00–17:00). Las restricciones por día deben verificarse con el cliente."};
 if(!visit.planned_minutes||!visit.tasks.length)return {id:visit.id,revision:visit.revision,options:[],reason:"Completa las tareas y la duración antes de buscar horarios."};
 const options=[],duration=Number(visit.planned_minutes),travel=Number(visit.travel_minutes||0);
 const reserved=visits.filter(v=>v.id!==visit.id&&["scheduled","started","completed"].includes(v.status));
 for(let day=f.from;day<=f.to;day=new Date(Date.parse(`${day}T12:00:00Z`)+86400000).toISOString().slice(0,10)){
  if((visit.effective_from&&day<visit.effective_from)||(visit.effective_until&&day>visit.effective_until)||visit.contract_status!=="active"||visit.property_status!=="active")continue;
  for(const crew of w.crews){
   if(!crew.members.length||crew.members.some(p=>p.status!=="active"))continue;
   const ids=new Set(crew.members.map(p=>p.employee_id)),capacity=minutes(crew.shift_end)-minutes(crew.shift_start)-Number(crew.break_minutes);
   const load=reserved.filter(v=>v.crew_id===crew.id&&planningDay(v.scheduled_at)===day).reduce((sum,v)=>sum+Number(v.planned_minutes||0)+Number(v.travel_minutes||0),0);
   if(load+duration+travel>capacity)continue;
   const start=Math.max(minutes(crew.shift_start)+travel,window.start),end=Math.min(minutes(crew.shift_end),window.end)-duration;
   for(let m=Math.ceil(start/15)*15;m<=end;m+=15){
    const timestamp=planningInstant(day,m);if(!timestamp||Date.parse(timestamp)<now.getTime())continue;
    const a=Date.parse(timestamp)-travel*60000,b=Date.parse(timestamp)+duration*60000;
    const collision=reserved.some(v=>v.status!=="completed"&&(v.crew_id===crew.id||v.personnel.some(p=>ids.has(p.employee_id)))&&span(v)[0]<b&&span(v)[1]>a);
    if(collision)continue;
    options.push({crew_id:crew.id,crew_name:crew.name,scheduled_at:timestamp,remaining_minutes:capacity-load-duration-travel,people:crew.members.length});break;
   }
  }
  if(options.length>=8)break;
 }
 options.sort((a,b)=>a.scheduled_at.localeCompare(b.scheduled_at)||b.remaining_minutes-a.remaining_minutes||a.crew_id.localeCompare(b.crew_id));
 return {id:visit.id,revision:visit.revision,options:options.slice(0,8),reason:options.length?"":"No hay espacio compatible en ese intervalo. Revisa duración, turnos, cruces y vigencia del contrato."};
}
export async function suggestPendingSlots(db,input,now=new Date()){
 const f=parse(z.object({from:date,to:date}),input),[visits,w]=await Promise.all([visitList(db),workforce(db)]);
 const pending=visits.filter(v=>v.status==="scheduled"&&v.assignment_review_required).slice(0,50),proposals=[],blocked=[];
 for(const visit of pending){
  const result=slots(visits,w,{...f,id:visit.id},now),choice=result.options[0];
  if(!choice){blocked.push({id:visit.id,name:`${visit.customer_name} · ${visit.property_name}`,reason:result.reason});continue;}
  proposals.push({...choice,id:visit.id,revision:visit.revision,name:`${visit.customer_name} · ${visit.property_name}`,previous_at:new Date(visit.scheduled_at).toISOString()});
  // Reserve each proposed slot in this read-only simulation so batch choices cannot overlap.
  visit.crew_id=choice.crew_id;visit.scheduled_at=choice.scheduled_at;visit.personnel=w.crews.find(c=>c.id===choice.crew_id).members.map(p=>({employee_id:p.employee_id}));
 }
 return {proposals,blocked};
}
export async function applyPendingSlots(db,input){
 const v=parse(z.object({reason:z.string().trim().min(5).max(500),proposals:z.array(z.object({id:z.string().min(1),revision:z.number().int().positive(),crew_id:z.string().min(1),scheduled_at:z.string().datetime({offset:true})})).min(1).max(50)}),input);
 if(new Set(v.proposals.map(p=>p.id)).size!==v.proposals.length)throw new ManageError("No repitas visitas.");
 const assigned=[],blocked=[];
 for(const p of v.proposals){try{await applySlot(db,{...p,reason:v.reason});assigned.push({id:p.id});}catch(e){if(!(e instanceof ManageError))throw e;blocked.push({id:p.id,reason:e.message});}}
 return {assigned,blocked,remaining:(await visitList(db)).filter(r=>r.status==="scheduled"&&r.assignment_review_required).length};
}
export async function applySlot(db,input){
 const v=parse(z.object({id:z.string().min(1),revision:z.number().int().positive(),crew_id:z.string().min(1),scheduled_at:z.string().datetime({offset:true}),reason:z.string().trim().min(5).max(500)}),input);
 if(Date.parse(v.scheduled_at)<Date.now())throw new ManageError("No se reprograma en el pasado.");
 const [visits,w]=await Promise.all([visitList(db),workforce(db)]),old=visits.find(r=>r.id===v.id),crew=w.crews.find(r=>r.id===v.crew_id);
 if(!old||!crew)throw new ManageError("Selecciona una visita y cuadrilla propias.",404);
 if(!fitsAccess(v.scheduled_at,Number(old.planned_minutes),old.service_hours))throw new ManageError("El horario no cabe en el acceso registrado de la localidad.");
 return saveVisit(db,{id:old.id,revision:v.revision,contract_id:old.contract_id,crew_id:crew.id,scheduled_at:v.scheduled_at,title:old.title||old.service,planned_minutes:old.planned_minutes,travel_minutes:old.travel_minutes,reschedule_reason:v.reason,tasks:old.tasks.map(t=>({...t,quantity:Number(t.quantity),employee_id:crew.members.some(p=>p.employee_id===t.employee_id)?t.employee_id:null}))});
}
