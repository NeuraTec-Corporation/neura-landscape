import { visitList,saveVisit } from "./visits.mjs";
import { workforce } from "./workforce.mjs";
import { dailyCapacity,planningDay } from "./daily-capacity.mjs";
import { ManageError } from "./manage.mjs";
export async function reassignPending(db){
	const crews=(await workforce(db)).crews,assigned=[],blocked=[];
	let visits=await visitList(db);
	const pending=visits.filter(v=>v.status==="scheduled"&&v.assignment_review_required).slice(0,50);
	for(const visit of pending){
		if(!visit.tasks.length||!visit.planned_minutes){blocked.push({id:visit.id,name:`${visit.customer_name} · ${visit.property_name}`,reason:"Faltan tareas o duración; completa el plan antes de asignar."});continue;}
		const choices=crews.map(crew=>({crew,load:dailyCapacity(crews,visits.map(v=>({...v,assignment_review_required:false})),planningDay(visit.scheduled_at),{...visit,crew_id:crew.id,assignment_review_required:false,personnel:crew.members.map(m=>({employee_id:m.employee_id}))}).find(r=>r.id===crew.id)}))
			.filter(c=>dailyCapacity([c.crew],[],planningDay(visit.scheduled_at),{...visit,crew_id:c.crew.id,assignment_review_required:false,personnel:c.crew.members.map(m=>({employee_id:m.employee_id}))})[0].warnings.length===0)
			.sort((a,b)=>a.load.reserved-b.load.reserved||a.crew.id.localeCompare(b.crew.id));
		let reason="Ninguna cuadrilla propia cabe en ese horario con su personal y carga actuales.";let saved=false;
		for(const {crew} of choices){
			try{
				await saveVisit(db,{id:visit.id,revision:visit.revision,contract_id:visit.contract_id,crew_id:crew.id,scheduled_at:new Date(visit.scheduled_at).toISOString(),title:visit.title||visit.service,planned_minutes:visit.planned_minutes,travel_minutes:visit.travel_minutes,route_order:crew.id===visit.crew_id?visit.route_order:undefined,tasks:visit.tasks.map(t=>({...t,quantity:Number(t.quantity),employee_id:crew.members.some(m=>m.employee_id===t.employee_id)?t.employee_id:null}))});
				assigned.push({id:visit.id,crew:crew.name});saved=true;visits=await visitList(db);break;
			}catch(e){if(!(e instanceof ManageError))throw e;reason=e.message;}
		}
		if(!saved)blocked.push({id:visit.id,name:`${visit.customer_name} · ${visit.property_name}`,reason});
	}
	return {assigned,blocked,remaining:visits.filter(v=>v.status==="scheduled"&&v.assignment_review_required).length};
}
