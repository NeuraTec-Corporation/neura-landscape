import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/modules/operations/migrations.mjs";
import { availability,saveAvailability } from "../src/modules/operations/availability.mjs";
import { saveEmployee,saveCrew } from "../src/modules/operations/workforce.mjs";
import { saveVisit,visitList,changeVisit } from "../src/modules/operations/visits.mjs";
import { suggestSlots } from "../src/modules/operations/scheduling.mjs";
import { saveResource,saveResourcePlan,saveResourceUsage,setEvaluationRates,resourceCatalog } from "../src/modules/operations/resources.mjs";
import { inventory,moveStock,postVisitStock,saveAsset } from "../src/modules/operations/inventory.mjs";
import { bootstrapCompanyStorage,companyDatabase,assertCompanyStorage } from "../src/modules/operations/tenant-database.mjs";
import { assignPortal,customerPortal,portalProperty,saveMessage,changeMessage,messageList } from "../src/modules/operations/engagement.mjs";
async function setup(db){
 await migrate(db);await db.query("INSERT INTO customers VALUES('customer','Marina Alder')");await db.query("INSERT INTO properties(id,customer_id,name,address,service_hours) VALUES('property','customer','Elm Garden','Synthetic address','08:00–17:00')");await db.query("INSERT INTO contracts(id,property_id,service,frequency,monthly_cents,visits_per_month,estimated_minutes) VALUES('contract','property','Corte','Semanal',32000,4,60)");
 const e=await saveEmployee(db,{first_name:"Lucas",last_name:"Alder",email:"",phone:"",role_key:"operator",skills:"Corte",hourly:20,status:"active"});const c=await saveCrew(db,{name:"North",shift_start:"08:00",shift_end:"17:00",break_minutes:30,members:[{employee_id:e.id,duty:"operator"}]});
 const input={contract_id:"contract",crew_id:c.id,scheduled_at:"2030-01-07T14:00:00Z",title:"Corte frontal",planned_minutes:60,travel_minutes:10,tasks:[{service_key:"mowing",description:"Corte frontal",employee_id:e.id,quantity:150,unit:"sqft"}]};return {e,c,input,v:await saveVisit(db,input)};
}
test("calendar and full-day absences flag existing plans, block new assignment and alternatives, preserve history and tenant isolation",async()=>{
 const db=new PGlite();try{
  const {e,input,v}=await setup(db);await saveAvailability(db,{action:"calendar",weekdays:[1,2,3,4,5],revision:0,reason:"Calendario confirmado"});
  await assert.rejects(saveVisit(db,{...input,scheduled_at:"2030-01-06T14:00:00Z"}),/no laborable/);
  const a=await saveAvailability(db,{action:"absence",employee_id:e.id,starts_on:"2030-01-07",ends_on:"2030-01-07",reason:"Vacaciones aprobadas"});
  assert.equal((await visitList(db))[0].assignment_review_required,true);
  await assert.rejects(saveVisit(db,{...input,scheduled_at:"2030-01-07T17:00:00Z"}),/no disponible/);
  assert.equal((await suggestSlots(db,{id:v.id,from:"2030-01-07",to:"2030-01-07"},new Date("2030-01-07T12:00:00Z"))).options.length,0);
  await saveAvailability(db,{action:"cancel_absence",id:a.id,revision:1,reason:"Vacaciones aplazadas"});assert.equal((await availability(db)).absences.length,0);
  const schema=`tenant_${randomUUID().replaceAll('-','')}`;await db.transaction(tx=>bootstrapCompanyStorage(tx,schema));await assertCompanyStorage(db,schema);assert.equal((await availability(companyDatabase(db,schema))).calendar,null);
 }finally{await db.close();}
});
test("customer portal requires active company mapping, isolates records and published photos; communication preparation never asserts delivery",async()=>{
 const db=new PGlite();try{
  await setup(db);const subject='marina@example.invalid';await db.query("INSERT INTO app_members(email,name,role,status) VALUES($1,'Marina Alder','manager','active')",[subject]);await db.query("INSERT INTO security_memberships(company_id,subject_id,status) VALUES('landscape',$1,'active')",[subject]);
  await db.query("INSERT INTO customers VALUES('other','Elena Grove')");await db.query("INSERT INTO properties(id,customer_id,name,address) VALUES('foreign','other','Other Garden','Synthetic address')");
  await assert.rejects(customerPortal(db,subject),e=>e.status===403);await assignPortal(db,'landscape',{subject_id:subject,customer_id:'customer',revision:0,active:true});
  await db.query("INSERT INTO property_photos(id,property_id,viewpoint,caption,pathname,width,height,bytes) VALUES('private','property','front','Internal','private.jpg',1,1,1),('published','property','front','Front garden','published.jpg',1,1,1),('other-photo','foreign','front','Other garden','other.jpg',1,1,1)");await db.query("INSERT INTO portal_photos(photo_id) VALUES('published'),('other-photo')");
  const data=await customerPortal(db,subject);assert.equal(data.properties.length,1);assert.deepEqual(data.photos.map(p=>p.id),['published']);assert.equal(await portalProperty(db,subject,'foreign'),false);assert.equal('labor_cents' in data.visits[0],false);
  await assignPortal(db,'landscape',{subject_id:subject,customer_id:'customer',revision:1,active:false});await assert.rejects(customerPortal(db,subject),e=>e.status===403);
  const input={customer_id:'customer',channel:'email',recipient:subject,subject:'Service visit',body:'Scheduled garden maintenance.',scheduled_at:'2030-01-07T14:00:00Z',status:'ready',reference:randomUUID()};const m=await saveMessage(db,input);await saveMessage(db,input);assert.equal((await messageList(db)).length,1);assert.equal((await messageList(db))[0].status,'ready');
  await changeMessage(db,{id:m.id,revision:1,action:'handoff',reason:'Opened external email app'});assert.equal((await messageList(db))[0].status,'handed_off');await assert.rejects(changeMessage(db,{id:m.id,revision:1,action:'cancel',reason:'Stale correction'}),e=>e.status===409);
 }finally{await db.close();}
});
test("inventory movements are idempotent, consumption corrections use deltas, no negative stock, equipment and evaluation tariffs are isolated",async()=>{
 const db=new PGlite();try{
  const {v,c}=await setup(db),material=await saveResource(db,{name:"Mulch",category:"materials",unit_key:"bag",unit_cost:"",status:"active"}),equipment=await saveResource(db,{name:"Mower",category:"equipment",unit_key:"hour",unit_cost:"",status:"active"});
  assert.equal((await setEvaluationRates(db)).updated,2);assert.equal((await setEvaluationRates(db)).updated,0);assert.ok((await resourceCatalog(db)).every(r=>r.rate_basis==='evaluation'));
  const entry={resource_id:material.id,quantity:10,reference:randomUUID(),reason:"Entrada de almacén"};await moveStock(db,entry);await moveStock(db,entry);assert.equal((await inventory(db)).stock[0].quantity,'10');
  await assert.rejects(moveStock(db,{...entry,reference:randomUUID(),quantity:-11}),/insuficientes/);
  await saveResourcePlan(db,{id:v.id,revision:1,lines:[{resource_id:material.id,planned_quantity:3}]});await changeVisit(db,{id:v.id,revision:2,action:"start"});
  const line=(await db.query("SELECT id FROM visit_resources WHERE visit_id=$1",[v.id])).rows[0];
  await saveResourceUsage(db,{id:v.id,revision:3,reason:"Material utilizado",lines:[{id:line.id,actual_quantity:3,notes:""}]});await postVisitStock(db,{id:v.id,reason:"Consumo confirmado"});await postVisitStock(db,{id:v.id,reason:"Reintento confirmado"});assert.equal((await inventory(db)).stock[0].quantity,'7');
  await saveResourceUsage(db,{id:v.id,revision:4,reason:"Corregir cantidad utilizada",lines:[{id:line.id,actual_quantity:2,notes:""}]});await postVisitStock(db,{id:v.id,reason:"Corrección de consumo"});assert.equal((await inventory(db)).stock[0].quantity,'8');
  await saveAsset(db,{resource_id:equipment.id,code:"EQ-001",name:"Mower A",serial_number:"S1",crew_id:c.id,status:"assigned",maintenance_due:"2030-02-01",notes:""});
  await assert.rejects(saveAsset(db,{resource_id:equipment.id,code:"EQ-001",name:"Mower B",serial_number:"",crew_id:null,status:"available",maintenance_due:"",notes:""}),/ya existe/);
 }finally{await db.close();}
});
