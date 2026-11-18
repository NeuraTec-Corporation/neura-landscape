import {saveVisit,changeVisit} from "../src/modules/operations/visits.mjs";
import { saveContract } from "../src/modules/operations/contracts.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/modules/operations/migrations.mjs";
import { saveSurveyItem } from "../src/modules/operations/survey.mjs";
import {
	issueOffer,
	acceptOffer,
	closeOffer,
	bindOffer,
	saveRate,
	saveEstimate,
	archiveEstimate,
	estimateWorkspace,
} from "../src/modules/estimates/index.ts";
async function setup() {
	const db = new PGlite();
	await migrate(db);
	const customer = randomUUID(),
		property = randomUUID();
	await db.query("INSERT INTO customers VALUES($1,'Cliente QA')", [customer]);
	await db.query(
		"INSERT INTO properties(id,customer_id,name,address) VALUES($1,$2,'Jardín QA','Dirección QA')",
		[property, customer],
	);
	const z = await saveSurveyItem(db, "zone", {
		property_id: property,
		name: "Frontal",
		kind: "lawn",
		area: 5000,
		unit: "sqft",
		measurement_status: "estimated",
		latitude: null,
		longitude: null,
		notes: "",
	});
	const rateInput = {
		name: "Rendimiento QA",
		unit: "sqft",
		quantity_per_person_hour: 1000,
		setup_person_minutes: 0,
		source: "Referencia sintética QA",
		confidence: "estimated",
		active: true,
	};
	const rate = await saveRate(db, rateInput, "qa");
	const input = {
		property_id: property,
		title: "Corte QA",
		rate_id: rate.id,
		rate_revision: 1,
		zone_ids: [z.id],
		zone_revisions: { [z.id]: 1 },
		areas_independent: true,
		resources_reviewed: true,
		labor_hourly: 20,
		overhead_percent: 0,
		margin_percent: 20,
		lines: [],
		reason: "Referencia inicial QA",
		notes: "",
	};
	return { db, property, zone: z, rate, rateInput, input };
}

const today = () =>
	new Date().toLocaleDateString("sv-SE", { timeZone: "America/New_York" });
const future = () =>
	new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10);
const terms = () => ({
	valid_until: future(),
	start_date: today(),
	end_date: "",
	frequency: "Semanal",
	visits_per_month: 4,
	estimated_minutes: 60,
	billing_timing: "advance",
	due_days: 15,
	scope: "Corte de césped y limpieza",
	exclusions: "Sin poda de árboles",
	payment_terms: "Pago mensual, USD",
	reviewed: true,
});
const acceptance = (o) => ({
	offer_id: o.id,
	revision: o.revision,
	accepted_by: "Representante QA",
	authority: "Titular autorizado QA",
	accepted_at: new Date().toISOString(),
	evidence_method: "written_confirmation",
	evidence_reference: "Registro sintético de prueba, no documento real",
	confirmed: true,
});
const offerRow = async (db, id) =>
	(await db.query("SELECT * FROM estimate_offers WHERE id=$1", [id])).rows[0];
const contractRow = async (db, id) =>
	(await db.query("SELECT * FROM contracts WHERE id=$1", [id])).rows[0];
