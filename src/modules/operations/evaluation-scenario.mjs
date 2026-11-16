import { randomUUID, createHash } from "node:crypto";
import { ManageError, audit } from "./manage.mjs";
import { lockOperationalPlan } from "./planning-lock.mjs";
import { retentionWindow, geography, scenarioProfiles } from "./evaluation-policy.mjs";
import { prepareResourceCatalog, saveResource, saveResourceRates, saveResourcePlan, saveResourceUsage } from "./resources.mjs";
import { moveStock, saveAsset, postVisitStock } from "./inventory.mjs";
import { saveWarehouse, transferStock } from "./warehouses.mjs";
import { saveMaintenance, saveAssetReservations } from "./asset-reservations.mjs";
import { saveQualification, saveAccessPolicy } from "./qualifications.mjs";
import { saveAvailability } from "./availability.mjs";
import { saveSurveyItem } from "./survey.mjs";
import { saveContract } from "./contracts.mjs";
import { saveVisit, changeVisit, completeVisit, saveVisitCosts } from "./visits.mjs";
import { saveInvoice, changeInvoice, savePayment, reversePayment } from "./finance.mjs";
import { saveEstimate, issueOffer, closeOffer, acceptOffer } from "../estimates/index.ts";

export const EVALUATION_BATCH = "ops07-diverse-scenario-v1";
const reason = "Escenario ficticio OPS07; sin servicio, compra, envío ni cobro real.";
const dateAt = (date, offset) => new Date(Date.parse(`${date}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
function instant(date, minute) {
	const parts = new Intl.DateTimeFormat("en", { timeZone: "America/New_York", timeZoneName: "longOffset" }).formatToParts(new Date(`${date}T12:00Z`));
	const m = parts.find(p => p.type === "timeZoneName").value.match(/GMT([+-])(\d\d):(\d\d)/);
	const offset = m ? (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + +m[3]) : 0;
	return new Date(Date.parse(`${date}T00:00Z`) + (minute - offset) * 60000).toISOString();
}

// Export business data only. Authentication credentials/sessions stay outside
// this company checkpoint. Keys derive from the database, never request input.
export async function evaluationCheckpoint(db) {
	const tables = (await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name")).rows
		.map(r => r.table_name).filter(t => !/^(security_|app_|schema_migrations$|user$|account$|session$|verification$|rateLimit$|media_budget$)/.test(t));
	const data = {};
	for (const table of tables) {
		if (!/^[a-z_]+$/.test(table)) throw new ManageError("Nombre de tabla no permitido.");
		data[table] = (await db.query(`SELECT to_jsonb(t)::text row FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows.map(r => JSON.parse(r.row));
	}
	const serialized = JSON.stringify(data);
	if (Buffer.byteLength(serialized) > 24 * 1024 * 1024) throw new ManageError("El respaldo requiere una exportación de mayor capacidad.", 413);
	return { format: "landscape-company-json-v1", digest: createHash("sha256").update(serialized).digest("hex"), data };
}

