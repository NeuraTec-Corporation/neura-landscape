import {lockOperationalPlan} from "./planning-lock.mjs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parse, date, text, audit, ManageError } from "./manage.mjs";
export async function availability(db) {
 return await (async tx=>({
  calendar:(await tx.query("SELECT * FROM working_calendar WHERE singleton=true")).rows[0]||null,
  absences:(await tx.query("SELECT a.*,a.starts_on::text starts_on,a.ends_on::text ends_on,e.first_name||' '||e.last_name employee_name FROM employee_absences a JOIN employees e ON e.id=a.employee_id WHERE a.cancelled_at IS NULL ORDER BY a.starts_on DESC,a.id")).rows,
 }))(db);
}
export { availabilityProblem } from "./calendar-policy.mjs";
async function flagPending(tx){
 // Re-evaluate existing plans without silently cancelling or changing a crew.
 await tx.query("UPDATE visits v SET assignment_review_required=true,assignment_review_reason='Revisar disponibilidad: calendario o ausencia de personal.',revision=revision+1 WHERE v.status='scheduled' AND v.deleted_at IS NULL AND (EXISTS(SELECT 1 FROM working_calendar c WHERE NOT(extract(dow FROM v.scheduled_at AT TIME ZONE 'America/New_York')::integer=ANY(c.weekdays))) OR EXISTS(SELECT 1 FROM visit_personnel p JOIN employee_absences a ON a.employee_id=p.employee_id WHERE p.visit_id=v.id AND a.cancelled_at IS NULL AND (v.scheduled_at AT TIME ZONE 'America/New_York')::date BETWEEN a.starts_on AND a.ends_on))");
}
export async function saveAvailability(db,input){
 const reasonSchema=z.string().trim().min(5).max(500);
 return db.transaction(async tx=>{
 await lockOperationalPlan(tx);

  // Same row lock as visit creation; adding an absence cannot race assignment.
  if(input.action==="calendar"){
   const v=parse(z.object({weekdays:z.array(z.number().int().min(0).max(6)).min(1).max(7),revision:z.number().int().nonnegative(),reason:reasonSchema}),input);
   await tx.query("SELECT id FROM employees ORDER BY id FOR UPDATE");
   const old=(await tx.query("SELECT * FROM working_calendar WHERE singleton=true FOR UPDATE")).rows[0];
   if((old?.revision||0)!==v.revision)throw new ManageError("El calendario cambió. Recarga.",409);
   await tx.query("INSERT INTO working_calendar(singleton,weekdays) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET weekdays=excluded.weekdays,revision=working_calendar.revision+1",[[...new Set(v.weekdays)]]);
   await flagPending(tx);await audit(tx,"working_calendar","company","updated",{before:old,after:v});return {saved:true};
  }
  if(input.action==="absence"){
   const v=parse(z.object({id:z.string().uuid().optional(),revision:z.number().int().positive().optional(),employee_id:z.string().uuid(),starts_on:date,ends_on:date,reason:reasonSchema}),input);
   if(v.ends_on<v.starts_on)throw new ManageError("La fecha final debe ser posterior o igual a la inicial.");
   const e=(await tx.query("SELECT id FROM employees WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[v.employee_id])).rows[0];
   if(!e)throw new ManageError("Selecciona un empleado de esta empresa.",404);
   const old=v.id?(await tx.query("SELECT * FROM employee_absences WHERE id=$1 FOR UPDATE",[v.id])).rows[0]:null;
   if(v.id&&(!old||old.cancelled_at||old.revision!==v.revision||old.employee_id!==v.employee_id))throw new ManageError("La ausencia cambió. Recarga.",409);
   const id=v.id||randomUUID();
   if(old)await tx.query("UPDATE employee_absences SET starts_on=$2,ends_on=$3,reason=$4,revision=revision+1 WHERE id=$1",[id,v.starts_on,v.ends_on,v.reason]);
   else await tx.query("INSERT INTO employee_absences(id,employee_id,starts_on,ends_on,reason) VALUES($1,$2,$3,$4,$5)",[id,v.employee_id,v.starts_on,v.ends_on,v.reason]);
   await flagPending(tx);await audit(tx,"employee_absence",id,old?"updated":"created",{before:old,after:v});return {id};
  }
  const v=parse(z.object({action:z.literal("cancel_absence"),id:z.string().uuid(),revision:z.number().int().positive(),reason:text}),input);
  const row=(await tx.query("UPDATE employee_absences SET cancelled_at=now(),revision=revision+1 WHERE id=$1 AND revision=$2 AND cancelled_at IS NULL RETURNING id",[v.id,v.revision])).rows[0];
  if(!row)throw new ManageError("La ausencia cambió. Recarga.",409);
  await audit(tx,"employee_absence",v.id,"cancelled",{reason:v.reason});return row;
 });
}
