import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {parse,text,date,money,ManageError,audit} from './manage.mjs';
import {lockOperationalPlan} from './planning-lock.mjs';
import {planningDay} from './daily-capacity.mjs';
export async function assetPlan(tx,visitId){return (await tx.query("SELECT a.*,a.maintenance_due::text maintenance_due,(r.asset_id IS NOT NULL) reserved FROM equipment_assets a LEFT JOIN visit_asset_reservations r ON r.asset_id=a.id AND r.visit_id=$1 ORDER BY a.code",[visitId])).rows;}
export async function validateAssetReservations(tx,visit,assetIds,{requireComplete=false}={}){
 const ids=assetIds??(await tx.query("SELECT asset_id FROM visit_asset_reservations WHERE visit_id=$1",[visit.id])).rows.map(r=>r.asset_id);
 const lines=(await tx.query("SELECT resource_id FROM visit_resources WHERE visit_id=$1 AND category='equipment'",[visit.id])).rows;
 const selected=[];
 for(const id of [...ids].sort()){
  const asset=(await tx.query("SELECT *,maintenance_due::text maintenance_due FROM equipment_assets WHERE id=$1 FOR UPDATE",[id])).rows[0];
  if(!asset||!['available','assigned'].includes(asset.status)||(asset.crew_id&&asset.crew_id!==visit.crew_id))throw new ManageError('Un equipo no está disponible para esta cuadrilla.',409);
  if(!lines.some(l=>l.resource_id===asset.resource_id))throw new ManageError('El equipo debe corresponder a un recurso previsto de la visita.',409);
  const day=planningDay(visit.scheduled_at);
  if(asset.maintenance_due&&asset.maintenance_due<=day||(await tx.query("SELECT id FROM maintenance_orders WHERE asset_id=$1 AND status='open' AND due_on<=$2::date LIMIT 1",[id,day])).rows.length)throw new ManageError(`Mantenimiento pendiente del equipo ${asset.code}.`,409);
  const start=new Date(Date.parse(visit.scheduled_at)-Number(visit.travel_minutes||0)*60000).toISOString(),end=new Date(Date.parse(visit.scheduled_at)+Number(visit.planned_minutes||0)*60000).toISOString();
  if((await tx.query("SELECT r.visit_id FROM visit_asset_reservations r JOIN visits v ON v.id=r.visit_id WHERE r.asset_id=$1 AND v.id<>$2 AND v.status IN('scheduled','started') AND v.deleted_at IS NULL AND v.scheduled_at-v.travel_minutes*interval '1 minute'<$4::timestamptz AND v.scheduled_at+v.planned_minutes*interval '1 minute'>$3::timestamptz LIMIT 1",[id,visit.id,start,end])).rows.length)throw new ManageError(`El equipo ${asset.code} ya está reservado en ese horario.`,409);
  selected.push(asset);
 }
 if(requireComplete&&lines.some(l=>!selected.some(a=>a.resource_id===l.resource_id)))throw new ManageError('Reserva un equipo físico para cada recurso de maquinaria previsto antes de iniciar.',409);
 return selected;
}
export async function saveAssetReservations(db,input){
 const v=parse(z.object({id:text,revision:z.number().int().positive(),asset_ids:z.array(z.string().uuid()).max(100),reason:text}),input);
 if(new Set(v.asset_ids).size!==v.asset_ids.length)throw new ManageError('No repitas equipos.');
 return db.transaction(async tx=>{
  await lockOperationalPlan(tx);const visit=(await tx.query("SELECT * FROM visits WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[v.id])).rows[0];
  if(visit?.status!=='scheduled'||visit.revision!==v.revision)throw new ManageError('La visita cambió o ya se inició. Recarga.',409);
  await validateAssetReservations(tx,visit,v.asset_ids);
  const before=(await tx.query("SELECT asset_id FROM visit_asset_reservations WHERE visit_id=$1",[v.id])).rows;
  await tx.query("DELETE FROM visit_asset_reservations WHERE visit_id=$1",[v.id]);for(const id of v.asset_ids)await tx.query("INSERT INTO visit_asset_reservations VALUES($1,$2)",[v.id,id]);
  await tx.query("UPDATE visits SET revision=revision+1 WHERE id=$1",[v.id]);await audit(tx,'visit_asset_reservations',v.id,'updated',{before,after:v});return {id:v.id};
 });
}
export async function saveMaintenance(db,input){
 const v=parse(z.object({id:z.string().uuid().optional(),revision:z.number().int().positive().optional(),asset_id:z.string().uuid(),description:text,due_on:date,status:z.enum(['open','completed','cancelled']),completed_on:z.union([z.literal(''),date]),cost:z.union([z.literal(''),money]),notes:z.string().trim().max(2000),next_due:z.union([z.literal(''),date]).optional()}),input);
 if(v.status==='completed'&&!v.completed_on)throw new ManageError('Registra la fecha real de mantenimiento.');
 if(v.completed_on&&v.completed_on>planningDay(new Date()))throw new ManageError('La fecha real no puede estar en el futuro.');
 return db.transaction(async tx=>{
  await lockOperationalPlan(tx);if(!(await tx.query("SELECT id FROM equipment_assets WHERE id=$1 FOR UPDATE",[v.asset_id])).rows.length)throw new ManageError('Equipo de esta empresa no disponible.',404);
  const old=v.id?(await tx.query("SELECT * FROM maintenance_orders WHERE id=$1 FOR UPDATE",[v.id])).rows[0]:null;
  if(v.id&&(!old||old.revision!==v.revision||old.asset_id!==v.asset_id))throw new ManageError('La orden cambió. Recarga.',409);
  const id=v.id||randomUUID(),values=[id,v.asset_id,v.description,v.due_on,v.status,v.status==='completed'?v.completed_on:null,v.cost===''?null:Math.round(v.cost*100),v.notes];
  if(old)await tx.query("UPDATE maintenance_orders SET asset_id=$2,description=$3,due_on=$4,status=$5,completed_on=$6,cost_cents=$7,notes=$8,revision=revision+1 WHERE id=$1",values);
  else await tx.query("INSERT INTO maintenance_orders(id,asset_id,description,due_on,status,completed_on,cost_cents,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",values);
  await tx.query("UPDATE visits v SET assignment_review_required=true,assignment_review_reason='Mantenimiento del equipo reservado modificado: revisar disponibilidad.',revision=revision+1 FROM visit_asset_reservations r WHERE r.visit_id=v.id AND r.asset_id=$1 AND v.status='scheduled' AND v.deleted_at IS NULL",[v.asset_id]);
  if(v.status==='completed'){if(v.next_due&&v.next_due<=v.completed_on)throw new ManageError('El próximo mantenimiento debe ser posterior al realizado.');await tx.query("UPDATE equipment_assets SET maintenance_due=CASE WHEN maintenance_due<=$2::date THEN $3::date ELSE maintenance_due END,status=CASE WHEN status='maintenance' THEN CASE WHEN crew_id IS NULL THEN 'available' ELSE 'assigned' END ELSE status END,revision=revision+1 WHERE id=$1",[v.asset_id,v.completed_on,v.next_due||null]);}
  await audit(tx,'maintenance_order',id,old?'updated':'created',{before:old,after:v});return {id};
 });
}