test("offer issuance freezes per-visit pricing and terms; duplicate request is idempotent and pending versions cannot change", async () => {
	const { db, input } = await setup();
	try {
		const draft = await saveEstimate(db, input, "qa");
		const request = { id: draft.id, revision: 1, terms: terms() };
		const o = await issueOffer(db, request, "qa");
		assert.equal((await issueOffer(db, request, "qa")).id, o.id);
		const row = await offerRow(db, o.id);
		assert.equal(row.terms.per_visit_cents, 12500);
		assert.equal(row.terms.monthly_cents, 50000);
		await assert.rejects(
			issueOffer(
				db,
				{ ...request, terms: { ...request.terms, visits_per_month: 3 } },
				"qa",
			),
			(e) => e.status === 409,
		);
		await assert.rejects(
			saveEstimate(
				db,
				{ ...input, id: draft.id, revision: 1, reason: "Cambio rechazado" },
				"qa",
			),
			/bloqueada/,
		);
		await assert.rejects(
			archiveEstimate(
				db,
				{ id: draft.id, revision: 1, reason: "Archivo rechazado" },
				"qa",
			),
			/Conserva/,
		);
		await assert.rejects(
			bindOffer(db, { offer_id: o.id, revision: 1 }, "qa"),
			/aceptación/,
		);
		await closeOffer(
			db,
			{
				offer_id: o.id,
				revision: 1,
				action: "withdraw",
				reason: "Corregir alcance antes de aceptar",
			},
			"qa",
		);
		await assert.rejects(
			acceptOffer(db, acceptance(row), "qa"),
			(e) => e.status === 409,
		);
		const next = await saveEstimate(
			db,
			{
				...input,
				id: draft.id,
				revision: 1,
				reason: "Ajustar alcance ofertado",
			},
			"qa",
		);
		const o2 = await issueOffer(
			db,
			{ ...request, revision: next.revision },
			"qa",
		);
		assert.notEqual(o2.id, o.id);
		assert.equal((await offerRow(db, o.id)).terms.monthly_cents, 50000);
	} finally {
		await db.close();
	}
});
test("only complete, positive estimates and valid reviewed conditions can be issued; expired or unconfirmed acceptance fails", async () => {
	const { db, input } = await setup();
	try {
		const draft = await saveEstimate(
			db,
			{ ...input, labor_hourly: null },
			"qa",
		);
		await assert.rejects(
			issueOffer(db, { id: draft.id, revision: 1, terms: terms() }, "qa"),
			/Completa/,
		);
		const next = await saveEstimate(
			db,
			{
				...input,
				id: draft.id,
				revision: 1,
				reason: "Completar precio antes de emitir",
			},
			"qa",
		);
		await assert.rejects(
			issueOffer(
				db,
				{ id: draft.id, revision: 2, terms: { ...terms(), reviewed: false } },
				"qa",
			),
			/campos/,
		);
		await assert.rejects(
			issueOffer(
				db,
				{
					id: draft.id,
					revision: 2,
					terms: { ...terms(), valid_until: "2000-01-01" },
				},
				"qa",
			),
			/vigencia/,
		);
		const o = await issueOffer(
			db,
			{ id: next.id, revision: 2, terms: terms() },
			"qa",
		);
		const row = await offerRow(db, o.id);
		await assert.rejects(
			acceptOffer(db, { ...acceptance(row), confirmed: false }, "qa"),
			/campos/,
		);
		await assert.rejects(
			acceptOffer(
				db,
				{
					...acceptance(row),
					accepted_at: new Date(Date.now() + 86400000).toISOString(),
				},
				"qa",
			),
			/futura/,
		);
		await db.query(
			"UPDATE estimate_offers SET terms=jsonb_set(terms,'{valid_until}','\"2000-01-01\"') WHERE id=$1",
			[o.id],
		);
		await assert.rejects(acceptOffer(db, acceptance(row), "qa"), /venció/);
	} finally {
		await db.close();
	}
});
test("accepted offer creates one draft contract, preserves agreement and prevents direct material edits", async () => {
	const { db, input } = await setup();
	try {
		const d = await saveEstimate(db, input, "qa");
		const o = await issueOffer(
			db,
			{ id: d.id, revision: 1, terms: terms() },
			"qa",
		);
		const row = await offerRow(db, o.id);
		await acceptOffer(db, acceptance(row), "qa");
		const accepted = await offerRow(db, o.id);
		const [one, two] = await Promise.all([
			bindOffer(db, { offer_id: o.id, revision: accepted.revision }, "qa"),
			bindOffer(db, { offer_id: o.id, revision: accepted.revision }, "qa"),
		]);
		assert.equal(one.id, two.id);
		let c = await contractRow(db, one.id);
		assert.equal(c.status, "draft");
		assert.equal(c.monthly_cents, 50000);
		assert.equal(c.baseline_version, 1);
		const change = {
			id: c.id,
			revision: c.revision,
			property_id: c.property_id,
			service: c.service,
			service_key: c.service_key,
			frequency: c.frequency,
			monthly: 500,
			visits_per_month: 4,
			estimated_minutes: 60,
			status: "active",
		};
		await assert.rejects(
			saveContract(db, { ...change, monthly: 600 }),
			/presupuesto aceptado/,
		);
		await saveContract(db, change);
		c = await contractRow(db, c.id);
		assert.equal(c.status, "active");
		const snapshot = (
			await db.query(
				"SELECT snapshot FROM contract_baselines WHERE contract_id=$1",
				[c.id],
			)
		).rows[0].snapshot;
		assert.equal(snapshot.terms.monthly_cents, 50000);
		assert.equal(snapshot.accepted_by, "Representante QA");
		assert.equal(
			(await db.query("SELECT count(*)::int n FROM contracts")).rows[0].n,
			1,
		);
		assert.equal(
			(await db.query("SELECT count(*)::int n FROM visits")).rows[0].n,
			0,
		);
		assert.ok(
			(
				await db.query(
					"SELECT id FROM change_history WHERE entity='estimate_offer' AND event='acceptance_recorded'",
				)
			).rows.length,
		);
	} finally {
		await db.close();
	}
});
test("authorized amendment updates the same contract only after acceptance and preserves previous baseline", async () => {
	const { db, input } = await setup();
	try {
		const d = await saveEstimate(db, input, "qa");
		const o = await issueOffer(
			db,
			{ id: d.id, revision: 1, terms: terms() },
			"qa",
		);
		await acceptOffer(db, acceptance(await offerRow(db, o.id)), "qa");
		const created = await bindOffer(db, { offer_id: o.id, revision: 2 }, "qa");
		const d2 = await saveEstimate(
			db,
			{
				...input,
				id: d.id,
				revision: 1,
				labor_hourly: 24,
				reason: "Cambio autorizado de alcance y costo",
			},
			"qa",
		);
		const next = await issueOffer(
			db,
			{ id: d.id, revision: d2.revision, terms: terms() },
			"qa",
		);
		let c = await contractRow(db, created.id);
		assert.equal(c.monthly_cents, 50000);
		const pending = await offerRow(db, next.id);
		assert.equal(pending.target_contract_id, c.id);
		assert.equal(pending.replaces_offer_id, o.id);
		await assert.rejects(
			bindOffer(
				db,
				{ offer_id: next.id, revision: 1, contract_revision: c.revision },
				"qa",
			),
			/aceptación/,
		);
		await acceptOffer(db, acceptance(pending), "qa");
		await assert.rejects(
			bindOffer(
				db,
				{ offer_id: next.id, revision: 2, contract_revision: c.revision + 1 },
				"qa",
			),
			(e) => e.status === 409,
		);
		const changed = await bindOffer(
			db,
			{ offer_id: next.id, revision: 2, contract_revision: c.revision },
			"qa",
		);
		assert.equal(changed.id, c.id);
		c = await contractRow(db, c.id);
		assert.equal(c.monthly_cents, 60000);
		assert.equal(c.baseline_version, 2);
		const rows = (
			await db.query("SELECT * FROM contract_baselines ORDER BY version")
		).rows;
		assert.equal(rows.length, 2);
		assert.equal(rows[0].snapshot.terms.monthly_cents, 50000);
		assert.equal(rows[1].snapshot.terms.monthly_cents, 60000);
		assert.equal((await offerRow(db, o.id)).terms.monthly_cents, 50000);
		const ws = await estimateWorkspace(db);
		assert.equal(ws.offers.length, 2);
		assert.equal(ws.baselines.length, 2);
	} finally {
		await db.close();
	}
});
test("future accepted amendments cannot overwrite the current agreement before their effective date", async () => {
	const { db, input } = await setup();
	try {
		const d = await saveEstimate(db, input, "qa");
		const o = await issueOffer(
			db,
			{ id: d.id, revision: 1, terms: terms() },
			"qa",
		);
		await acceptOffer(db, acceptance(await offerRow(db, o.id)), "qa");
		const linked = await bindOffer(db, { offer_id: o.id, revision: 2 }, "qa");
		const d2 = await saveEstimate(
			db,
			{ ...input, id: d.id, revision: 1, reason: "Cambio futuro aceptado" },
			"qa",
		);
		const next = await issueOffer(
			db,
			{
				id: d.id,
				revision: d2.revision,
				terms: { ...terms(), start_date: future() },
			},
			"qa",
		);
		await acceptOffer(db, acceptance(await offerRow(db, next.id)), "qa");
		await assert.rejects(
			bindOffer(
				db,
				{ offer_id: next.id, revision: 2, contract_revision: 1 },
				"qa",
			),
			/fecha de inicio/,
		);
		assert.equal((await contractRow(db, linked.id)).baseline_version, 1);
	} finally {
		await db.close();
	}
});

