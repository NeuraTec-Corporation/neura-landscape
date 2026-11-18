import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {parse,date,text,ManageError,audit} from './manage.mjs';
import {requireOption} from './catalog.mjs';
import {lockOperationalPlan} from './planning-lock.mjs';
export {qualificationProblem,accessPolicyWindow} from './qualification-policy.mjs';
export async function assignmentPolicies(db){return {
 qualifications:(await db.query("SELECT q.*,q.valid_from::text valid_from,q.valid_until::text valid_until,e.first_name||' '||e.last_name employee_name FROM employee_qualifications q JOIN employees e ON e.id=q.employee_id ORDER BY e.last_name,q.service_key")).rows,
 rules:(await db.query("SELECT * FROM service_qualification_rules ORDER BY service_key")).rows,
 policies:(await db.query("SELECT p.*,s.name property_name FROM property_access_policies p JOIN properties s ON s.id=p.property_id ORDER BY s.name")).rows,
 windows:(await db.query("SELECT * FROM property_access_windows ORDER BY property_id,weekday")).rows,
};}
export async function saveQualification(db,input){
 return db.transaction(async tx=>{
  await lockOperationalPlan(tx);
  if(input.action==='qualification_rule'){
   const v=parse(z.object({service_key:text,required:z.boolean(),revision:z.number().int().nonnegative(),reason:text}),input);await requireOption(tx,'service',v.service_key);
   const old=(await tx.query("SELECT * FROM service_qualification_rules WHERE service_key=$1 FOR UPDATE",[v.service_key])).rows[0];
   if((old?.revision||0)!==v.revision)throw new ManageError('La regla cambió. Recarga.',409);
   await tx.query("INSERT INTO service_qualification_rules(service_key,required) VALUES($1,$2) ON CONFLICT(service_key) DO UPDATE SET required=excluded.required,revision=service_qualification_rules.revision+1",[v.service_key,v.required]);
   await flagService(tx,v.service_key);await audit(tx,'qualification_rule',v.service_key,'updated',{before:old,after:v});return {saved:true};
  }
  const v=parse(z.object({id:z.string().uuid().optional(),revision:z.number().int().positive().optional(),employee_id:text,service_key:text,valid_from:date,valid_until:z.union([z.literal(''),date]),certificate_ref:z.string().trim().max(300),retired:z.boolean().default(false),reason:text}),input);
  if(v.valid_until&&v.valid_until<v.valid_from)throw new ManageError('La vigencia final debe ser posterior al inicio.');
  if(!(await tx.query("SELECT id FROM employees WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[v.employee_id])).rows.length)throw new ManageError('Empleado no disponible en esta empresa.',404);
  await requireOption(tx,'service',v.service_key);
  const old=(await tx.query("SELECT * FROM employee_qualifications WHERE employee_id=$1 AND service_key=$2 FOR UPDATE",[v.employee_id,v.service_key])).rows[0];
  if(old&&(!v.id||v.id!==old.id||v.revision!==old.revision)||v.id&&!old)throw new ManageError('La habilitación ya existe o cambió. Recarga y edítala.',409);
  const id=old?.id||randomUUID();
  if(old)await tx.query("UPDATE employee_qualifications SET valid_from=$2,valid_until=$3,certificate_ref=$4,retired_at=CASE WHEN $5 THEN now() ELSE NULL END,revision=revision+1 WHERE id=$1",[id,v.valid_from,v.valid_until||null,v.certificate_ref,v.retired]);
  else await tx.query("INSERT INTO employee_qualifications(id,employee_id,service_key,valid_from,valid_until,certificate_ref) VALUES($1,$2,$3,$4,$5,$6)",[id,v.employee_id,v.service_key,v.valid_from,v.valid_until||null,v.certificate_ref]);
  await flagService(tx,v.service_key);await audit(tx,'employee_qualification',id,old?'updated':'created',{before:old,after:v});return {id};
 });
}
async function flagService(tx,key){await tx.query("UPDATE visits v SET assignment_review_required=true,assignment_review_reason='Habilitaciones modificadas: revisar responsables y vigencias.',revision=revision+1 WHERE v.status='scheduled' AND v.deleted_at IS NULL AND EXISTS(SELECT 1 FROM visit_tasks t JOIN service_qualification_rules r ON r.service_key=t.service_key WHERE t.visit_id=v.id AND t.service_key=$1 AND r.required)",[key]);}
export async function saveAccessPolicy(db,input){
 const clock=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),v=parse(z.object({property_id:text,revision:z.number().int().nonnegative(),windows:z.array(z.object({weekday:z.number().int().min(0).max(6),opens_at:clock,closes_at:clock})).max(7),reason:text}),input);
 if(new Set(v.windows.map(w=>w.weekday)).size!==v.windows.length||v.windows.some(w=>w.opens_at>=w.closes_at))throw new ManageError('Revisa los días y horarios de acceso.');
 return db.transaction(async tx=>{
  await lockOperationalPlan(tx);
  if(!(await tx.query("SELECT id FROM properties WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[v.property_id])).rows.length)throw new ManageError('Localidad no disponible en esta empresa.',404);
  const old=(await tx.query("SELECT * FROM property_access_policies WHERE property_id=$1 FOR UPDATE",[v.property_id])).rows[0];if((old?.revision||0)!==v.revision)throw new ManageError('El acceso cambió. Recarga.',409);
  const before=(await tx.query("SELECT * FROM property_access_windows WHERE property_id=$1",[v.property_id])).rows;
  await tx.query("INSERT INTO property_access_policies(property_id) VALUES($1) ON CONFLICT(property_id) DO UPDATE SET revision=property_access_policies.revision+1",[v.property_id]);
  await tx.query("DELETE FROM property_access_windows WHERE property_id=$1",[v.property_id]);for(const w of v.windows)await tx.query("INSERT INTO property_access_windows VALUES($1,$2,$3,$4)",[v.property_id,w.weekday,w.opens_at,w.closes_at]);
  await tx.query("UPDATE visits v SET assignment_review_required=true,assignment_review_reason='Acceso del inmueble modificado: revisar la fecha y el horario.',revision=v.revision+1 FROM contracts c WHERE c.id=v.contract_id AND c.property_id=$1 AND v.status='scheduled' AND v.deleted_at IS NULL",[v.property_id]);
  await audit(tx,'property_access_policy',v.property_id,'updated',{before,after:v});return {saved:true};
 });
}
