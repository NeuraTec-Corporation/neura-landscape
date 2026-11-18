import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {parse,text,ManageError,audit} from './manage.mjs';
import {lockOperationalPlan} from './planning-lock.mjs';
export async function stockPosition(tx,resource,warehouse,exceptVisit=''){
 const physical=Number((await tx.query("SELECT coalesce(sum(quantity),0)::text n FROM stock_movements WHERE resource_id=$1 AND warehouse_id=$2",[resource,warehouse])).rows[0].n);
 const reserved=Number((await tx.query("SELECT coalesce(sum(greatest(r.planned_quantity+coalesce((SELECT sum(m.quantity) FROM stock_movements m WHERE m.visit_id=r.visit_id AND m.resource_id=r.resource_id AND m.warehouse_id=r.warehouse_id),0),0)),0)::text n FROM visit_resources r JOIN visits v ON v.id=r.visit_id WHERE r.resource_id=$1 AND r.warehouse_id=$2 AND r.category='materials' AND v.id<>$3 AND v.status IN('scheduled','started') AND v.deleted_at IS NULL",[resource,warehouse,exceptVisit])).rows[0].n);
 return {physical,reserved,available:Math.round((physical-reserved)*1000)/1000};
}
export async function validateStockPlan(tx,visitId,lines){
 for(const l of [...lines].filter(l=>l.category==='materials').sort((a,b)=>a.resource_id.localeCompare(b.resource_id))){
  const warehouse=(await tx.query("SELECT * FROM warehouses WHERE id=$1",[l.warehouse_id||'main'])).rows[0];
  if(warehouse?.status!=='active')throw new ManageError('Selecciona un almacén activo de esta empresa.');
  if(warehouse.enforce_stock){const position=await stockPosition(tx,l.resource_id,warehouse.id,visitId);if(position.available<Number(l.planned_quantity))throw new ManageError(`Existencias libres insuficientes en ${warehouse.name}. Revisa otras reservas.`,409);}
 }
}
export async function saveWarehouse(db,input){
 const v=parse(z.object({id:text.optional(),revision:z.number().int().positive().optional(),code:text,name:text,status:z.enum(['active','inactive']),enforce_stock:z.boolean(),reason:text}),input);
 return db.transaction(async tx=>{
  await lockOperationalPlan(tx);const old=v.id?(await tx.query('SELECT * FROM warehouses WHERE id=$1 FOR UPDATE',[v.id])).rows[0]:null;
  if(v.id&&(!old||old.revision!==v.revision))throw new ManageError('El almacén cambió. Recarga.',409);
  if(old&&v.status==='inactive'&&(await tx.query("SELECT r.id FROM visit_resources r JOIN visits v ON v.id=r.visit_id WHERE r.warehouse_id=$1 AND v.status IN('scheduled','started') AND v.deleted_at IS NULL LIMIT 1",[old.id])).rows.length)throw new ManageError('Reasigna primero los planes activos de este almacén.',409);
  const id=old?.id||randomUUID(),code=v.code.toUpperCase();if((await tx.query('SELECT id FROM warehouses WHERE code=$1 AND id<>$2',[code,id])).rows.length)throw new ManageError('El código de almacén ya existe.',409);
  if(old)await tx.query('UPDATE warehouses SET code=$2,name=$3,status=$4,enforce_stock=$5,revision=revision+1 WHERE id=$1',[id,code,v.name,v.status,v.enforce_stock]);
  else await tx.query('INSERT INTO warehouses(id,code,name,status,enforce_stock) VALUES($1,$2,$3,$4,$5)',[id,code,v.name,v.status,v.enforce_stock]);
  await tx.query("UPDATE visits v SET assignment_review_required=true,assignment_review_reason='Política del almacén modificada: revisar reservas de material.',revision=revision+1 WHERE v.status='scheduled' AND v.deleted_at IS NULL AND EXISTS(SELECT 1 FROM visit_resources r WHERE r.visit_id=v.id AND r.category='materials' AND r.warehouse_id=$1)",[id]);
  await audit(tx,'warehouse',id,old?'updated':'created',{before:old,after:v});return {id};
 });
}
export async function transferStock(db,input){
 const v=parse(z.object({resource_id:z.string().uuid(),from:text,to:text,quantity:z.coerce.number().positive().max(1000000).refine(n=>Math.abs(n*1000-Math.round(n*1000))<0.00001),reason:text,reference:z.string().uuid()}),input);
 if(v.from===v.to)throw new ManageError('Origen y destino deben ser diferentes.');
 return db.transaction(async tx=>{
  await lockOperationalPlan(tx);const r=(await tx.query("SELECT * FROM operating_resources WHERE id=$1 AND category='materials' AND deleted_at IS NULL FOR UPDATE",[v.resource_id])).rows[0];if(!r)throw new ManageError('Material no disponible en esta empresa.',404);
  if(r.unit_key==='each'&&!Number.isInteger(v.quantity))throw new ManageError('Las unidades deben ser enteras.');
  const old=(await tx.query('SELECT * FROM stock_movements WHERE reference=$1',[`${v.reference}-out`])).rows[0];
  if(old){const incoming=(await tx.query('SELECT * FROM stock_movements WHERE reference=$1',[`${v.reference}-in`])).rows[0];if(old.resource_id!==v.resource_id||old.warehouse_id!==v.from||Number(old.quantity)!==-v.quantity||incoming?.warehouse_id!==v.to||old.reason!==v.reason)throw new ManageError('La referencia corresponde a otra transferencia.',409);return {repeated:true};}
  const warehouses=(await tx.query("SELECT * FROM warehouses WHERE id=ANY($1::text[]) AND status='active' FOR UPDATE",[[v.from,v.to]])).rows;if(warehouses.length!==2)throw new ManageError('Selecciona almacenes activos de esta empresa.');
  const position=await stockPosition(tx,v.resource_id,v.from);if((warehouses.find(w=>w.id===v.from).enforce_stock?position.available:position.physical)<v.quantity)throw new ManageError('Existencias libres insuficientes para la transferencia.',409);
  for(const [warehouse,q,suffix] of [[v.from,-v.quantity,'out'],[v.to,v.quantity,'in']])await tx.query("INSERT INTO stock_movements(id,resource_id,quantity,reason,reference,warehouse_id,movement_kind) VALUES($1,$2,$3,$4,$5,$6,'transfer')",[randomUUID(),v.resource_id,q,v.reason,`${v.reference}-${suffix}`,warehouse]);
  await audit(tx,'stock_transfer',v.reference,'recorded',v);return {saved:true};
 });
}