export async function evaluationCoverage(db) {
	const counts = {};
	for (const table of ["customers", "properties", "contracts", "employees", "crews", "visits", "visit_tasks", "invoices", "payments", "operating_resources", "equipment_assets", "stock_movements", "employee_qualifications", "maintenance_orders", "employee_absences"]) {
		counts[table] = Number((await db.query(`SELECT count(*) n FROM ${table}`)).rows[0].n);
	}
	const groups = async sql => (await db.query(sql)).rows;
	return {
		counts,
		cities: await groups("SELECT city,count(*)::int properties,count(latitude)::int positioned FROM properties WHERE deleted_at IS NULL GROUP BY city ORDER BY city"),
		visit_states: await groups("SELECT status,count(*)::int n FROM visits WHERE deleted_at IS NULL GROUP BY status ORDER BY status"),
		contract_states: await groups("SELECT status,frequency,count(*)::int n FROM contracts WHERE deleted_at IS NULL GROUP BY status,frequency ORDER BY status,frequency"),
		services: await groups("SELECT service_key,unit,sum(completed_quantity)::float8 completed,count(*)::int tasks FROM visit_tasks GROUP BY service_key,unit ORDER BY service_key,unit"),
		finance: (await db.query("WITH p AS(SELECT invoice_id,sum(amount_cents)::bigint paid FROM payments WHERE voided_at IS NULL GROUP BY invoice_id) SELECT count(*) FILTER(WHERE i.status='draft')::int drafts,count(*) FILTER(WHERE i.status='void')::int voids,count(*) FILTER(WHERE i.status='issued' AND coalesce(p.paid,0)=i.total_cents)::int paid,count(*) FILTER(WHERE i.status='issued' AND coalesce(p.paid,0)>0 AND p.paid<i.total_cents)::int partial,count(*) FILTER(WHERE i.status='issued' AND coalesce(p.paid,0)<i.total_cents AND i.due_date<(now() AT TIME ZONE 'America/New_York')::date)::int overdue,coalesce(sum(i.total_cents) FILTER(WHERE i.status='issued'),0)::text billed_cents,coalesce(sum(p.paid) FILTER(WHERE i.status='issued'),0)::text collected_cents FROM invoices i LEFT JOIN p ON p.invoice_id=i.id WHERE i.deleted_at IS NULL")).rows[0],
		retention: retentionWindow(Number(new Date().toLocaleDateString('sv-SE',{timeZone:'America/New_York'}).slice(0,4))),
		offer_states: await groups("SELECT status,count(*)::int n FROM estimate_offers GROUP BY status ORDER BY status"),
		financial_years: await groups("SELECT extract(year FROM issue_date)::int AS calendar_year,count(*)::int invoices,sum(total_cents)::text cents FROM invoices WHERE deleted_at IS NULL GROUP BY calendar_year ORDER BY calendar_year"),
		coherence: (await db.query("SELECT (SELECT count(*) FROM invoices i WHERE i.property_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM properties p WHERE p.id=i.property_id AND p.customer_id=i.customer_id))::int invoice_customer_mismatches,(SELECT count(*) FROM visit_tasks WHERE completed_quantity>quantity)::int overreported_tasks,(SELECT count(*) FROM visits WHERE completed_at<started_at)::int negative_durations,(SELECT count(*) FROM invoices i WHERE coalesce((SELECT sum(amount_cents) FROM payments p WHERE p.invoice_id=i.id AND p.voided_at IS NULL),0)>i.total_cents)::int overpaid_invoices")).rows[0],
		batch: (await db.query("SELECT manifest FROM sample_data_batches WHERE id=$1", [EVALUATION_BATCH])).rows[0]?.manifest || null,
	};
}

