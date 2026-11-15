import {lockOperationalPlan} from "./planning-lock.mjs";
import {stockPosition} from "./warehouses.mjs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parse,date,text,audit,ManageError } from "./manage.mjs";
const quantity=z.coerce.number().finite().min(-1000000).max(1000000).refine(n=>Math.abs(n*1000-Math.round(n*1000))<0.00001);
export async function inventory(db){return {
 warehouses:(await db.query("SELECT * FROM warehouses ORDER BY name")).rows,
 stock:(await db.query("WITH physical AS(SELECT resource_id,warehouse_id,sum(quantity) quantity,count(*) movements FROM stock_movements GROUP BY resource_id,warehouse_id),reserved AS(SELECT r.resource_id,r.warehouse_id,sum(greatest(r.planned_quantity+coalesce((SELECT sum(m.quantity) FROM stock_movements m WHERE m.visit_id=r.visit_id AND m.resource_id=r.resource_id AND m.warehouse_id=r.warehouse_id),0),0)) quantity FROM visit_resources r JOIN visits v ON v.id=r.visit_id WHERE r.category='materials' AND v.status IN('scheduled','started') AND v.deleted_at IS NULL GROUP BY r.resource_id,r.warehouse_id) SELECT r.id,r.name,r.unit_key,w.id warehouse_id,w.name warehouse_name,w.enforce_stock,coalesce(p.quantity,0)::text quantity,coalesce(p.movements,0)::int movements,coalesce(s.quantity,0)::text reserved,(coalesce(p.quantity,0)-coalesce(s.quantity,0))::text available FROM operating_resources r CROSS JOIN warehouses w LEFT JOIN physical p ON p.resource_id=r.id AND p.warehouse_id=w.id LEFT JOIN reserved s ON s.resource_id=r.id AND s.warehouse_id=w.id WHERE r.category='materials' AND r.deleted_at IS NULL ORDER BY w.name,r.name")).rows,
 movements:(await db.query("SELECT m.*,r.name FROM stock_movements m JOIN operating_resources r ON r.id=m.resource_id ORDER BY m.occurred_at DESC,m.id LIMIT 500")).rows,
 maintenance:(await db.query("SELECT o.*,o.due_on::text due_on,o.completed_on::text completed_on,a.code asset_code,a.name asset_name FROM maintenance_orders o JOIN equipment_assets a ON a.id=o.asset_id ORDER BY o.due_on DESC,o.id")).rows,
 assets:(await db.query("SELECT a.*,a.maintenance_due::text maintenance_due,c.name crew_name,r.name resource_name FROM equipment_assets a JOIN operating_resources r ON r.id=a.resource_id LEFT JOIN crews c ON c.id=a.crew_id ORDER BY a.code")).rows,
 crews:(await db.query("SELECT id,name FROM crews WHERE deleted_at IS NULL ORDER BY name")).rows,
};}
export async function moveStock(db,input){
 const v=parse(z.object({resource_id:z.string().uuid(),warehouse_id:text.default('main'),kind:z.enum(['adjustment','count']).default('adjustment'),quantity,reason:z.string().trim().min(5).max(500),reference:z.string().uuid()}),input);
 if(v.kind==='count'&&v.quantity<0||v.kind==='adjustment'&&v.quantity===0)throw new ManageError('Revisa la cantidad del movimiento.');
 return db.transaction(async tx=>{
 await lockOperationalPlan(tx);

  const r=(await tx.query("SELECT * FROM operating_resources WHERE id=$1 AND category='materials' AND deleted_at IS NULL FOR UPDATE",[v.resource_id])).rows[0];
  if(!r)throw new ManageError("Selecciona un material de esta empresa.",404);
  if(r.unit_key==='each'&&!Number.isInteger(v.quantity))throw new ManageError("Las unidades deben ser enteras.");
  const warehouse=(await tx.query("SELECT * FROM warehouses WHERE id=$1 AND status='active'",[v.warehouse_id])).rows[0];if(!warehouse)throw new ManageError('Selecciona un almacén activo.');
  const old=(await tx.query("SELECT * FROM stock_movements WHERE reference=$1",[v.reference])).rows[0];
  if(old){if(old.resource_id!==v.resource_id||old.warehouse_id!==v.warehouse_id||old.movement_kind!==v.kind||Number(v.kind==='count'?old.counted_balance:old.quantity)!==v.quantity||old.reason!==v.reason)throw new ManageError("La referencia ya corresponde a otro movimiento.",409);return {id:old.id,repeated:true};}
  const pos=await stockPosition(tx,v.resource_id,v.warehouse_id),delta=v.kind==='count'?Math.round((v.quantity-pos.physical)*1000)/1000:v.quantity;
  if(Math.round((pos.physical+delta)*1000)<0||v.kind!=='count'&&warehouse.enforce_stock&&Math.round((pos.available+delta)*1000)<0)throw new ManageError("Existencias libres insuficientes. Revisa las reservas.",409);
  const id=randomUUID();await tx.query("INSERT INTO stock_movements(id,resource_id,quantity,reason,reference,warehouse_id,movement_kind,counted_balance) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[id,v.resource_id,delta,v.reason,v.reference,v.warehouse_id,v.kind,v.kind==='count'?v.quantity:null]);
  if(v.kind==='count')await tx.query("UPDATE visits v SET assignment_review_required=true,assignment_review_reason='Conteo físico actualizado: revisar existencias reservadas.',revision=revision+1 WHERE v.status='scheduled' AND v.deleted_at IS NULL AND EXISTS(SELECT 1 FROM visit_resources r WHERE r.visit_id=v.id AND r.resource_id=$1 AND r.warehouse_id=$2)",[v.resource_id,v.warehouse_id]);
  await audit(tx,"stock",id,"recorded",{...v,delta});return {id};
 });
}
export async function postVisitStock(db,input){
 const v=parse(z.object({id:text,reason:z.string().trim().min(5).max(500)}),input);
 return db.transaction(async tx=>{
 await lockOperationalPlan(tx);

  const visit=(await tx.query("SELECT id FROM visits WHERE id=$1 AND deleted_at IS NULL AND status IN('started','completed','cancelled') FOR UPDATE",[v.id])).rows[0];
  if(!visit)throw new ManageError("Selecciona una visita iniciada de esta empresa.",404);
  const lines=(await tx.query("SELECT * FROM visit_resources WHERE visit_id=$1 AND category='materials' ORDER BY resource_id",[v.id])).rows;
  if(lines.some(l=>l.actual_quantity===null))throw new ManageError("Registra todos los consumos antes de descontar existencias.");
  for(const l of lines){
   await tx.query("SELECT id FROM operating_resources WHERE id=$1 FOR UPDATE",[l.resource_id]);
   const posted=-Number((await tx.query("SELECT coalesce(sum(quantity),0)::text n FROM stock_movements WHERE visit_id=$1 AND resource_id=$2 AND warehouse_id=$3",[v.id,l.resource_id,l.warehouse_id])).rows[0].n);
   const delta=Math.round((Number(l.actual_quantity)-posted)*1000)/1000;if(!delta)continue;
   const position=await stockPosition(tx,l.resource_id,l.warehouse_id,v.id),warehouse=(await tx.query('SELECT * FROM warehouses WHERE id=$1',[l.warehouse_id])).rows[0];
   if(Math.round((position.physical-delta)*1000)<0||warehouse.enforce_stock&&Math.round((position.available-delta)*1000)<0)throw new ManageError('Existencias insuficientes frente a otras reservas.',409);
   const id=randomUUID();await tx.query("INSERT INTO stock_movements(id,resource_id,quantity,reason,visit_id,reference,warehouse_id,movement_kind) VALUES($1,$2,$3,$4,$5,$1,$6,'visit')",[id,l.resource_id,-delta,v.reason,v.id,l.warehouse_id]);
   await audit(tx,"stock",id,"visit_consumption",{visit_id:v.id,resource_id:l.resource_id,quantity:-delta,reason:v.reason});
  }
  return {id:v.id};
 });
}
export async function saveAsset(db,input){
 const v=parse(z.object({id:z.string().uuid().optional(),revision:z.number().int().positive().optional(),resource_id:z.string().uuid(),code:text,name:text,serial_number:z.string().trim().max(500),crew_id:z.string().nullable(),status:z.enum(['available','assigned','maintenance','retired']),maintenance_due:z.union([z.literal(''),date]),notes:z.string().trim().max(2000)}),input);
 if(v.status==='assigned'&&!v.crew_id)throw new ManageError("Selecciona la cuadrilla responsable.");
 return db.transaction(async tx=>{
 await lockOperationalPlan(tx);

  const resource=(await tx.query("SELECT * FROM operating_resources WHERE id=$1 AND category='equipment' AND deleted_at IS NULL FOR SHARE",[v.resource_id])).rows[0];if(!resource)throw new ManageError("Selecciona un equipo de esta empresa.",404);
  if(v.crew_id&&!(await tx.query("SELECT id FROM crews WHERE id=$1 AND deleted_at IS NULL FOR SHARE",[v.crew_id])).rows.length)throw new ManageError("Selecciona una cuadrilla de esta empresa.",404);
  const old=v.id?(await tx.query("SELECT * FROM equipment_assets WHERE id=$1 FOR UPDATE",[v.id])).rows[0]:null;
  if(v.id&&(!old||old.revision!==v.revision))throw new ManageError("El equipo cambió. Recarga.",409);
  const code=v.code.toUpperCase();if((await tx.query("SELECT id FROM equipment_assets WHERE code=$1 AND id<>$2",[code,v.id||''])).rows.length)throw new ManageError("El código del activo ya existe.",409);
  const id=v.id||randomUUID(),values=[id,v.resource_id,code,v.name,v.serial_number,v.crew_id,v.status,v.maintenance_due||null,v.notes];
  if(old)await tx.query("UPDATE equipment_assets SET resource_id=$2,code=$3,name=$4,serial_number=$5,crew_id=$6,status=$7,maintenance_due=$8,notes=$9,revision=revision+1 WHERE id=$1",values);
  else await tx.query("INSERT INTO equipment_assets(id,resource_id,code,name,serial_number,crew_id,status,maintenance_due,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",values);
  if(old)await tx.query("UPDATE visits v SET assignment_review_required=true,assignment_review_reason='Equipo reservado modificado: revisar disponibilidad.',revision=revision+1 FROM visit_asset_reservations r WHERE r.asset_id=$1 AND r.visit_id=v.id AND v.status='scheduled' AND v.deleted_at IS NULL",[id]);
  await audit(tx,"equipment_asset",id,old?"updated":"created",{before:old,after:v});return {id};
 });
}
