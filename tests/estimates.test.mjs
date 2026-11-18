import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/modules/operations/migrations.mjs";
import { saveSurveyItem } from "../src/modules/operations/survey.mjs";
import {
	saveRate,
	saveEstimate,
	archiveEstimate,
	estimateWorkspace,
} from "../src/modules/estimates/index.ts";
import {
	calculate,
	parse,
	draftSchema,
} from "../src/modules/estimates/contract.ts";
import { canManage } from "../src/modules/identity/auth.mjs";
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
test("estimate calculations distinguish person-hours, margin and unknown costs with equivalent area units", async () => {
	const { db, input } = await setup();
	try {
		const data = await estimateWorkspace(db),
			zone = data.zones[0],
			rate = data.rates[0];
		const parsed = parse(draftSchema, input),
			result = calculate(parsed, [zone], rate);
		assert.equal(result.person_hours, 5);
		assert.equal(result.cost_cents, 10000);
		assert.equal(result.price_cents, 12500);
		assert.equal(result.margin_cents, 2500);
		const metricRate = {
			...rate,
			unit: "sqm",
			quantity_per_person_hour: 92.90304,
		};
		assert.deepEqual(
			calculate(parsed, [{ ...zone, area: 464.5152, unit: "sqm" }], metricRate),
			result,
		);
		const pending = calculate(
			{ ...parsed, labor_hourly: null, resources_reviewed: false },
			[zone],
			rate,
		);
		assert.equal(pending.status, "pending");
		assert.equal(pending.price_cents, null);
		assert.equal(pending.resource_cents, null);
		const unmeasured = calculate(parsed, [{ ...zone, area: null }], rate);
		assert.equal(unmeasured.person_hours, null);
		assert.throws(
			() => parse(draftSchema, { ...input, margin_percent: 100 }),
			/campos/,
		);
		const item = {
			client_key: randomUUID(),
			description: "Material QA",
			category: "materials",
			quantity: 3,
			unit: "bolsa",
			unit_price: 10,
		};
		const detailed = calculate(
			{ ...parsed, overhead_percent: 10, lines: [item] },
			[{ ...zone, area: 2500 }],
			rate,
		);
		assert.equal(detailed.labor_cents, 5000);
		assert.equal(detailed.resource_cents, 3000);
		assert.equal(detailed.overhead_cents, 800);
		assert.equal(detailed.price_cents, 11000);
	} finally {
		await db.close();
	}
});
test("saved estimates retain source snapshots, revisions and historical prices after changing rates", async () => {
	const { db, input, rate, rateInput } = await setup();
	try {
		const first = await saveEstimate(db, input, "qa-owner");
		assert.equal(first.snapshot.calculation.price_cents, 12500);
		await saveRate(
			db,
			{
				...rateInput,
				id: rate.id,
				revision: 1,
				quantity_per_person_hour: 2000,
			},
			"qa-owner",
		);
		let data = await estimateWorkspace(db);
		assert.equal(data.estimates[0].snapshot.calculation.price_cents, 12500);
		assert.equal(data.estimates[0].snapshot.rate.revision, 1);
		await assert.rejects(
			saveEstimate(db, { ...input, id: first.id, revision: 1 }, "qa-owner"),
			(e) => e.status === 409,
		);
		const next = await saveEstimate(
			db,
			{
				...input,
				id: first.id,
				revision: 1,
				rate_revision: 2,
				reason: "Revisión de referencia",
			},
			"qa-owner",
		);
		assert.equal(next.revision, 2);
		assert.equal(next.snapshot.calculation.price_cents, 6250);
		await assert.rejects(
			saveEstimate(
				db,
				{ ...input, id: first.id, revision: 1, rate_revision: 2 },
				"qa-owner",
			),
			(e) => e.status === 409,
		);
		data = await estimateWorkspace(db);
		assert.equal(data.history.length, 2);
		assert.equal(
			data.history.find((h) => h.revision === 1).snapshot.calculation
				.price_cents,
			12500,
		);
		await archiveEstimate(
			db,
			{ id: first.id, revision: 2, reason: "Prueba de retiro QA" },
			"qa-owner",
		);
		assert.equal((await estimateWorkspace(db)).estimates.length, 0);
		assert.equal(
			(await db.query("SELECT count(*)::int n FROM estimate_revisions")).rows[0]
				.n,
			2,
		);
		assert.equal(
			(
				await db.query(
					"SELECT actor FROM change_history WHERE entity='estimate' LIMIT 1",
				)
			).rows[0].actor,
			"qa-owner",
		);
	} finally {
		await db.close();
	}
});
test("estimate validates locality, duplicate zones, missing measurements and stale source revisions", async () => {
	const { db, input, zone } = await setup();
	try {
		await assert.rejects(
			saveEstimate(db, { ...input, zone_ids: [zone.id, zone.id] }, "qa"),
			/más de una vez/,
		);
		await assert.rejects(
			saveEstimate(db, { ...input, areas_independent: false }, "qa"),
			/campos/,
		);
		await assert.rejects(
			saveEstimate(db, { ...input, zone_revisions: { [zone.id]: 2 } }, "qa"),
			(e) => e.status === 409,
		);
		await assert.rejects(
			saveEstimate(db, { ...input, property_id: randomUUID() }, "qa"),
			/localidad activa/,
		);
		const draft = await saveEstimate(
			db,
			{
				...input,
				rate_id: null,
				rate_revision: null,
				labor_hourly: null,
				resources_reviewed: false,
			},
			"qa",
		);
		assert.equal(draft.snapshot.calculation.status, "pending");
		assert.equal(draft.snapshot.calculation.price_cents, null);
		assert.equal(canManage("manager", "estimates", "POST"), true);
		assert.equal(canManage("worker", "estimates", "GET"), false);
		assert.equal(canManage("finance", "estimates", "POST"), false);
		assert.equal(canManage("finance", "estimates", "GET"), true);
	} finally {
		await db.close();
	}
});
