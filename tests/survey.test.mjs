import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../src/modules/operations/migrations.mjs';
import {survey,saveSurveyItem,deleteSurveyItem} from '../src/modules/operations/survey.mjs';
import {savePhoto,normalizePhoto,readPhoto} from '../src/modules/operations/photos.mjs';
import {memberForSession,canUse} from '../src/modules/identity/auth.mjs';
import sharp from 'sharp';
async function setup(){const db=new PGlite();await migrate(db);const customer=randomUUID(),property=randomUUID();await db.query('INSERT INTO customers VALUES($1,$2)',[customer,'Cliente de prueba']);await db.query('INSERT INTO properties(id,customer_id,name,address) VALUES($1,$2,$3,$4)',[property,customer,'Lugar de prueba','Dirección de prueba']);return {db,property};}
const zoneInput=(property_id,name,area)=>({property_id,name,kind:'lawn',area,unit:'sqft',measurement_status:'estimated',latitude:null,longitude:null,notes:''});
const elementInput=(property_id,zone_id)=>({property_id,zone_id,name:'Árbol frutal',kind:'fruit_tree',quantity:1,unit:'each',service:'preserve',frequency:'monthly',season:'all',protection_notes:'Preservar los frutos',latitude:40.7,longitude:-74.1,notes:''});
test('survey preserves zone units, care instructions, ownership, revisions and deletion history',async()=>{const {db,property}=await setup();try{
 const front=await saveSurveyItem(db,'zone',zoneInput(property,'Frontal',150));await saveSurveyItem(db,'zone',zoneInput(property,'Lateral',50));await saveSurveyItem(db,'zone',zoneInput(property,'Posterior',300));await saveSurveyItem(db,'zone',{...zoneInput(property,'Driveway',100),kind:'driveway'});await saveSurveyItem(db,'zone',{...zoneInput(property,'Sin medir',null),unit:'sqm'});
 const tree=await saveSurveyItem(db,'element',elementInput(property,front.id));let record=await survey(db,property);assert.equal(record.totals.sqft,600);assert.equal(record.unmeasured,1);assert.equal(record.elements[0].protection_notes,'Preservar los frutos');
 await assert.rejects(saveSurveyItem(db,'zone',{...zoneInput(property,'Incorrecta',-1)}));await assert.rejects(saveSurveyItem(db,'element',{...elementInput(property,front.id),quantity:1.5}));
 await assert.rejects(saveSurveyItem(db,'element',{...elementInput(randomUUID(),front.id)}));
 await saveSurveyItem(db,'element',{...elementInput(property,front.id),id:tree.id,revision:1,notes:'Mantener protección'});await assert.rejects(saveSurveyItem(db,'element',{...elementInput(property,front.id),id:tree.id,revision:1}),/cambió/);
 await assert.rejects(deleteSurveyItem(db,'zone',{property_id:property,id:front.id,revision:1}),/elementos/);
 await deleteSurveyItem(db,'element',{property_id:property,id:tree.id,revision:2});await deleteSurveyItem(db,'zone',{property_id:property,id:front.id,revision:1});record=await survey(db,property);assert.equal(record.elements.length,0);assert.equal(record.totals.sqft,450);assert.equal((await db.query('SELECT count(*)::int n FROM property_elements')).rows[0].n,1);
 }finally{await db.close();}});
