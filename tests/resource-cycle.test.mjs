import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/modules/operations/migrations.mjs";
import { saveEmployee,saveCrew } from "../src/modules/operations/workforce.mjs";
import { saveVisit,changeVisit,completeVisit,saveVisitCosts,visitList } from "../src/modules/operations/visits.mjs";
import { saveResource,resourceCatalog,saveResourcePlan,saveResourceUsage,resourceReport } from "../src/modules/operations/resources.mjs";
import { reassignPending } from "../src/modules/operations/reassignment.mjs";
import { bootstrapCompanyStorage,companyDatabase,assertCompanyStorage } from "../src/modules/operations/tenant-database.mjs";
import { assignedExecutionDatabase } from "../src/modules/identity/assignments.mjs";
async function seed(db){
	await db.query("INSERT INTO customers VALUES('customer','Marina Alder')");await db.query("INSERT INTO properties(id,customer_id,name,address) VALUES('property','customer','Elm Garden','Synthetic address')");await db.query("INSERT INTO contracts(id,property_id,service,frequency,monthly_cents,visits_per_month,estimated_minutes) VALUES('contract','property','Corte','Semanal',32000,4,60)");
	const e=await saveEmployee(db,{first_name:"Lucas",last_name:"Alder",email:"",phone:"",role_key:"operator",skills:"Corte",hourly:20,status:"active"});
	const c=await saveCrew(db,{name:"North",shift_start:"08:00",shift_end:"17:00",break_minutes:30,members:[{employee_id:e.id,duty:"operator"}]});
	const input={contract_id:"contract",crew_id:c.id,scheduled_at:"2026-11-10T15:00:00Z",title:"Corte frontal",planned_minutes:60,travel_minutes:10,tasks:[{service_key:"mowing",description:"Corte frontal",employee_id:e.id,quantity:150,unit:"sqft"}]};
	const v=await saveVisit(db,input);return {e,c,v,input};
}
test("batch reassignment preserves valid slots and tasks, reports impossible plans, and is repeatable without duplicate staff",async()=>{
	const db=new PGlite();try{await migrate(db);const {v,input}=await seed(db);const other=await saveVisit(db,{...input,scheduled_at:"2026-11-10T17:00:00Z"});await db.query("UPDATE visits SET assignment_review_required=true");await db.query("UPDATE visits SET scheduled_at='2026-11-10T05:00:00Z' WHERE id=$1",[other.id]);
		const result=await reassignPending(db);assert.equal(result.assigned.length,1);assert.equal(result.blocked.length,1);assert.equal(result.remaining,1);
		const saved=(await visitList(db)).find(r=>r.id===v.id);assert.equal(new Date(saved.scheduled_at).toISOString(),"2026-11-10T15:00:00.000Z");assert.equal(saved.tasks[0].description,"Corte frontal");assert.equal((await reassignPending(db)).assigned.length,0);assert.equal((await db.query("SELECT count(*)::int n FROM employees")).rows[0].n,1);
	}finally{await db.close();}
});
test("planned resources freeze tariffs; actuals and corrections update costs once, preserve known labor, and calculate comparable production units",async()=>{
	const db=new PGlite();try{await migrate(db);const {v,e}=await seed(db);const mat=await saveResource(db,{name:"Mulch",category:"materials",unit_key:"bag",unit_cost:10,status:"active"}),unknown=await saveResource(db,{name:"Cortadora",category:"equipment",unit_key:"hour",unit_cost:"",status:"active"});
		assert.equal((await resourceCatalog(db)).find(r=>r.id===unknown.id).unit_cost_cents,null);
		await saveResourcePlan(db,{id:v.id,revision:1,lines:[{resource_id:mat.id,planned_quantity:3},{resource_id:unknown.id,planned_quantity:1}]});
		await saveResource(db,{id:mat.id,revision:1,name:"Mulch",category:"materials",unit_key:"bag",unit_cost:20,status:"active"});
		let report=await resourceReport(db,v.id);assert.equal(report.lines.find(l=>l.resource_id===mat.id).unit_cost_cents,1000);assert.equal(report.totals.planned_cents,null);
		await changeVisit(db,{id:v.id,revision:2,action:"start"});const lines=report.lines.map(l=>({id:l.id,actual_quantity:l.resource_id===mat.id?4:1,notes:"Consumo registrado"}));
		await assert.rejects(saveResourceUsage(db,{id:v.id,revision:3,reason:"Tarifa no autorizada",lines:lines.map(l=>({...l,unit_cost:2}))}),e=>e.status===403);
		await saveResourceUsage(db,{id:v.id,revision:3,reason:"Comprobante de consumo",lines});
		const task=(await visitList(db))[0].tasks[0];await completeVisit(db,{id:v.id,revision:4,notes:"Trabajo realizado",personnel:[{employee_id:e.id,actual_minutes:60}],tasks:[{id:task.id,completed_quantity:150,status:"done",notes:""}]});
		let row=(await visitList(db))[0];assert.equal(row.labor_cents,2000);assert.equal(row.cost_complete,false);assert.equal(row.materials_cents,4000);
		await saveVisitCosts(db,{id:v.id,revision:5,reason:"Traslado y otros costos",lines:[{category:"materials",description:"Otro material",quantity:1,unit_price:5}]});
		await saveResourceUsage(db,{id:v.id,revision:6,reason:"Valorar equipo con tarifa",lines:lines.map(l=>({...l,...(report.lines.find(r=>r.id===l.id).resource_id===unknown.id?{unit_cost:2}:{})}))},{allowPrices:true});
		row=(await visitList(db))[0];assert.equal(row.materials_cents,4500);assert.equal(row.equipment_cents,200);assert.equal(row.cost_complete,true);
		await saveResourceUsage(db,{id:v.id,revision:7,reason:"Corrección de bolsas devueltas",lines:lines.map(l=>({...l,actual_quantity:report.lines.find(r=>r.id===l.id).resource_id===mat.id?2:1}))});
		row=(await visitList(db))[0];assert.equal(row.materials_cents,2500);assert.equal(row.equipment_cents,200);report=await resourceReport(db,v.id);assert.equal(report.totals.planned_cents,null);assert.equal(report.lines.find(l=>l.resource_id===mat.id).planned_cents,3000);assert.equal(report.lines.find(l=>l.resource_id===unknown.id).actual_cents,200);assert.equal(report.productivity[0].per_person_hour,150);assert.equal(report.person_minutes.actual,60);assert.equal(JSON.stringify(await resourceReport(db,v.id,false)).includes("cents"),false);
	}finally{await db.close();}
});
test("resource migration upgrades old namespaces and assigned execution rejects another crew and another company's resources",async()=>{
	const db=new PGlite();try{await migrate(db);const {v}=await seed(db);const schema=`tenant_${randomUUID().replaceAll("-","")}`;await db.transaction(tx=>bootstrapCompanyStorage(tx,schema));const other=companyDatabase(db,schema);await seed(other);
		const mat=await saveResource(db,{name:"Mulch",category:"materials",unit_key:"bag",unit_cost:10,status:"active"});
		const foreign=(await visitList(other))[0];await assert.rejects(saveResourcePlan(other,{id:foreign.id,revision:1,lines:[{resource_id:mat.id,planned_quantity:1}]}),/esta empresa/);
		await db.query("INSERT INTO app_members VALUES('crew@access.invalid','Elena','worker','active',1)");
		await assert.rejects(changeVisit(assignedExecutionDatabase(db,"crew@access.invalid",v.id),{id:v.id,revision:1,action:"start"}),e=>e.status===403);
		const own=(await visitList(db))[0];await db.query("INSERT INTO app_crew_members(email,crew_id) VALUES('crew@access.invalid',$1)",[own.crew_id]);
		await saveResourcePlan(db,{id:v.id,revision:1,lines:[{resource_id:mat.id,planned_quantity:1}]});
		await changeVisit(assignedExecutionDatabase(db,"crew@access.invalid",v.id),{id:v.id,revision:2,action:"start"});
		const started=(await visitList(db))[0];await changeVisit(assignedExecutionDatabase(db,"crew@access.invalid",v.id),{id:v.id,revision:3,action:"cancel",reason:"Se inició por error",personnel:started.personnel.map(p=>({employee_id:p.employee_id,actual_minutes:0})),tasks:started.tasks.map(t=>({id:t.id,completed_quantity:0}))});
		assert.equal((await visitList(db))[0].cost_complete,false);
		await db.exec(`DROP TABLE "${schema}".visit_resources,"${schema}".operating_resources;ALTER TABLE "${schema}".visits DROP COLUMN resources_prepared;DELETE FROM "${schema}".schema_migrations WHERE version IN (20,22)`);
		await db.query("INSERT INTO security_companies(id,name,status,operational_enabled) VALUES('other','Other company','active',true)");await db.query("INSERT INTO security_company_storage VALUES('other',$1)",[schema]);await migrate(db);await assertCompanyStorage(db,schema);assert.equal((await other.query("SELECT count(*)::int n FROM customers")).rows[0].n,1);
	}finally{await db.close();}
});
