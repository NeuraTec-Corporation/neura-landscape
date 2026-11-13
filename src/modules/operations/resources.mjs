import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parse, ManageError, text, money, audit, sequence } from "./manage.mjs";
import { requireOption } from "./catalog.mjs";
const quantity = z.coerce.number().finite().min(0).max(1000000).refine(v => Math.abs(v*1000-Math.round(v*1000))<0.00001,"Usa hasta tres decimales.");
const schema = z.object({id:z.string().uuid().optional(),revision:z.number().int().positive().optional(),name:text,category:z.enum(["materials","equipment"]),unit_key:text,unit_cost:z.union([z.literal(""),z.null(),money]),status:z.enum(["active","inactive"])});
export async function resourceCatalog(db) { return (await db.query("SELECT * FROM operating_resources WHERE deleted_at IS NULL ORDER BY category,name")).rows; }
export async function prepareResourceCatalog(db){
 const templates=[
  ["Mantillo / mulch","materials","bag"],["Fertilizante","materials","bag"],["Semilla de césped","materials","bag"],["Sal para deshielo","materials","bag"],
  ["Cortadora de césped","equipment","hour"],["Desbrozadora","equipment","hour"],["Sopladora","equipment","hour"],["Quitanieves","equipment","hour"]
 ];
 return db.transaction(async tx=>{
  let created=0;
  for(const [name,category,unit] of templates){
   if((await tx.query("SELECT id FROM operating_resources WHERE lower(name)=lower($1) AND category=$2 AND deleted_at IS NULL",[name,category])).rows.length)continue;
   await requireOption(tx,"element_unit",unit);
   const id=randomUUID(),result=await tx.query("INSERT INTO operating_resources(id,code,name,category,unit_key,unit_cost_cents,status) VALUES($1,$2,$3,$4,$5,NULL,'active') ON CONFLICT DO NOTHING RETURNING id",[id,await sequence(tx,"resource",category==="materials"?"MAT":"EQP"),name,category,unit]);
   if(result.rows.length){created++;await audit(tx,"resource",id,"created",{source:"operator_selected_starter_catalog",name,category,unit_key:unit,unit_cost_cents:null});}
  }
  return {created};
 });
}
export async function saveResourceRates(db,input){
 const v=parse(z.object({reason:z.string().trim().min(5).max(500),lines:z.array(z.object({id:z.string().uuid(),revision:z.number().int().positive(),unit_cost:z.union([z.literal(""),z.null(),money])})).min(1).max(100)}),input);
 if(new Set(v.lines.map(l=>l.id)).size!==v.lines.length)throw new ManageError("No repitas recursos.");
 return db.transaction(async tx=>{
  for(const l of [...v.lines].sort((a,b)=>a.id.localeCompare(b.id))){
   const old=(await tx.query("SELECT * FROM operating_resources WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[l.id])).rows[0];
   if(!old||old.revision!==l.revision)throw new ManageError("Un recurso cambió o no pertenece a esta empresa. Recarga las tarifas.",409);
   const cents=l.unit_cost===""||l.unit_cost===null?null:Math.round(l.unit_cost*100);
   await tx.query("UPDATE operating_resources SET unit_cost_cents=$2,revision=revision+1 WHERE id=$1",[l.id,cents]);
   await audit(tx,"resource",l.id,"rate_updated",{reason:v.reason,before:old.unit_cost_cents,after:cents});
  }
  return {updated:v.lines.length};
 });
}
export async function saveResource(db,input) {
	const v=parse(schema,input),id=v.id||randomUUID();
	return db.transaction(async tx=>{
		const old=v.id?(await tx.query("SELECT * FROM operating_resources WHERE id=$1 FOR UPDATE",[id])).rows[0]:null;
		if(v.id&&(!old||old.deleted_at||old.revision!==v.revision))throw new ManageError("El recurso cambió. Recarga.",409);
		await requireOption(tx,"element_unit",v.unit_key,old?.unit_key);
		const cents=v.unit_cost===""||v.unit_cost===null?null:Math.round(v.unit_cost*100);
		if(old)await tx.query("UPDATE operating_resources SET name=$2,category=$3,unit_key=$4,unit_cost_cents=$5,status=$6,revision=revision+1 WHERE id=$1",[id,v.name,v.category,v.unit_key,cents,v.status]);
		else await tx.query("INSERT INTO operating_resources(id,code,name,category,unit_key,unit_cost_cents,status) VALUES($1,$2,$3,$4,$5,$6,$7)",[id,await sequence(tx,"resource",v.category==="materials"?"MAT":"EQP"),v.name,v.category,v.unit_key,cents,v.status]);
		await audit(tx,"resource",id,old?"updated":"created",{before:old,after:v});return {id};
	});
}
export async function removeResource(db,input){
	const v=parse(z.object({id:z.string().uuid(),revision:z.number().int().positive(),reason:text}),input);
	return db.transaction(async tx=>{const r=await tx.query("UPDATE operating_resources SET deleted_at=now(),status='inactive',revision=revision+1 WHERE id=$1 AND revision=$2 AND deleted_at IS NULL RETURNING id",[v.id,v.revision]);if(!r.rows.length)throw new ManageError("El recurso cambió. Recarga.",409);await audit(tx,"resource",v.id,"retired",{reason:v.reason});return {id:v.id};});
}
export async function resourceCostState(tx,id){
	const rows=(await tx.query("SELECT * FROM visit_resources WHERE visit_id=$1",[id])).rows;
	const totals={materials:0,equipment:0};
	let complete=true;
	for(const r of rows){if(r.actual_quantity===null||r.actual_unit_cost_cents===null){complete=false;continue;}totals[r.category]+=Math.round(Number(r.actual_quantity)*r.actual_unit_cost_cents);}
	if(Object.values(totals).some(v=>!Number.isSafeInteger(v)||v>100000000))throw new ManageError("El costo de recursos supera el máximo permitido.");
	return {totals,complete};
}
async function recalculate(tx,id){
	const state=await resourceCostState(tx,id);
	const manual=(await tx.query("SELECT category,sum(total_cents)::bigint total FROM visit_cost_lines WHERE visit_id=$1 GROUP BY category",[id])).rows;
	const totals={materials:state.totals.materials,equipment:state.totals.equipment,travel:0,overhead:0};for(const r of manual)totals[r.category]+=Number(r.total);
	if(Object.values(totals).some(v=>!Number.isSafeInteger(v)||v>100000000))throw new ManageError("El costo total supera el máximo permitido.");
	await tx.query("UPDATE visits SET materials_cents=$2,equipment_cents=$3,travel_cents=$4,overhead_cents=$5,cost_complete=(labor_cents IS NOT NULL AND $6) WHERE id=$1",[id,totals.materials,totals.equipment,totals.travel,totals.overhead,state.complete]);
}
export async function saveResourcePlan(db,input){
	const v=parse(z.object({id:text,revision:z.number().int().positive(),lines:z.array(z.object({resource_id:z.string().uuid(),planned_quantity:quantity.refine(v=>v>0)})).max(100)}),input);
	if(new Set(v.lines.map(l=>l.resource_id)).size!==v.lines.length)throw new ManageError("No repitas un recurso en el plan.");
	return db.transaction(async tx=>{
		const visit=(await tx.query("SELECT * FROM visits WHERE id=$1 FOR UPDATE",[v.id])).rows[0];
		if(!visit||visit.deleted_at||visit.revision!==v.revision||visit.status!=="scheduled")throw new ManageError("Solo se prepara una visita programada sin otra edición. Recarga.",409);
		const old=(await tx.query("SELECT * FROM visit_resources WHERE visit_id=$1",[v.id])).rows;
		if(old.some(l=>l.actual_quantity!==null))throw new ManageError("El plan con consumos registrados se conserva.");
		const lines=[];
		for(const l of [...v.lines].sort((a,b)=>a.resource_id.localeCompare(b.resource_id))){
			const resource=(await tx.query("SELECT * FROM operating_resources WHERE id=$1 FOR SHARE",[l.resource_id])).rows[0],previous=old.find(o=>o.resource_id===l.resource_id);
			if(!resource||(!previous&&(resource.deleted_at||resource.status!=="active")))throw new ManageError("Selecciona un recurso activo de esta empresa.");
			if((previous?.unit_key||resource.unit_key)==="each"&&!Number.isInteger(l.planned_quantity))throw new ManageError("Las unidades previstas deben ser enteras.");
			if(resource.unit_cost_cents!==null&&l.planned_quantity*resource.unit_cost_cents>100000000)throw new ManageError("El costo previsto supera el máximo permitido.");
			lines.push({...l,id:previous?.id||randomUUID(),name_snapshot:previous?.name_snapshot||resource.name,category:previous?.category||resource.category,unit_key:previous?.unit_key||resource.unit_key,unit_cost_cents:previous?previous.unit_cost_cents:resource.unit_cost_cents});
		}
		await tx.query("DELETE FROM visit_resources WHERE visit_id=$1",[v.id]);
		for(const l of lines)await tx.query("INSERT INTO visit_resources(id,visit_id,resource_id,name_snapshot,category,unit_key,unit_cost_cents,actual_unit_cost_cents,planned_quantity) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8)",[l.id,v.id,l.resource_id,l.name_snapshot,l.category,l.unit_key,l.unit_cost_cents,l.planned_quantity]);
		await tx.query("UPDATE visits SET revision=revision+1,resources_prepared=true WHERE id=$1",[v.id]);await recalculate(tx,v.id);await audit(tx,"visit_resource_plan",v.id,"prepared",{before:old,after:lines});return {id:v.id};
	});
}
export async function saveResourceUsage(db,input,{allowPrices=false}={}){
	const v=parse(z.object({id:text,revision:z.number().int().positive(),reason:z.string().trim().min(5).max(500),lines:z.array(z.object({id:z.string().uuid(),actual_quantity:quantity,unit_cost:money.optional(),notes:z.string().trim().max(1000).default("")})).max(100)}),input);
	if(!allowPrices&&v.lines.some(l=>l.unit_cost!==undefined))throw new ManageError("Tu perfil no puede cambiar tarifas.",403);
	return db.transaction(async tx=>{
		const visit=(await tx.query("SELECT * FROM visits WHERE id=$1 FOR UPDATE",[v.id])).rows[0];
		if(!visit||visit.deleted_at||visit.revision!==v.revision||!["started","completed","cancelled"].includes(visit.status))throw new ManageError("Registra consumos durante o después de ejecutar la visita. Recarga si cambió.",409);
		const old=(await tx.query("SELECT * FROM visit_resources WHERE visit_id=$1",[v.id])).rows;
		if(v.lines.length!==old.length||new Set(v.lines.map(l=>l.id)).size!==old.length||v.lines.some(l=>!old.some(o=>o.id===l.id)))throw new ManageError("Revisa todos los recursos del plan.");
		if(v.lines.some(l=>old.find(o=>o.id===l.id).unit_key==="each"&&!Number.isInteger(l.actual_quantity)))throw new ManageError("Las unidades utilizadas deben ser enteras.");
		for(const l of v.lines)await tx.query("UPDATE visit_resources SET actual_quantity=$2,notes=$3,actual_unit_cost_cents=CASE WHEN $5::integer IS NULL THEN actual_unit_cost_cents ELSE $5 END WHERE id=$1 AND visit_id=$4",[l.id,l.actual_quantity,l.notes,v.id,l.unit_cost===undefined?null:Math.round(l.unit_cost*100)]);
		await tx.query("UPDATE visits SET revision=revision+1 WHERE id=$1",[v.id]);await recalculate(tx,v.id);await audit(tx,"visit_resource_usage",v.id,"recorded",{reason:v.reason,before:old,after:v.lines});return {id:v.id};
	});
}
export async function resourceReport(db,id,financial=true){
	return db.transaction(async tx=>{
		const visit=(await tx.query("SELECT id,revision,status,resources_prepared,planned_minutes,planned_labor_hourly_cents,labor_cents FROM visits WHERE id=$1 AND deleted_at IS NULL",[id])).rows[0];if(!visit)throw new ManageError("Visita no encontrada.",404);
		const rows=(await tx.query("SELECT * FROM visit_resources WHERE visit_id=$1 ORDER BY category,name_snapshot",[id])).rows;
		const plannedPerson=(await tx.query("SELECT count(*)::int n,sum(actual_minutes)::int actual,count(actual_minutes)::int reported FROM visit_personnel WHERE visit_id=$1",[id])).rows[0];
		const personMinutes=plannedPerson.n&&visit.planned_minutes?plannedPerson.n*visit.planned_minutes:null;
		const actualMinutes=plannedPerson.n&&plannedPerson.reported===plannedPerson.n?plannedPerson.actual:null;
		const tasks=(await tx.query("SELECT service_key,unit,sum(quantity)::float8 planned,sum(completed_quantity)::float8 actual,count(*)::int n,count(completed_quantity)::int reported FROM visit_tasks WHERE visit_id=$1 GROUP BY service_key,unit ORDER BY service_key,unit",[id])).rows;
		const productivity=tasks.map(t=>({...t,actual:t.reported===t.n?t.actual:null,per_person_hour:actualMinutes>0&&t.reported===t.n?Math.round(t.actual/(actualMinutes/60)*1000)/1000:null}));
		const lines=rows.map(r=>({id:r.id,resource_id:r.resource_id,name:r.name_snapshot,category:r.category,unit_key:r.unit_key,planned_quantity:Number(r.planned_quantity),actual_quantity:r.actual_quantity===null?null:Number(r.actual_quantity),notes:r.notes,...(financial?{unit_cost_cents:r.actual_unit_cost_cents,planned_cents:r.unit_cost_cents===null?null:Math.round(Number(r.planned_quantity)*r.unit_cost_cents),actual_cents:r.actual_quantity===null||r.actual_unit_cost_cents===null?null:Math.round(Number(r.actual_quantity)*r.actual_unit_cost_cents)}:{})}));
		const known=lines.every(l=>l.actual_cents!==null&&l.actual_cents!==undefined),planKnown=lines.every(l=>l.planned_cents!==null&&l.planned_cents!==undefined);
		const totals=financial?{planned_cents:visit.resources_prepared&&planKnown?lines.reduce((s,l)=>s+l.planned_cents,0):null,actual_cents:visit.resources_prepared&&known?lines.reduce((s,l)=>s+l.actual_cents,0):null}:{};
		return {visit:{id:visit.id,revision:visit.revision,status:visit.status,resources_prepared:visit.resources_prepared},lines,person_minutes:{planned:personMinutes,actual:actualMinutes},productivity,...(financial?{totals}:{} )};
	});
}
