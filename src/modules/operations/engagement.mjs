import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parse,text,audit,ManageError } from "./manage.mjs";
export async function messageList(db){return (await db.query("SELECT m.*,o.state delivery_state,o.attempts delivery_attempts,o.retry_after delivery_retry_after,c.name customer_name FROM customer_messages m JOIN customers c ON c.id=m.customer_id LEFT JOIN message_outbox o ON o.message_id=m.id ORDER BY m.scheduled_at DESC,m.id LIMIT 1000")).rows;}
export async function saveMessage(db,input){
 const v=parse(z.object({id:z.string().uuid().optional(),revision:z.number().int().positive().optional(),customer_id:text,channel:z.enum(['email','sms','whatsapp']),recipient:z.string().trim().min(1).max(254),subject:z.string().trim().max(200),body:z.string().trim().min(1).max(4000),scheduled_at:z.string().datetime({offset:true}),status:z.enum(['draft','ready']),reference:z.string().uuid()}),input);
 if(v.channel==='email'?!z.email().safeParse(v.recipient).success:!/^\+[1-9]\d{7,14}$/.test(v.recipient))throw new ManageError("Revisa el destinatario: correo válido o teléfono con código de país.");
 return db.transaction(async tx=>{
  if(!(await tx.query("SELECT id FROM customers WHERE id=$1",[v.customer_id])).rows.length)throw new ManageError("Selecciona un cliente de esta empresa.",404);
  const old=v.id?(await tx.query("SELECT * FROM customer_messages WHERE id=$1 FOR UPDATE",[v.id])).rows[0]:null;
  if(v.id&&(!old||old.revision!==v.revision||!['draft','ready'].includes(old.status)))throw new ManageError("El mensaje cambió o ya se entregó a una aplicación. Recarga.",409);
  if(old&&(await tx.query("SELECT message_id FROM message_outbox WHERE message_id=$1",[old.id])).rows.length)throw new ManageError("El mensaje encolado conserva su contenido. Cancélalo y crea otro para corregirlo.",409);
  const existing=(await tx.query("SELECT * FROM customer_messages WHERE reference=$1",[v.reference])).rows[0];
  if(existing&&!v.id){if(existing.customer_id!==v.customer_id||existing.body!==v.body||existing.recipient!==v.recipient)throw new ManageError("La referencia ya está en uso.",409);return {id:existing.id};}
  const id=v.id||randomUUID(),values=[id,v.customer_id,v.channel,v.recipient,v.subject,v.body,v.scheduled_at,v.status,v.reference];
  if(old)await tx.query("UPDATE customer_messages SET customer_id=$2,channel=$3,recipient=$4,subject=$5,body=$6,scheduled_at=$7,status=$8,reference=$9,revision=revision+1 WHERE id=$1",values);
  else await tx.query("INSERT INTO customer_messages(id,customer_id,channel,recipient,subject,body,scheduled_at,status,reference) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",values);
  await audit(tx,"customer_message",id,old?"updated":"created",{channel:v.channel,status:v.status});return {id};
 });
}
export async function changeMessage(db,input){
 const v=parse(z.object({id:z.string().uuid(),revision:z.number().int().positive(),action:z.enum(['cancel','handoff']),reason:text}),input);
 return db.transaction(async tx=>{
  const old=(await tx.query("SELECT * FROM customer_messages WHERE id=$1 FOR UPDATE",[v.id])).rows[0];
  if(!old||old.revision!==v.revision||!['draft','ready'].includes(old.status)||(v.action==='handoff'&&old.status!=='ready'))throw new ManageError("El mensaje cambió o no está listo. Recarga.",409);
  const queued=(await tx.query("SELECT * FROM message_outbox WHERE message_id=$1 FOR UPDATE",[v.id])).rows[0];if(queued&&(v.action==='handoff'||queued.state==='processing'||queued.state==='accepted'))throw new ManageError("El envío ya está en proceso o fue aceptado; no se confirma una cancelación sin respuesta del proveedor.",409);
  if(queued)await tx.query("UPDATE message_outbox SET state='cancelled',updated_at=now() WHERE message_id=$1",[v.id]);
  await tx.query("UPDATE customer_messages SET status=$2,revision=revision+1 WHERE id=$1",[v.id,v.action==='cancel'?'cancelled':'handed_off']);
  await audit(tx,"customer_message",v.id,v.action,{reason:v.reason,delivery_confirmed:false});return {id:v.id};
 });
}
export async function portalAccess(db,subject){return (await db.query("SELECT a.customer_id,c.name FROM customer_portal_access a JOIN customers c ON c.id=a.customer_id JOIN public.app_members m ON m.email=a.subject_id WHERE a.subject_id=$1 AND a.active=true AND m.status='active'",[subject])).rows[0]||null;}
export async function portalProperty(db,subject,propertyId){return Boolean((await db.query("SELECT p.id FROM properties p JOIN customer_portal_access a ON a.customer_id=p.customer_id JOIN public.app_members m ON m.email=a.subject_id WHERE a.subject_id=$1 AND a.active=true AND m.status='active' AND p.id=$2 AND p.deleted_at IS NULL",[subject,propertyId])).rows.length);}
export async function customerPortal(db,subject){
 const access=await portalAccess(db,subject);if(!access)throw new ManageError("Tu usuario aún no tiene un expediente de cliente asignado. Consulta al administrador.",403);
 const customer=access.customer_id;
 return {
  customer:{id:customer,name:access.name},
  properties:(await db.query("SELECT id,name,address,city,region,postal_code,country FROM properties WHERE customer_id=$1 AND deleted_at IS NULL ORDER BY name",[customer])).rows,
  visits:(await db.query("SELECT v.id,v.scheduled_at,v.status,v.title,p.name property_name,c.service,CASE WHEN v.status='completed' THEN coalesce((SELECT json_agg(json_build_object('id',t.id,'description',t.description,'unit',t.unit,'completed_quantity',t.completed_quantity,'status',t.status)) FROM visit_tasks t WHERE t.visit_id=v.id),'[]'::json) ELSE '[]'::json END tasks,CASE WHEN v.status='completed' THEN coalesce((SELECT json_agg(json_build_object('id',r.id,'name',r.name_snapshot,'unit',r.unit_key,'actual_quantity',r.actual_quantity)) FROM visit_resources r WHERE r.visit_id=v.id AND r.actual_quantity IS NOT NULL),'[]'::json) ELSE '[]'::json END resources FROM visits v JOIN contracts c ON c.id=v.contract_id JOIN properties p ON p.id=c.property_id WHERE p.customer_id=$1 AND p.deleted_at IS NULL AND v.deleted_at IS NULL ORDER BY v.scheduled_at DESC",[customer])).rows,
  invoices:(await db.query("SELECT i.id,i.number,i.issue_date::text issue_date,i.due_date::text due_date,i.total_cents,coalesce((SELECT json_agg(json_build_object('id',l.id,'description',l.description,'quantity',l.quantity,'unit_price_cents',l.unit_price_cents,'total_cents',l.total_cents)) FROM invoice_lines l WHERE l.invoice_id=i.id),'[]'::json) lines,coalesce((SELECT sum(amount_cents) FROM payments WHERE invoice_id=i.id AND voided_at IS NULL),0)::int paid_cents FROM invoices i WHERE i.customer_id=$1 AND i.status='issued' AND i.deleted_at IS NULL ORDER BY i.issue_date DESC",[customer])).rows,
  photos:(await db.query("SELECT f.id,f.caption,f.property_id,p.name property_name FROM property_photos f JOIN portal_photos x ON x.photo_id=f.id JOIN properties p ON p.id=f.property_id WHERE p.customer_id=$1 AND f.deleted_at IS NULL AND p.deleted_at IS NULL ORDER BY x.published_at DESC",[customer])).rows,
 };
}
export async function assignPortal(db,companyId,input){
 const v=parse(z.object({subject_id:text,customer_id:text,revision:z.number().int().nonnegative(),active:z.boolean()}),input);
 return db.transaction(async tx=>{
  if(!(await tx.query("SELECT subject_id FROM public.security_memberships WHERE company_id=$1 AND subject_id=$2 AND status='active' FOR SHARE",[companyId,v.subject_id])).rows.length)throw new ManageError("El usuario debe pertenecer a esta empresa.",403);
  if(!(await tx.query("SELECT id FROM customers WHERE id=$1",[v.customer_id])).rows.length)throw new ManageError("El cliente no pertenece a esta empresa.",404);
  const old=(await tx.query("SELECT * FROM customer_portal_access WHERE subject_id=$1 FOR UPDATE",[v.subject_id])).rows[0];
  if((old?.revision||0)!==v.revision)throw new ManageError("La asignación cambió. Recarga.",409);
  await tx.query("INSERT INTO customer_portal_access(subject_id,customer_id,active) VALUES($1,$2,$3) ON CONFLICT(subject_id) DO UPDATE SET customer_id=excluded.customer_id,active=excluded.active,revision=customer_portal_access.revision+1",[v.subject_id,v.customer_id,v.active]);
  await audit(tx,"portal_access",v.subject_id,"updated",{before:old,after:v});return {saved:true};
 });
}