test('photos reject invalid images, strip metadata, persist private links and obey property scope',async()=>{const {db,property}=await setup();try{
 const image=await sharp({create:{width:1800,height:1200,channels:3,background:'#405c38'}}).jpeg().withMetadata().toBuffer();const normalized=await normalizePhoto(image);assert.equal(normalized.info.width,1600);assert.equal((await sharp(normalized.data).metadata()).exif,undefined);
 await assert.rejects(normalizePhoto(Buffer.from('<svg/>')),/fotografía/);await assert.rejects(normalizePhoto(Buffer.alloc(2*1024*1024+1)),/2 MB/);
 const zone=await saveSurveyItem(db,'zone',zoneInput(property,'Frontal',150));const element=await saveSurveyItem(db,'element',elementInput(property,zone.id));
 const photo=await savePhoto(db,{property_id:property,element_id:element.id,viewpoint:'detail',caption:'Árbol a preservar'},image);const record=await survey(db,property);assert.equal(record.photos[0].zone_id,zone.id);assert.equal(record.photos[0].element_id,element.id);assert.equal('pathname' in record.photos[0],false);
 const row=(await db.query('SELECT * FROM property_photos WHERE id=$1',[photo.id])).rows[0];assert.ok((await readPhoto(db,row)).length>0);await assert.rejects(savePhoto(db,{property_id:randomUUID(),element_id:element.id,viewpoint:'detail',caption:'Inválida'},image),/Localidad/);
 }finally{await db.close();}});
test('identity requires verified invited accounts, revokes disabled users and isolates worker roles',async()=>{const {db}=await setup();try{
 const session={user:{email:'admin@example.invalid',emailVerified:true,name:'TI'}};
 assert.equal(await memberForSession(db,{user:{...session.user,emailVerified:false}},session.user.email),null);
 assert.equal((await memberForSession(db,session,session.user.email)).role,'it_admin');
 assert.equal(await memberForSession(db,{user:{email:'uninvited@example.invalid',emailVerified:true}}),null);
 await db.query("UPDATE app_members SET status='disabled' WHERE email=$1",[session.user.email]);assert.equal(await memberForSession(db,session,session.user.email),null);
 assert.equal(canUse('worker','/api/contracts'),false);assert.equal(canUse('crew_lead','/api/operations'),false);assert.equal(canUse('manager','/api/users'),false);assert.equal(canUse('finance','/api/contracts','POST'),false);assert.equal(canUse('owner','/api/users'),true);
 }finally{await db.close();}});
import {assignedWork,assignedProperty} from '../src/modules/identity/assignments.mjs';
test('crew reads only assigned pending work and receives no financial fields',async()=>{const {db,property}=await setup();try{
 const customer=(await db.query('SELECT customer_id FROM properties WHERE id=$1',[property])).rows[0].customer_id;
 const other=randomUUID(),contract=randomUUID(),otherContract=randomUUID(),crew=randomUUID(),otherCrew=randomUUID();
 await db.query("INSERT INTO properties(id,customer_id,name,address) VALUES($1,$2,'Otro lugar','Otra dirección')",[other,customer]);
 await db.query("INSERT INTO contracts(id,property_id,service,frequency,monthly_cents,visits_per_month,estimated_minutes) VALUES($1,$2,'Corte','Semanal',10000,4,60),($3,$4,'Poda','Mensual',20000,1,60)",[contract,property,otherContract,other]);
 await db.query("INSERT INTO crews VALUES($1,'Cuadrilla A',3,2000),($2,'Cuadrilla B',2,2500)",[crew,otherCrew]);
 const mine=randomUUID(),notMine=randomUUID();await db.query("INSERT INTO visits(id,contract_id,crew_id,scheduled_at,route_order) VALUES($1,$2,$3,now(),1),($4,$5,$6,now(),2)",[mine,contract,crew,notMine,otherContract,otherCrew]);
 await db.query("INSERT INTO app_members VALUES('worker@example.invalid','Persona','worker','active',1)");await db.query("INSERT INTO app_crew_members VALUES('worker@example.invalid',$1)",[crew]);
 const rows=await assignedWork(db,'worker@example.invalid');assert.equal(rows.length,1);assert.equal(rows[0].id,mine);assert.equal('monthly_cents' in rows[0],false);assert.equal('hourly_cents' in rows[0],false);
 assert.equal(await assignedProperty(db,'worker@example.invalid',property),true);assert.equal(await assignedProperty(db,'worker@example.invalid',other),false);
 await db.query("UPDATE visits SET status='cancelled' WHERE id=$1",[mine]);assert.equal((await assignedWork(db,'worker@example.invalid')).length,0);assert.equal(await assignedProperty(db,'worker@example.invalid',property),false);
 }finally{await db.close();}});
