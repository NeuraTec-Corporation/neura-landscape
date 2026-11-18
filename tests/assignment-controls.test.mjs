import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {betterAuth} from 'better-auth';
import {getMigrations} from 'better-auth/db/migration';
import {migrate} from '../src/modules/operations/migrations.mjs';
import {saveEmployee,saveCrew} from '../src/modules/operations/workforce.mjs';
import {saveVisit,visitList} from '../src/modules/operations/visits.mjs';
import {saveQualification,saveAccessPolicy} from '../src/modules/operations/qualifications.mjs';
import {suggestSlots} from '../src/modules/operations/scheduling.mjs';
import {saveResource,saveResourcePlan} from '../src/modules/operations/resources.mjs';
import {saveAsset,moveStock,inventory} from '../src/modules/operations/inventory.mjs';
import {saveWarehouse,transferStock,validateStockPlan} from '../src/modules/operations/warehouses.mjs';
import {saveAssetReservations,saveMaintenance,validateAssetReservations} from '../src/modules/operations/asset-reservations.mjs';
import {bootstrapCompanyStorage,assertCompanyStorage,companyDatabase} from '../src/modules/operations/tenant-database.mjs';
import {saveMessage,messageList} from '../src/modules/operations/engagement.mjs';
import {processDueMessages} from '../src/modules/operations/message-dispatch.mjs';
import {planRoadItinerary} from '../src/integrations/road-planning.mjs';
import {provisionCustomerEvaluationAccess} from '../src/modules/identity/customer-evaluation-access.mjs';
import {authenticationOptions} from '../src/modules/identity/auth.mjs';
import {enrollMembership,resolveSecurity} from '../src/modules/security/index.mjs';
import {permissionRegistry} from '../src/app/_security-manifest.mjs';
async function seed(db){
 await migrate(db);await db.exec("INSERT INTO customers VALUES('customer','Marina Alder');INSERT INTO properties(id,customer_id,name,address,service_hours) VALUES('property','customer','Elm Garden','Synthetic address','08:00–17:00');INSERT INTO contracts(id,property_id,service,frequency,monthly_cents,visits_per_month,estimated_minutes) VALUES('contract','property','Corte','Semanal',32000,4,60),('contract2','property','Corte posterior','Semanal',32000,4,60)");
 const employee=await saveEmployee(db,{first_name:'Lucas',last_name:'Alder',email:'',phone:'',role_key:'operator',skills:'',hourly:20,status:'active'}),crew=await saveCrew(db,{name:'North',shift_start:'08:00',shift_end:'17:00',break_minutes:30,members:[{employee_id:employee.id,duty:'operator'}]});
 const input={contract_id:'contract',crew_id:crew.id,scheduled_at:'2030-01-07T14:00:00Z',title:'Corte frontal',planned_minutes:60,travel_minutes:10,tasks:[{service_key:'mowing',description:'Corte frontal',employee_id:employee.id,quantity:150,unit:'sqft'}]};return {employee,crew,input,visit:await saveVisit(db,input)};
}
test('qualification expiry and individual duty, weekly property access, scheduling and new tenant migrations remain authoritative',async()=>{
 const db=new PGlite();try{
  const {employee,input,visit}=await seed(db);
  await saveQualification(db,{action:'qualification_rule',service_key:'mowing',required:true,revision:0,reason:'Licencia de trabajo requerida'});
  await assert.rejects(saveVisit(db,{...input,scheduled_at:'2030-01-07T16:00:00Z'}),/habilitación/);
  const cert=await saveQualification(db,{employee_id:employee.id,service_key:'mowing',valid_from:'2029-01-01',valid_until:'2030-01-06',certificate_ref:'CERT-01',reason:'Certificado documentado'});
  await assert.rejects(saveVisit(db,{...input,scheduled_at:'2030-01-07T16:00:00Z'}),/habilitación/);
  await saveQualification(db,{id:cert.id,revision:1,employee_id:employee.id,service_key:'mowing',valid_from:'2029-01-01',valid_until:'2031-01-01',certificate_ref:'CERT-02',reason:'Renovación de certificado'});
  await saveAccessPolicy(db,{property_id:'property',revision:0,windows:[{weekday:1,opens_at:'11:00',closes_at:'14:00'}],reason:'Acceso acordado los lunes'});
  await assert.rejects(saveVisit(db,{...input,scheduled_at:'2030-01-08T16:00:00Z'}),/inmueble/);
  const plan=await suggestSlots(db,{id:visit.id,from:'2030-01-07',to:'2030-01-08'},new Date('2030-01-07T12:00:00Z'));assert.ok(plan.options.length);assert.ok(plan.options.every(o=>o.scheduled_at.startsWith('2030-01-07')&&Date.parse(o.scheduled_at)>=Date.parse('2030-01-07T16:00:00Z')));
  const current=(await visitList(db))[0];await saveVisit(db,{...input,id:visit.id,revision:current.revision,scheduled_at:plan.options[0].scheduled_at});assert.equal((await visitList(db))[0].assignment_review_required,false);
  const schema=`tenant_${randomUUID().replaceAll('-','')}`;await db.transaction(tx=>bootstrapCompanyStorage(tx,schema));await assertCompanyStorage(db,schema);assert.equal((await companyDatabase(db,schema).query('SELECT count(*)::int n FROM employee_qualifications')).rows[0].n,0);
 }finally{await db.close();}
});
test('warehouse reservations, zero physical counts, atomic transfers, equipment conflicts and maintenance protect a work plan',async()=>{
 const db=new PGlite();try{
  const {crew,input,visit}=await seed(db),mat=await saveResource(db,{name:'Mulch',category:'materials',unit_key:'bag',unit_cost:12,status:'active'}),eq=await saveResource(db,{name:'Mower',category:'equipment',unit_key:'hour',unit_cost:18,status:'active'});
  await moveStock(db,{resource_id:mat.id,kind:'count',quantity:0,reference:randomUUID(),reason:'Conteo inicial de almacén'});assert.equal((await inventory(db)).stock[0].movements,1);
  await moveStock(db,{resource_id:mat.id,quantity:5,reference:randomUUID(),reason:'Recepción de cinco bolsas'});await saveWarehouse(db,{id:'main',revision:1,code:'PRINCIPAL',name:'Almacén principal',status:'active',enforce_stock:true,reason:'Inventario físico confirmado'});
  let revision=(await visitList(db))[0].revision;await saveResourcePlan(db,{id:visit.id,revision,lines:[{resource_id:mat.id,planned_quantity:3},{resource_id:eq.id,planned_quantity:1}]});
  await assert.rejects(db.transaction(tx=>validateStockPlan(tx,'another',[{resource_id:mat.id,warehouse_id:'main',category:'materials',planned_quantity:3}])) ,/Existencias libres insuficientes/);
  const second=await saveWarehouse(db,{code:'NORTE',name:'Depósito Norte',status:'active',enforce_stock:true,reason:'Segundo almacén de la operadora'}),transfer={resource_id:mat.id,from:'main',to:second.id,quantity:2,reason:'Preparación de ruta norte',reference:randomUUID()};await transferStock(db,transfer);await transferStock(db,transfer);assert.equal((await inventory(db)).stock.find(s=>s.warehouse_id==='main').available,'0');
  await assert.rejects(transferStock(db,{...transfer,reference:randomUUID(),quantity:1}),/insuficientes/);
  const asset=await saveAsset(db,{resource_id:eq.id,code:'EQ-001',name:'Mower A',serial_number:'S1',crew_id:null,status:'available',maintenance_due:'',notes:''});
  revision=(await visitList(db))[0].revision;await saveAssetReservations(db,{id:visit.id,revision,asset_ids:[asset.id],reason:'Equipo previsto para el servicio'});
  const otherEmployee=await saveEmployee(db,{first_name:'Elena',last_name:'Grove',email:'',phone:'',role_key:'operator',skills:'',hourly:20,status:'active'}),otherCrew=await saveCrew(db,{name:'South',shift_start:'08:00',shift_end:'17:00',break_minutes:30,members:[{employee_id:otherEmployee.id,duty:'operator'}]});
  const other=await saveVisit(db,{...input,contract_id:'contract2',crew_id:otherCrew.id,tasks:input.tasks.map(t=>({...t,employee_id:otherEmployee.id}))});await saveResourcePlan(db,{id:other.id,revision:1,lines:[{resource_id:eq.id,planned_quantity:1}]});await assert.rejects(saveAssetReservations(db,{id:other.id,revision:2,asset_ids:[asset.id],reason:'Intento de doble reserva'}),/ya está reservado/);
  await saveMaintenance(db,{asset_id:asset.id,description:'Revisión de cuchillas',due_on:'2029-12-01',status:'open',completed_on:'',cost:'',notes:''});
  await assert.rejects(db.transaction(tx=>validateAssetReservations(tx,{...input,id:visit.id},undefined,{requireComplete:true})),/Mantenimiento/);
  await moveStock(db,{resource_id:mat.id,kind:'count',quantity:1,reference:randomUUID(),reason:'Conteo revela faltante físico'});assert.equal((await inventory(db)).stock.find(s=>s.warehouse_id==='main').available,'-2');assert.equal((await visitList(db)).find(v=>v.id===visit.id).assignment_review_required,true);assert.equal(crew.id,input.crew_id);
 }finally{await db.close();}
});
test('customer Preview accounts are least-privileged and never reset; provider ports block without setup and retry a frozen message idempotently',async()=>{
 const db=new PGlite();try{
  await seed(db);await db.exec("UPDATE security_companies SET operational_enabled=true WHERE id='landscape';INSERT INTO app_members(email,name,role,status) VALUES('root@example.invalid','Administrador','it_admin','active');INSERT INTO operator_settings(id,code) VALUES(1,'ROJAS');INSERT INTO sample_data_batches(id,created_by,manifest) VALUES('batch','system','{}');INSERT INTO sample_data_records VALUES('batch','customer','customer')");await enrollMembership(db,'landscape','root@example.invalid',['default-it_admin']);
  const pool={connect:async()=>({query:async(sql,params)=>{const r=await db.query(sql,params);return {...r,rowCount:r.affectedRows||r.rows.length};},release(){}}),end:async()=>{}};
  const auth=betterAuth(authenticationOptions(pool,{BETTER_AUTH_URL:'http://localhost:3042',BETTER_AUTH_SECRET:'fixture-private-session-secret-32-characters'}));await (await getMigrations(auth.options)).runMigrations();
  const env={VERCEL:'1',VERCEL_ENV:'preview',LANDSCAPE_EVALUATION_USERS:'true',LANDSCAPE_EVALUATION_PASSWORD:'fixt789'},ctx={companyId:'landscape',subjectId:'root@example.invalid'},password=(await auth.$context).password;
  const user=await provisionCustomerEvaluationAccess(db,ctx,'customer',password,permissionRegistry,env);assert.ok(user.created);assert.equal((await provisionCustomerEvaluationAccess(db,ctx,'customer',password,permissionRegistry,env)).code,user.code);
  const subject=(await db.query('SELECT subject_id FROM security_login_codes WHERE code=$1',[user.code])).rows[0].subject_id,access=await resolveSecurity(db,'landscape',subject,permissionRegistry);assert.deepEqual(access.grants,['portal.read']);await assert.rejects(provisionCustomerEvaluationAccess(db,ctx,'customer',password,permissionRegistry,{...env,VERCEL_ENV:'production'}),e=>e.status===403);
  const input={customer_id:'customer',channel:'email',recipient:'marina@example.invalid',subject:'Service',body:'Garden service reminder',scheduled_at:'2030-01-07T14:00:00Z',status:'ready',reference:randomUUID()},message=await saveMessage(db,input),now=new Date('2030-01-07T14:00:00Z');assert.equal((await processDueMessages(db,null,{now})).blocked,true);
  const delivered=new Set();let calls=0;const provider={enabled:true,supportsIdempotency:true,channels:['email'],send:async m=>{delivered.add(m.idempotencyKey);if(!calls++)throw Error('response lost after acceptance');return {providerId:'ack-01'};}};
  assert.equal((await processDueMessages(db,provider,{limit:1,now})).failed,1);await assert.rejects(saveMessage(db,{...input,id:message.id,revision:1,body:'Edited queued content'}),/encolado/);assert.equal((await processDueMessages(db,provider,{limit:1,now:new Date('2030-01-07T14:06:00Z')})).accepted,1);assert.equal(delivered.size,1);assert.equal((await messageList(db))[0].status,'accepted');
  const route={origin:{latitude:40,longitude:-74},stops:[{id:'a',latitude:40.1,longitude:-74,opensAt:480,closesAt:700,durationMinutes:60},{id:'b',latitude:40.2,longitude:-74,opensAt:480,closesAt:700,durationMinutes:60}],startsAt:480,endsAt:720,breakMinutes:15};assert.equal((await planRoadItinerary(route,null)).blocked,true);const plan=await planRoadItinerary(route,{enabled:true,matrix:async()=>[[0,10,25],[10,0,5],[25,5,0]]});assert.equal(plan.stops.length,2);assert.equal(plan.totalTravelMinutes,40);assert.ok(plan.endsAt<=route.endsAt);assert.equal(plan.globallyOptimal,false);
 }finally{await db.close();}
});
