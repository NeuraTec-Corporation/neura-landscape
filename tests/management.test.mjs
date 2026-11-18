import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/modules/operations/migrations.mjs";
import {
	saveOption,
	catalogOptions,
} from "../src/modules/operations/catalog.mjs";
import {
	saveEmployee,
	saveCrew,
	workforce,
	removeWorkforce,
} from "../src/modules/operations/workforce.mjs";
import { saveSurveyItem } from "../src/modules/operations/survey.mjs";
import {
	saveVisit,
	visitList,
	changeVisit,
	completeVisit,
	saveVisitCosts,
} from "../src/modules/operations/visits.mjs";
import {
	saveInvoice,
	changeInvoice,
	savePayment,
	reversePayment,
	financeList,
} from "../src/modules/operations/finance.mjs";
import { managementDashboard } from "../src/modules/operations/dashboard.mjs";
import { canManage } from "../src/modules/identity/auth.mjs";
import { withActor } from "../src/modules/operations/manage.mjs";
const today = () =>
	new Date().toLocaleDateString("sv-SE", { timeZone: "America/New_York" });
async function setup() {
	const db = new PGlite();
	await migrate(db);
	const customer = randomUUID(),
		property = randomUUID(),
		contract = randomUUID();
	await db.query("INSERT INTO customers VALUES($1,$2)", [
		customer,
		"Cliente QA",
	]);
	await db.query(
		"INSERT INTO properties(id,customer_id,name,address,city,region,country) VALUES($1,$2,'Localidad QA','Dirección QA','NEWARK','NJ','US')",
		[property, customer],
	);
	await db.query(
		"INSERT INTO contracts(id,property_id,service,frequency,monthly_cents,visits_per_month,estimated_minutes,service_key) VALUES($1,$2,'Poda','Mensual',40000,4,60,'pruning')",
		[contract, property],
	);
	const a = await saveEmployee(db, {
			first_name: "Persona",
			last_name: "Uno",
			email: "",
			phone: "",
			role_key: "operator",
			skills: "Poda",
			hourly: 20,
			status: "active",
		}),
		b = await saveEmployee(db, {
			first_name: "Persona",
			last_name: "Dos",
			email: "",
			phone: "",
			role_key: "leader",
			skills: "Supervisión",
			hourly: 30,
			status: "active",
		});
	const crew = await saveCrew(db, {
		name: "Equipo QA",
		shift_start: "08:00",
		shift_end: "17:00",
		break_minutes: 30,
		members: [
			{ employee_id: a.id, duty: "operator" },
			{ employee_id: b.id, duty: "leader" },
		],
	});
	return { db, customer, property, contract, a, b, crew };
}
const zone = (property_id) => ({
	property_id,
	name: "Frontal",
	kind: "lawn",
	area: 150,
	unit: "sqft",
	measurement_status: "estimated",
	latitude: null,
	longitude: null,
	notes: "",
});
test("editable catalogs, precise coordinate errors and crew/person validation", async () => {
	const { db, property, a, crew } = await setup();
	try {
		const option = await saveOption(db, {
			category: "zone_kind",
			label: "Zona ornamental",
			active: true,
		});
		await saveSurveyItem(db, "zone", { ...zone(property), kind: option.key });
		await saveOption(db, {
			category: "zone_kind",
			key: option.key,
			label: "Ornamental",
			active: false,
			revision: 1,
		});
		await assert.rejects(
			saveSurveyItem(db, "zone", { ...zone(property), kind: option.key }),
			/opción activa/,
		);
		assert.equal(
			(await catalogOptions(db)).find((o) => o.key === option.key).label,
			"Ornamental",
		);
		await assert.rejects(
			saveSurveyItem(db, "zone", {
				...zone(property),
				latitude: 40.8,
				longitude: -74080665,
			}),
			(e) => e.status === 422 && Boolean(e.fields.longitude),
		);
		await assert.rejects(
			saveCrew(db, {
				id: crew.id,
				revision: 1,
				name: "Duplicada",
				shift_start: "08:00",
				shift_end: "17:00",
				break_minutes: 30,
				members: [
					{ employee_id: a.id, duty: "operator" },
					{ employee_id: a.id, duty: "operator" },
				],
			}),
			/repetirse/,
		);
		await assert.rejects(
			removeWorkforce(db, "employee", { id: a.id, revision: 1 }),
			/cuadrillas/,
		);
		assert.equal((await workforce(db)).crews[0].members.length, 2);
		assert.equal(canManage("worker", "finance", "GET"), false);
		assert.equal(canManage("finance", "workforce", "GET"), false);
		assert.equal(canManage("finance", "finance", "POST"), true);
		assert.equal(canManage("manager", "finance", "POST"), false);
	} finally {
		await db.close();
	}
});
test("visit planning locks real personnel, snapshots rates, preserves cancellation work and reports task quantities", async () => {
	const { db, property, contract, a, b, crew } = await setup();
	try {
		const z = await saveSurveyItem(db, "zone", zone(property));
		const tree = await saveSurveyItem(db, "element", {
			property_id: property,
			zone_id: z.id,
			name: "Árbol QA",
			kind: "tree",
			quantity: 3,
			unit: "each",
			service: "pruning",
			frequency: "monthly",
			season: "all",
			protection_notes: "Preservar",
			latitude: null,
			longitude: null,
			notes: "",
		});
		const input = {
			contract_id: contract,
			crew_id: crew.id,
			scheduled_at: `${today()}T15:00:00Z`,
			title: "Podar árboles",
			planned_minutes: 60,
			travel_minutes: 10,
			route_order: "",
			tasks: [
				{
					service_key: "pruning",
					description: "Poda lateral",
					element_id: tree.id,
					employee_id: a.id,
					quantity: 3,
					unit: "each",
				},
			],
		};
		const visit = await withActor("manager@example.invalid", () =>
			saveVisit(db, input),
		);
		await assert.rejects(
			saveVisit(db, { ...input, scheduled_at: `${today()}T15:15:00Z` }),
			(e) => e.status === 409 && Boolean(e.fields.scheduled_at),
		);
		await assert.rejects(
			removeWorkforce(db, "crew", { id: crew.id, revision: 1 }),
			/visitas pendientes/,
		);
		await changeVisit(db, { action: "start", id: visit.id, revision: 1 });
		let row = (await visitList(db)).find((v) => v.id === visit.id);
		assert.equal(row.personnel.length, 2);
		await completeVisit(db, {
			id: visit.id,
			revision: 2,
			notes: "Hecho",
			personnel: [
				{ employee_id: a.id, actual_minutes: 60 },
				{ employee_id: b.id, actual_minutes: 30 },
			],
			tasks: [
				{
					id: row.tasks[0].id,
					completed_quantity: 3,
					status: "done",
					notes: "",
				},
			],
		});
		row = (await visitList(db)).find((v) => v.id === visit.id);
		assert.equal(row.labor_cents, 3500);
		assert.equal(row.revenue_cents, 10000);
		await saveVisitCosts(db, {
			id: visit.id,
			revision: 3,
			reason: "Comprobante de consumos",
			lines: [
				{
					category: "materials",
					description: "Dos bolsas",
					quantity: 2,
					unit_price: 5,
				},
			],
		});
		let dash = await managementDashboard(db, {
			from: today(),
			to: today(),
			service: "pruning",
			status: "completed",
		});
		assert.equal(dash.summary.trees_pruned, 3);
		assert.equal(dash.summary.known_cost_cents, 4500);
		assert.equal(
			dash.productivity.find((p) => p.employee_id === a.id).minutes,
			60,
		);
		await changeVisit(db, {
			id: visit.id,
			revision: 4,
			action: "delete",
			reason: "Archivar registro terminado",
		});
		dash = await managementDashboard(db, { from: today(), to: today() });
		assert.equal(dash.summary.completed, 1);
		assert.equal(dash.summary.known_cost_cents, 4500);
		const second = await saveVisit(db, {
			...input,
			scheduled_at: `${today()}T17:00:00Z`,
		});
		await changeVisit(db, { id: second.id, revision: 1, action: "start" });
		row = (await visitList(db)).find((v) => v.id === second.id);
		await changeVisit(db, {
			id: second.id,
			revision: 2,
			action: "cancel",
			reason: "Cliente suspendió el servicio",
			personnel: [
				{ employee_id: a.id, actual_minutes: 10 },
				{ employee_id: b.id, actual_minutes: 10 },
			],
			tasks: [{ id: row.tasks[0].id, completed_quantity: 1 }],
		});
		row = (await visitList(db)).find((v) => v.id === second.id);
		assert.equal(row.status, "cancelled");
		assert.equal(row.labor_cents, 833);
		assert.equal(Number(row.tasks[0].completed_quantity), 1);
		assert.ok(
			(
				await db.query(
					"SELECT actor FROM service_audit WHERE entity='visit' AND entity_id=$1",
					[visit.id],
				)
			).rows.some((r) => r.actor === "manager@example.invalid"),
		);
	} finally {
		await db.close();
	}
});
test("invoice ledger separates issued amounts, received payments, reversals and outstanding balances", async () => {
	const { db, customer, property } = await setup();
	try {
		const invoice = await saveInvoice(db, {
			customer_id: customer,
			property_id: property,
			issue_date: today(),
			due_date: today(),
			notes: "",
			lines: [{ description: "Servicio", quantity: 2, unit_price: 100 }],
		});
		const data = await financeList(db);
		assert.equal(data.invoices[0].total_cents, 20000);
		await changeInvoice(db, { id: invoice.id, revision: 1, action: "issue" });
		const attempts = await Promise.allSettled([
			savePayment(db, {
				invoice_id: invoice.id,
				revision: 2,
				received_date: today(),
				amount: 80,
				method: "bank",
				reference: "A",
			}),
			savePayment(db, {
				invoice_id: invoice.id,
				revision: 2,
				received_date: today(),
				amount: 80,
				method: "bank",
				reference: "A duplicada",
			}),
		]);
		assert.equal(attempts.filter((a) => a.status === "fulfilled").length, 1);
		let dashboard = await managementDashboard(db, {
			from: today(),
			to: today(),
		});
		assert.equal(dashboard.summary.billed_cents, 20000);
		assert.equal(dashboard.summary.collected_cents, 8000);
		assert.equal(dashboard.summary.receivable_cents, 12000);
		await assert.rejects(
			changeInvoice(db, {
				id: invoice.id,
				revision: 3,
				action: "void",
				reason: "Documento equivocado",
			}),
			/pagos/,
		);
		const payment = attempts.find((a) => a.status === "fulfilled").value;
		await reversePayment(db, {
			id: payment.id,
			reason: "Ingreso duplicado erróneo",
		});
		await changeInvoice(db, {
			id: invoice.id,
			revision: 4,
			action: "void",
			reason: "Documento equivocado",
		});
		dashboard = await managementDashboard(db, { from: today(), to: today() });
		assert.equal(dashboard.summary.billed_cents, 0);
		assert.equal(dashboard.summary.collected_cents, 0);
		assert.equal(dashboard.summary.receivable_cents, 0);
	} finally {
		await db.close();
	}
});