export async function enrichEvaluation(db, { confirmed, environment, profile, expectedDigest, actor = 'ops07-evaluation', now = new Date() }) {
	if (environment !== "preview" || !confirmed) throw new ManageError("Solo evaluación Preview con confirmación explícita.", 403);
	const config = scenarioProfiles[profile];
	if (!config) throw new ManageError("Empresa de evaluación no reconocida.", 422);
	return db.transaction(async tx => {
		await lockOperationalPlan(tx);
		if ((await tx.query("SELECT id FROM sample_data_batches WHERE id=$1", [EVALUATION_BATCH])).rows.length) return { replayed: true, coverage: await evaluationCoverage(tx) };
		const before = await evaluationCheckpoint(tx);
		if (!expectedDigest || before.digest !== expectedDigest) throw new ManageError("Los datos cambiaron desde el respaldo. Exporta de nuevo antes de continuar.", 409);
		const day = new Date(now).toLocaleDateString("sv-SE", { timeZone: "America/New_York" });
		const manifest = { version: 1, synthetic: true, profile, label: config.label, anchor_day: day, previous_digest: before.digest, retention: retentionWindow(+day.slice(0, 4)), created: {}, public_reference_points: true, external_messages_sent: 0 };
		await tx.query("INSERT INTO sample_data_batches(id,created_by,manifest) VALUES($1,$2,$3::jsonb)", [EVALUATION_BATCH, actor, JSON.stringify(manifest)]);
		const scoped = { query: (s,p) => tx.query(s,p), transaction: fn => fn(tx) };
		const mark = async (entity, id) => {
			manifest.created[entity] ||= [];
			manifest.created[entity].push(id);
			if (["visit", "invoice", "payment", "zone", "element", "contract"].includes(entity)) await tx.query("INSERT INTO sample_scenario_records VALUES($1,$2,$3)", [EVALUATION_BATCH, entity, id]);
			return id;
		};
		const sites = (await tx.query("SELECT p.* FROM properties p JOIN sample_data_records s ON s.entity='property' AND s.entity_id=p.id WHERE p.deleted_at IS NULL ORDER BY p.code,p.id")).rows;
		if (sites.length < 10) throw new ManageError("Falta el portafolio sintético inicial; no se modifica la cartera manual.");
		for (const [i,p] of sites.entries()) {
			const g = geography[(i + config.offset) % geography.length];
			await tx.query("UPDATE properties SET line1=$2,address=$2,line2=$3,city=$4,region='NJ',country='US',postal_code=$5,latitude=$6,longitude=$7,service_hours='06:00–18:00',access_instructions=$8,notes=$9,revision=revision+1,updated_at=now() WHERE id=$1", [p.id,g[0],`Referencia pública · sector ${i+1}`,g[1],g[2],g[3],g[4],i%3===0?"Confirmar acceso con encargado; mantener el portón cerrado.":i%3===1?"Acceso lateral; proteger mascotas y plantas.":"Estacionar sin bloquear accesos; retirar residuos al finalizar.",`${reason} Ubicación de referencia pública, no domicilio del cliente ni levantamiento del predio real. Coordenada interpolada US Census, no medición GPS.`]);
			const lawn = Math.round((350 + i%8*175) * config.scale), rear = Math.round(lawn * .65), paved = Math.round((180+i%6*70)*config.scale);
			await tx.query("UPDATE properties SET lawn_sqft=$2,garden_sqft=$3,paved_sqft=$4 WHERE id=$1", [p.id,lawn+rear,80+i%5*40,paved]);
			const zones = (await tx.query("SELECT * FROM property_zones WHERE property_id=$1 AND deleted_at IS NULL ORDER BY name,id", [p.id])).rows;
			for (const [n,z] of zones.entries()) await saveSurveyItem(scoped,"zone",{...z,area:z.kind==='driveway'?paved:z.kind==='lawn'?lawn:80+i%5*40,unit:"sqft",measurement_status:"estimated",latitude:null,longitude:null,notes:`${reason} Superficie supuesta, zona independiente ${n+1}; no medida del sitio público.`});
			for (const [name,kind,area] of [["Césped posterior","lawn",rear],["Paso lateral","walkway",75+i%5*25]]) {
				const id = await mark("zone",(await saveSurveyItem(scoped,"zone",{property_id:p.id,name,kind,area,unit:"sqft",measurement_status:"estimated",latitude:null,longitude:null,notes:reason})).id);
				if (kind==='lawn') await mark("element",(await saveSurveyItem(scoped,"element",{property_id:p.id,zone_id:id,name:i%2?"Seto de privacidad":"Sistema de riego",kind:i%2?"hedge":"irrigation",quantity:i%2?20+i%6*5:1,unit:i%2?"ft":"each",service:i%2?"pruning":"inspection",frequency:"monthly",season:i%2?"all":"autumn",protection_notes:i%2?"No reducir altura sin autorización.":"Cerrar válvula antes de heladas; preservar tuberías.",latitude:null,longitude:null,notes:reason})).id);
			}
		}
		const customers = (await tx.query("SELECT c.customer_id FROM customer_profiles c JOIN sample_data_records s ON s.entity='customer' AND s.entity_id=c.customer_id ORDER BY c.customer_id")).rows;
		for (const [i,c] of customers.entries()) {
			const g = geography[(i*3+config.offset)%geography.length];
			await tx.query("UPDATE customer_addresses SET line1=$2,line2='Referencia geográfica pública; cuenta ficticia',city=$3,region='NJ',postal_code=$4,country='US',latitude=$5,longitude=$6 WHERE customer_id=$1",[c.customer_id,g[0],g[1],g[2],g[3],g[4]]);
			await tx.query("UPDATE customer_contacts SET phone_mobile=$2,preferred_channel=$3,contact_from=$4,contact_to=$5,consent_sms=false,consent_whatsapp=false,consent_email=false WHERE customer_id=$1",[c.customer_id,`+120155501${String(i%100).padStart(2,'0')}`,["email","phone","sms","whatsapp"][i%4],i%2?"09:00":"15:00",i%2?"12:00":"18:00"]);
			if(i%3===0) await tx.query("INSERT INTO customer_contacts(id,customer_id,first_name,last_name,relationship,roles,email,preferred_channel,preferred_phone,contact_from,contact_to) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,'email','mobile','09:00','17:00')",[randomUUID(),c.customer_id,["Mariela","Samuel","Teresa","Joaquín"][i%4],["Márquez","Villalobos","Pineda","Santana"][i%4],i%2?'representative':'spouse',JSON.stringify(["notifications"]),`contacto.${profile}.${i}@example.invalid`]);
		}
		const contracts = (await tx.query("SELECT c.* FROM contracts c JOIN properties p ON p.id=c.property_id JOIN sample_scenario_records s ON s.entity='contract' AND s.entity_id=c.id WHERE c.deleted_at IS NULL AND c.source_offer_id IS NULL ORDER BY p.code,c.id")).rows;
		for(const [i,c] of contracts.entries()) {
			await saveContract(scoped,{...c,monthly:Math.round((profile==='rojas'?320:780)+(i%8)*(profile==='rojas'?45:120)),frequency:["Semanal","Cada 14 días","Mensual","Dos veces por semana"][i%4],visits_per_month:[4,2,1,8][i%4],estimated_minutes:Math.round((35+i%5*10)*Math.sqrt(config.scale)),status:c.status});
		}
		const estimates=(await tx.query("SELECT e.*,r.snapshot FROM estimate_drafts e JOIN estimate_revisions r ON r.estimate_id=e.id AND r.revision=e.revision JOIN sample_scenario_records s ON s.entity='estimate' AND s.entity_id=e.id WHERE e.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM estimate_offers o WHERE o.estimate_id=e.id AND (o.status='issued' OR (o.status='accepted' AND o.contract_id IS NULL))) ORDER BY e.id")).rows;
		for(const [i,e] of estimates.entries()){
			// Refresh current dimensions, retaining older immutable revisions.
			const zones=(await tx.query("SELECT id,revision FROM property_zones WHERE property_id=$1 AND kind='lawn' AND deleted_at IS NULL ORDER BY id",[e.property_id])).rows;
			const input=e.snapshot.input;
			const rate=(await tx.query("SELECT revision FROM production_rates WHERE id=$1",[input.rate_id])).rows[0];
			await saveEstimate(scoped,{...input,id:e.id,revision:e.revision,title:i%2?'Corte de césped y terminación de bordes':'Mantenimiento de césped frontal y posterior',zone_ids:zones.map(z=>z.id),zone_revisions:Object.fromEntries(zones.map(z=>[z.id,z.revision])),rate_revision:rate?.revision||null,labor_hourly:profile==='rojas'?27:34,margin_percent:25+i%4*5,reason,notes:reason},actor);
		}
		// Add commercial lifecycle cases without sending anything or binding
		// duplicate contracts. Previously issued/accepted terms remain immutable.
		const drafts=(await tx.query("SELECT e.* FROM estimate_drafts e JOIN sample_scenario_records s ON s.entity='estimate' AND s.entity_id=e.id WHERE e.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM estimate_offers o WHERE o.estimate_id=e.id) ORDER BY e.id LIMIT 4")).rows;
		for(const [i,e] of drafts.entries()){
			const offer=await issueOffer(scoped,{id:e.id,revision:e.revision,terms:{valid_until:dateAt(day,30),start_date:dateAt(day,7),end_date:'',frequency:'Semanal',visits_per_month:4,estimated_minutes:45,billing_timing:i%2?'advance':'arrears',due_days:i%2?15:30,scope:'Corte de césped de zonas presupuestadas',exclusions:'No incluye poda, árboles ni retiro de nieve.',payment_terms:'Documento ficticio de evaluación; sin envío ni cobro.',reviewed:true}},actor);
			await mark('offer',offer.id);
			if(i===1||i===2)await closeOffer(scoped,{offer_id:offer.id,revision:1,action:i===1?'decline':'withdraw',reason:i===1?'El cliente decidió posponer el servicio.':'Revisar alcance y presentar una nueva propuesta.'},actor);
			if(i===3)await acceptOffer(scoped,{offer_id:offer.id,revision:1,accepted_by:'Representante de la cuenta',authority:'Responsable autorizado en escenario ficticio',accepted_at:new Date().toISOString(),evidence_method:'written_confirmation',evidence_reference:'OPS07 · aceptación simulada, no firma ni consentimiento real',confirmed:true},actor);
		}
		await prepareResourceCatalog(scoped);
		for (const [name,category,unit_key] of [["Bolsas de residuos vegetales","materials","each"],["Herramientas de poda manual","equipment","hour"],["Herramientas de plantación","equipment","hour"]]) {
			if(!(await tx.query("SELECT id FROM operating_resources WHERE name=$1 AND deleted_at IS NULL",[name])).rows.length)await mark('resource',(await saveResource(scoped,{name,category,unit_key,unit_cost:null,status:'active'})).id);
		}
		const resources=(await tx.query("SELECT * FROM operating_resources WHERE deleted_at IS NULL AND status='active' ORDER BY category,name")).rows;
		// Catalog prices may be edited by managers; only unconfirmed/evaluation rates are populated.
		for (const [i,r] of resources.entries()) if(r.rate_basis!=='operator'||r.unit_cost_cents===null){await saveResourceRates(scoped,{reason,lines:[{id:r.id,revision:r.revision,unit_cost:r.category==='equipment'?18+i*3:8+i*4}]});await tx.query("UPDATE operating_resources SET rate_basis='evaluation' WHERE id=$1",[r.id]);}
		const depot=await mark("warehouse",(await saveWarehouse(scoped,{code:profile==='rojas'?'RUTA-SUR':'BASE-COMERCIAL',name:profile==='rojas'?'Depósito de ruta sur':'Base de operaciones comerciales',status:'active',enforce_stock:true,reason})).id);
		const materials=resources.filter(r=>r.category==='materials'), equipment=resources.filter(r=>r.category==='equipment');
		for(const [i,r] of materials.entries()) {
			await moveStock(scoped,{resource_id:r.id,kind:'adjustment',quantity:config.stock+i*12,reason,reference:randomUUID()});
			await transferStock(scoped,{resource_id:r.id,from:'main',to:depot,quantity:20+i*3,reason,reference:randomUUID()});
		}
		const crews=(await tx.query("SELECT c.* FROM crews c WHERE c.deleted_at IS NULL AND NOT c.reference_only AND (SELECT count(*) FROM crew_employees m JOIN employees e ON e.id=m.employee_id WHERE m.crew_id=c.id AND e.status='active' AND e.deleted_at IS NULL)>=2 ORDER BY c.name,c.id")).rows;
		if(!crews.length)throw new ManageError("No hay cuadrillas completas disponibles.");
		const assets=[];
		for(const [i,r] of equipment.entries()) {
			assets.push({resource_id:r.id,id:await mark("asset",(await saveAsset(scoped,{resource_id:r.id,code:`${profile==='rojas'?'ROJ':'EVE'}-ACT-${String(i+1).padStart(3,'0')}`,name:`${r.name} · ${profile==='rojas'?'Ruta residencial':'Unidad comercial'} ${i+1}`,serial_number:`NX-${profile.toUpperCase()}-${2026+i}-001`,crew_id:null,status:'available',maintenance_due:dateAt(day,120),notes:reason})).id)});
		}
		const spare=await mark("asset",(await saveAsset(scoped,{resource_id:equipment[0].id,code:`${profile.toUpperCase()}-RES-001`,name:'Unidad de reserva en taller',serial_number:`NX-${profile}-RES`,crew_id:null,status:'maintenance',maintenance_due:dateAt(day,-3),notes:reason})).id);
		await mark("maintenance",(await saveMaintenance(scoped,{asset_id:spare,description:'Reemplazar filtro y revisar transmisión',due_on:dateAt(day,-3),status:'open',completed_on:'',cost:'',notes:reason})).id);
		await mark("maintenance",(await saveMaintenance(scoped,{asset_id:assets[0].id,description:'Cambio de aceite y revisión de seguridad',due_on:dateAt(day,-10),status:'completed',completed_on:dateAt(day,-9),cost:profile==='rojas'?95:165,next_due:dateAt(day,90),notes:reason})).id);
		const active=(await tx.query("SELECT c.* FROM contracts c JOIN sample_scenario_records s ON s.entity='contract' AND s.entity_id=c.id JOIN properties p ON p.id=c.property_id WHERE c.status='active' AND c.deleted_at IS NULL AND p.deleted_at IS NULL ORDER BY p.code,c.id")).rows;
		const revision=async id=>(await tx.query("SELECT revision FROM visits WHERE id=$1",[id])).rows[0].revision;
		for(let i=0;i<config.visits;i++) {
			const contract=active[i%active.length],crew=crews[i%crews.length],date=i===config.visits-1?`${day.slice(0,4)}-12-20`:dateAt(day,i-8),minutes=35+i%4*10;
			const members=(await tx.query("SELECT e.* FROM crew_employees m JOIN employees e ON e.id=m.employee_id WHERE m.crew_id=$1 AND e.deleted_at IS NULL AND e.status='active' ORDER BY e.id",[crew.id])).rows;
			const slot=instant(date,390);
			const service=i===config.visits-1?'snow':config.services[i%config.services.length];
			const id=await mark("visit",(await saveVisit(scoped,{contract_id:contract.id,crew_id:crew.id,scheduled_at:slot,title:`${{mowing:'Corte y bordes',pruning:'Poda de formación',planting:'Renovación de jardineras',inspection:'Inspección de riego',preserve:'Conservación de frutales',maintenance:'Limpieza y mantenimiento',snow:'Plan de respuesta invernal'}[service]}`,planned_minutes:minutes,travel_minutes:15+i%3*5,tasks:[{service_key:service,description:{mowing:'Cortar césped y perfilar bordes',pruning:'Podar ornamentales y retirar ramas',planting:'Renovar plantas y aplicar mantillo',inspection:'Revisar riego y registrar fugas',preserve:'Inspeccionar frutal sin retirar frutos',maintenance:'Recolectar hojas y despejar pasos',snow:'Retirar nieve del driveway y aplicar sal; sujeto a evento meteorológico'}[service],employee_id:members[0].id,quantity:['mowing','snow'].includes(service)?Math.round(550*config.scale):service==='pruning'?3+i%4:1,unit:['mowing','snow'].includes(service)?'sqft':'each'},{service_key:'inspection',description:'Verificar accesos y seguridad al finalizar',employee_id:members[1].id,quantity:1,unit:'each'}]})).id);
			const material=materials.find(r=>service==='planting'?r.name.includes('mulch'):service==='snow'?r.name.includes('Sal'):r.name.includes('residuos'));
			const equipmentName={mowing:'Cortadora',pruning:'poda manual',planting:'plantación',maintenance:'Sopladora',snow:'Quitanieves'}[service];
			const selectedResource=equipmentName?equipment.find(r=>r.name.includes(equipmentName)):null;
			const asset=assets.find(a=>a.resource_id===selectedResource?.id);
			// Use no consumable when inspecting/preserving: do not invent mulch/salt usage for those services.
			const consumes=['planting','maintenance','snow'].includes(service);
			await saveResourcePlan(scoped,{id,revision:await revision(id),lines:[...(consumes?[{resource_id:material.id,warehouse_id:depot,planned_quantity:2+i%3}]:[]),...(['inspection','preserve'].includes(service)?[]:[{resource_id:asset.resource_id,planned_quantity:.75}])]});
			if(!['inspection','preserve'].includes(service))await saveAssetReservations(scoped,{id,revision:await revision(id),asset_ids:[asset.id],reason});
			if(i===6||i===7){await changeVisit(scoped,{id,revision:await revision(id),action:'cancel',reason:i===6?'Cliente solicita reprogramar por evento familiar.':'Lluvia intensa: aplazar para evitar daño del terreno.'});continue;}
			if(i<=5||i===8) {
				await changeVisit(scoped,{id,revision:await revision(id),action:'start'});
				if(i===8)continue;
				const tasks=(await tx.query("SELECT * FROM visit_tasks WHERE visit_id=$1 ORDER BY id",[id])).rows;
				await completeVisit(scoped,{id,revision:await revision(id),notes:i===4?'Acceso lateral bloqueado; pendiente revisión con el encargado.':'Trabajo terminado; accesos despejados y control de calidad registrado.',personnel:members.map((m,n)=>({employee_id:m.id,actual_minutes:minutes+(i===3?40:i===1?-8:5)-n*2})),tasks:tasks.map((t,n)=>({id:t.id,completed_quantity:i===4&&n===1?0:Number(t.quantity),status:i===4&&n===1?'blocked':'done',notes:i===4&&n===1?'Acceso cerrado; requiere reprogramación.':''}))});
				const lines=(await tx.query("SELECT * FROM visit_resources WHERE visit_id=$1",[id])).rows;
				await saveResourceUsage(scoped,{id,revision:await revision(id),reason,lines:lines.map(l=>({id:l.id,actual_quantity:Number(l.planned_quantity)*(i===3?2:1),notes:reason}))});
				await postVisitStock(scoped,{id,reason});
				await saveVisitCosts(scoped,{id,revision:await revision(id),reason,lines:[{category:'travel',description:'Combustible y recorrido asignado',quantity:1,unit_price:12+i*2},{category:'overhead',description:'Indirectos asignados a la visita',quantity:1,unit_price:i===3?150:8}]});
				await tx.query("UPDATE visits SET started_at=$2,completed_at=$3 WHERE id=$1",[id,slot,new Date(Date.parse(slot)+(minutes+(i===3?40:5))*60000).toISOString()]);
			}
		}
		for(let i=0;i<12;i++) {
			const p=sites[(i*3+config.offset)%sites.length],issue=dateAt(day,-(i%8)),amount=Math.round((180+i*57)*config.scale);
			const id=await mark('invoice',(await saveInvoice(scoped,{customer_id:p.customer_id,property_id:p.id,issue_date:issue,due_date:dateAt(issue,i%2?2:30),notes:reason,lines:[{description:i%2?'Servicio adicional de poda y retiro':'Mantenimiento de zonas exteriores',quantity:1,unit_price:amount}]})).id);
			if(i===0)continue;
			await changeInvoice(scoped,{id,revision:1,action:'issue'});
			if(i===1){await changeInvoice(scoped,{id,revision:2,action:'void',reason:'Reemplazada por alcance corregido; sin prestación.'});continue;}
			if(i%4!==3){const payment=await mark('payment',(await savePayment(scoped,{invoice_id:id,revision:2,received_date:day,amount:i%4===0?amount:Math.round(amount*50)/100,method:i%2?'check':'bank',reference:reason})).id);if(i===2)await reversePayment(scoped,{id:payment,reason:'Cheque rechazado; saldo nuevamente pendiente.'});}
		}
		// Seven active calendar years plus an older paid/open pair demonstrate
		// archival candidates and the unresolved-balance hold without deleting data.
		for(let i=0;i<9;i++){
			const year=Number(day.slice(0,4))+(i<2?-7:i-8),p=sites[(i+config.offset)%sites.length],amount=Math.round((240+i*35)*config.scale),issue=`${year}-01-15`;
			const id=await mark('invoice',(await saveInvoice(scoped,{customer_id:p.customer_id,property_id:p.id,issue_date:issue,due_date:`${year}-02-15`,notes:`${reason} Historia anual para retención y cartera.`,lines:[{description:'Servicio exterior estacional',quantity:1,unit_price:amount}]})).id);
			await changeInvoice(scoped,{id,revision:1,action:'issue'});
			if(i!==1)await mark('payment',(await savePayment(scoped,{invoice_id:id,revision:2,received_date:`${year}-02-01`,amount,method:'bank',reference:reason})).id);
		}
		const staff=(await tx.query("SELECT e.* FROM employees e JOIN sample_scenario_records s ON s.entity='employee' AND s.entity_id=e.id WHERE e.deleted_at IS NULL AND e.status='active' ORDER BY e.code")).rows;
		for(const [i,e] of staff.entries()) {
			await tx.query("UPDATE employees SET skills=$2,revision=revision+1 WHERE id=$1",[e.id,["Césped y bordes; conducción de cortadora","Poda ornamental; conservación de frutales","Riego y detección de fugas","Siembra y preparación de suelos"][i%4]]);
			await mark('qualification',(await saveQualification(scoped,{employee_id:e.id,service_key:'pruning',valid_from:dateAt(day,-180),valid_until:dateAt(day,i%4===0?-1:180),certificate_ref:`FORM-${profile.toUpperCase()}-${String(i+1).padStart(3,'0')}`,reason})).id);
		}
		await saveAvailability(scoped,{action:'calendar',weekdays:profile==='rojas'?[1,2,3,4,5,6]:[1,2,3,4,5],revision:0,reason});
		if(staff.length)await mark('absence',(await saveAvailability(scoped,{action:'absence',employee_id:staff[0].id,starts_on:dateAt(day,2),ends_on:dateAt(day,4),reason:'Ausencia programada; revisar cobertura de la ruta.'})).id);
		for(const [i,p] of sites.slice(0,4).entries())await saveAccessPolicy(scoped,{property_id:p.id,revision:0,windows:[1,2,3,4,5].map(weekday=>({weekday,opens_at:i%2?'08:00':'06:00',closes_at:i%2?'12:00':'18:00'})),reason});
		// Access/calendar changes intentionally flag affected assignments; never silently clear alerts.
		await tx.query("UPDATE sample_data_batches SET manifest=$2::jsonb WHERE id=$1",[EVALUATION_BATCH,JSON.stringify(manifest)]);
		await audit(tx,'sample_data',EVALUATION_BATCH,'enriched',{profile,before_digest:before.digest,retention:manifest.retention,created:Object.fromEntries(Object.entries(manifest.created).map(([k,v])=>[k,v.length]))});
		const coverage=await evaluationCoverage(tx);
		if(Object.values(coverage.coherence).some(n=>Number(n)!==0))throw new ManageError("La coherencia de los datos no permite confirmar el escenario.",409);
		return {replayed:false,coverage};
	});
}