test("service scheduling and actual start reject dates outside accepted contract validity",async()=>{
 const {db,input}=await setup();try{
 const d=await saveEstimate(db,input,"qa");const o=await issueOffer(db,{id:d.id,revision:1,terms:{...terms(),start_date:future()}},"qa");
 await acceptOffer(db,acceptance(await offerRow(db,o.id)),"qa");const linked=await bindOffer(db,{offer_id:o.id,revision:2},"qa");
 await db.query("UPDATE contracts SET status='active' WHERE id=$1",[linked.id]);const crew=randomUUID();
 await db.query("INSERT INTO crews(id,name,workers,hourly_cents) VALUES($1,'Cuadrilla QA',1,2000)",[crew]);
 const visit={contract_id:linked.id,crew_id:crew,scheduled_at:`${today()}T14:00:00Z`,title:"Visita QA",planned_minutes:30,travel_minutes:0,tasks:[{service_key:"mowing",description:"Corte QA",quantity:1,unit:"unit"}]};
 await assert.rejects(saveVisit(db,visit),/vigencia/);
 const vid=randomUUID();await db.query("INSERT INTO visits(id,contract_id,crew_id,scheduled_at,route_order) VALUES($1,$2,$3,$4,1)",[vid,linked.id,crew,`${future()}T14:00:00Z`]);
 await assert.rejects(changeVisit(db,{id:vid,revision:1,action:"start"}),/vigencia/);
 assert.equal((await db.query("SELECT status FROM visits WHERE id=$1",[vid])).rows[0].status,"scheduled");
 }finally{await db.close();}
});
