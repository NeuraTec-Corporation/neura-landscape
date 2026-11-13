import assert from "node:assert/strict";
import {test} from "node:test";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {migrate} from "../src/modules/operations/migrations.mjs";
import {saveEmployee,saveCrew} from "../src/modules/operations/workforce.mjs";
import {saveVisit,visitList} from "../src/modules/operations/visits.mjs";
import {suggestSlots,applySlot,suggestPendingSlots,applyPendingSlots} from "../src/modules/operations/scheduling.mjs";
import {planningInstant,accessWindow} from "../src/modules/operations/access-window.mjs";
import {resourceCatalog,prepareResourceCatalog,saveResourceRates,saveResourcePlan,resourceReport} from "../src/modules/operations/resources.mjs";
import {bootstrapCompanyStorage,companyDatabase} from "../src/modules/operations/tenant-database.mjs";
import {managementDashboard} from "../src/modules/operations/dashboard.mjs";
async function seed(db){
 await db.query("INSERT INTO customers VALUES('customer','Marina Alder')");await db.query("INSERT INTO properties(id,customer_id,name,address) VALUES('property','customer','Elm Garden','Synthetic address')");await db.query("INSERT INTO contracts(id,property_id,service,frequency,monthly_cents,visits_per_month,estimated_minutes) VALUES('contract','property','Corte','Semanal',32000,4,60)");
 const e=await saveEmployee(db,{first_name:"Lucas",last_name:"Alder",email:"",phone:"",role_key:"operator",skills:"Corte",hourly:20,status:"active"});const c=await saveCrew(db,{name:"North",shift_start:"08:00",shift_end:"17:00",break_minutes:30,members:[{employee_id:e.id,duty:"operator"}]});
 const input={contract_id:"contract",crew_id:c.id,scheduled_at:"2030-01-07T14:00:00Z",title:"Corte frontal",planned_minutes:60,travel_minutes:10,tasks:[{service_key:"mowing",description:"Corte frontal",employee_id:e.id,quantity:150,unit:"sqft"}]};return {e,c,input,v:await saveVisit(db,input)};
}
test("schedule alternatives respect access, shared workers, travel, contract and DST; confirmation revalidates stale revisions",async()=>{
 const db=new PGlite();try{await migrate(db);const {e,input,v}=await seed(db),target=await saveVisit(db,{...input,scheduled_at:"2030-01-07T16:00:00Z"});
 await saveCrew(db,{name:"Shared",shift_start:"08:00",shift_end:"17:00",break_minutes:30,members:[{employee_id:e.id,duty:"operator"}]});
 await db.query("UPDATE visits SET scheduled_at='2030-01-07T14:00:00Z',assignment_review_required=true WHERE id=$1",[target.id]);
 const range={id:target.id,from:"2030-01-07",to:"2030-01-07"},now=new Date("2030-01-07T12:00:00Z");
 assert.equal((await suggestSlots(db,range,now)).options.length,0);
 await db.query("UPDATE properties SET service_hours='09:00–17:00'");
 const earlier=await suggestSlots(db,{id:target.id,from:"2030-01-06",to:"2030-01-07"},new Date("2030-01-06T12:00:00Z"));assert.ok(earlier.options.every(x=>x.scheduled_at>="2030-01-07T00:00:00Z"));
 const result=await suggestSlots(db,range,now);assert.ok(result.options.length>=1);assert.ok(result.options.every(s=>s.scheduled_at>="2030-01-07T15:10:00.000Z"));
 await assert.rejects(saveVisit(db,{...input,scheduled_at:"2030-01-07T13:00:00Z"}),/acceso/);
 const choice=result.options[0],request={...choice,id:target.id,revision:result.revision,reason:"Resolver el cruce de personal"};await applySlot(db,request);
 const rows=await visitList(db),saved=rows.find(r=>r.id===target.id);assert.equal(new Date(saved.scheduled_at).toISOString(),choice.scheduled_at);assert.equal(saved.assignment_review_required,false);assert.equal(saved.tasks[0].description,"Corte frontal");assert.equal(saved.tasks[0].quantity,150);assert.equal(new Date(rows.find(r=>r.id===v.id).scheduled_at).toISOString(),"2030-01-07T14:00:00.000Z");
 await assert.rejects(applySlot(db,request),e=>e.status===409);
 await db.query("UPDATE visits SET assignment_review_required=true");
 const batch=await suggestPendingSlots(db,{from:range.from,to:range.to},now);assert.equal(batch.proposals.length,2);assert.equal(new Set(batch.proposals.map(p=>p.scheduled_at)).size,2);assert.equal((await visitList(db)).filter(r=>r.assignment_review_required).length,2);
 const applied=await applyPendingSlots(db,{proposals:batch.proposals,reason:"Planificar pendientes sin cruces"});assert.equal(applied.assigned.length,2);assert.equal(applied.remaining,0);
 assert.equal(planningInstant("2030-07-08",540),"2030-07-08T13:00:00.000Z");assert.equal(planningInstant("2030-01-07",540),"2030-01-07T14:00:00.000Z");assert.equal(planningInstant("2030-03-10",150),null);assert.equal(accessWindow("Solo por cita"),null);
 await db.query("UPDATE contracts SET effective_until='2030-01-06'");assert.equal((await suggestSlots(db,range,now)).options.length,0);
 }finally{await db.close();}
});
test("company starter catalog is idempotent and unpriced; bulk rates are atomic, isolated and preserve captured budgets",async()=>{
 const db=new PGlite();try{await migrate(db);const {v}=await seed(db);assert.equal((await prepareResourceCatalog(db)).created,8);assert.equal((await prepareResourceCatalog(db)).created,0);let catalog=await resourceCatalog(db);assert.ok(catalog.every(r=>r.unit_cost_cents===null));const r=catalog[0];
 await saveResourceRates(db,{reason:"Costo de proveedor aprobado",lines:[{id:r.id,revision:r.revision,unit_cost:10}]});await saveResourcePlan(db,{id:v.id,revision:1,lines:[{resource_id:r.id,planned_quantity:3}]});
 await saveResourceRates(db,{reason:"Actualización del proveedor",lines:[{id:r.id,revision:2,unit_cost:15}]});assert.equal((await resourceReport(db,v.id)).totals.planned_cents,3000);
 const schema=`tenant_${randomUUID().replaceAll("-","")}`;await db.transaction(tx=>bootstrapCompanyStorage(tx,schema));const other=companyDatabase(db,schema);await prepareResourceCatalog(other);const foreign=(await resourceCatalog(other))[0];
 await assert.rejects(saveResourceRates(db,{reason:"Rechazar recurso ajeno",lines:[{id:r.id,revision:3,unit_cost:99},{id:foreign.id,revision:1,unit_cost:12}]}),e=>e.status===409);
 catalog=await resourceCatalog(db);assert.equal(catalog.find(x=>x.id===r.id).unit_cost_cents,1500);assert.equal((await resourceCatalog(other))[0].unit_cost_cents,null);
 }finally{await db.close();}
});
test("manager compares matching cohorts and filters, retaining unknown costs and service units without fake zeroes",async()=>{
 const db=new PGlite();try{await migrate(db);const {v,input}=await seed(db);await prepareResourceCatalog(db);const r=(await resourceCatalog(db))[0];await saveResourceRates(db,{reason:"Costo de referencia registrado",lines:[{id:r.id,revision:1,unit_cost:10}]});await saveResourcePlan(db,{id:v.id,revision:1,lines:[{resource_id:r.id,planned_quantity:3}]});
 await db.query("UPDATE visits SET status='completed',labor_cents=1500 WHERE id=$1",[v.id]);await db.query("UPDATE visit_personnel SET actual_minutes=45 WHERE visit_id=$1",[v.id]);await db.query("UPDATE visit_tasks SET completed_quantity=120,status='done' WHERE visit_id=$1",[v.id]);await db.query("UPDATE visit_resources SET actual_quantity=4 WHERE visit_id=$1",[v.id]);
 const missing=await saveVisit(db,{...input,scheduled_at:"2030-01-08T14:00:00Z"});await db.query("UPDATE visits SET status='completed' WHERE id=$1",[missing.id]);
 const report=await managementDashboard(db,{from:"2030-01-07",to:"2030-01-08"}),s=report.comparison.summary;assert.equal(s.closed,2);assert.equal(s.time_compared,1);assert.equal(s.planned_person_minutes,60);assert.equal(s.actual_person_minutes,45);assert.equal(s.cost_compared,1);assert.equal(s.planned_cost_cents,5000);assert.equal(s.actual_cost_cents,5500);assert.equal(s.resource_plan_pending,1);assert.equal(s.resource_actual_pending,1);assert.equal(report.comparison.rows.find(x=>x.id===missing.id).cost_delta,null);assert.equal(report.comparison.production[0].actual,null);
 const filtered=await managementDashboard(db,{from:"2030-01-07",to:"2030-01-07"});assert.equal(filtered.comparison.summary.closed,1);assert.equal(filtered.comparison.production[0].actual,120);assert.equal(filtered.comparison.rows[0].time_delta,-15);
 }finally{await db.close();}
});