test("unknown labor remains pending, shared people cannot overlap and planning revisions retain detail", async () => {
 const {db,contract,a,b,crew}=await setup();
 try {
  const input={contract_id:contract,crew_id:crew.id,title:"Corte QA",scheduled_at:"2026-11-02T15:00:00Z",planned_minutes:60,travel_minutes:0,tasks:[{service_key:"mowing",description:"Corte frontal",quantity:150,unit:"sqft",employee_id:a.id}]};
  await db.query("UPDATE employees SET hourly_cents=NULL WHERE id=$1",[a.id]);
  const visit=await saveVisit(db,input);
  assert.equal((await visitList(db))[0].planned_labor_hourly_cents,null);
  const other=await saveCrew(db,{name:"Otro equipo QA",shift_start:"08:00",shift_end:"17:00",break_minutes:30,members:[{employee_id:a.id,duty:"operator"}]});
  await assert.rejects(saveVisit(db,{...input,crew_id:other.id}),e=>e.status===409);
  await saveVisit(db,{...input,id:visit.id,revision:1,scheduled_at:"2026-11-02T16:00:00Z"});
  const history=(await db.query("SELECT details FROM change_history WHERE entity_id=$1 AND event='rescheduled'",[visit.id])).rows[0].details;
  assert.equal(Number(history.before.tasks[0].quantity),150);
  assert.equal(history.before.personnel.length,2);
  await db.query("UPDATE employees SET hourly_cents=9900 WHERE id=$1",[a.id]);
  assert.equal((await visitList(db))[0].personnel.find(p=>p.employee_id===a.id).hourly_cents,null);
  await changeVisit(db,{id:visit.id,revision:2,action:"start"});
  const record=(await visitList(db))[0];
  await completeVisit(db,{id:visit.id,revision:3,personnel:[{employee_id:a.id,actual_minutes:60},{employee_id:b.id,actual_minutes:60}],tasks:record.tasks.map(t=>({id:t.id,status:"done",completed_quantity:150,notes:""})),notes:"Trabajo QA"});
  const completed=(await visitList(db))[0];
  assert.equal(completed.labor_cents,null);
  assert.equal(completed.cost_complete,false);
  await assert.rejects(saveOption(db,{category:"service",label:"Inválida",active:true,semantic_key:"invented"}),/clasificación/);
 } finally {await db.close();}
});
