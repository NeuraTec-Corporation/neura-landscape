import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
	mutate,
	snapshot,
	profitability,
} from "../src/modules/operations/store.mjs";
test("persistent customer-to-visit workflow, costs, rollback and reopen", async () => {
	const directory = await mkdtemp(join(tmpdir(), "neura-landscape-test-"));
	let db = new PGlite(directory);
	try {
		await db.exec(await readFile("db/migrations/001_foundation.sql", "utf8"));
		const customer = await mutate(db, {
			action: "customer",
			name: "Demo O'Connor",
		});
		const property = await mutate(db, {
			action: "property",
			customer_id: customer.id,
			name: "Jardín ficticio",
			address: "Dirección de prueba",
			lawn_sqft: 8400,
		});
		const contract = await mutate(db, {
			action: "contract",
			property_id: property.id,
			service: "Mantenimiento",
			frequency: "Semanal",
			monthly: 320,
			visits_per_month: 4,
			estimated_minutes: 45,
		});
		const crew = await mutate(db, {
			action: "crew",
			name: "Norte demo",
			workers: 2,
			hourly: 24,
		});
		const visit = await mutate(db, {
			action: "visit",
			contract_id: contract.id,
			crew_id: crew.id,
			scheduled_at: "2026-11-02T08:00:00Z",
			route_order: 1,
		});
		await assert.rejects(
			mutate(db, {
				action: "complete",
				id: visit.id,
				actual_minutes: 60,
				materials: 10,
				equipment: 12,
				travel: 8,
				overhead: 6,
			}),
			/Inicia/,
		);
		await mutate(db, { action: "start", id: visit.id });
		await assert.rejects(
			mutate(db, { action: "start", id: visit.id }),
			/programada/,
		);
		await assert.rejects(
			mutate(db, {
				action: "complete",
				id: visit.id,
				actual_minutes: -1,
				materials: 10,
				equipment: 12,
				travel: 8,
				overhead: 6,
			}),
			/rango/,
		);
		assert.equal((await snapshot(db)).visits[0].status, "started");
		await mutate(db, {
			action: "complete",
			id: visit.id,
			actual_minutes: 60,
			materials: 10,
			equipment: 12,
			travel: 8,
			overhead: 6,
			notes: "Ejecución ficticia",
		});
		let state = await snapshot(db);
		assert.equal(state.visits[0].labor_cents, 4800);
		assert.deepEqual(state.visits[0].profitability, {
			cost_cents: 8400,
			revenue_cents: 8000,
			contribution_cents: -400,
			margin: -5,
		});
		await assert.rejects(
			mutate(db, {
				action: "complete",
				id: visit.id,
				actual_minutes: 60,
				materials: 0,
				equipment: 0,
				travel: 0,
				overhead: 0,
			}),
			/Inicia/,
		);
		await assert.rejects(
			mutate(db, {
				action: "property",
				customer_id: "missing",
				name: "Invalid",
				address: "Demo",
				lawn_sqft: 10,
			}),
		);
		assert.equal((await snapshot(db)).properties.length, 1);
		assert.equal((await db.query("SELECT * FROM activity")).rows.length, 3);
		await db.close();
		db = new PGlite(directory);
		state = await snapshot(db);
		assert.equal(state.customers[0].name, "Demo O'Connor");
		assert.equal(state.visits[0].status, "completed");
		assert.equal(state.visits[0].profitability.cost_cents, 8400);
	} finally {
		await db.close();
		const target = resolve(directory);
		assert.ok(
			target.startsWith(resolve(tmpdir()) + sep) &&
				target.includes("neura-landscape-test-"),
		);
		await rm(target, { recursive: true, force: true });
	}
});
test("zero-revenue visits do not produce an invalid margin", () => {
	assert.equal(profitability({ status: "scheduled" }), null);
	assert.equal(
		profitability({
			status: "completed",
			labor_cents: 100,
			materials_cents: 0,
			equipment_cents: 0,
			travel_cents: 0,
			overhead_cents: 0,
			revenue_cents: 0,
		}).margin,
		null,
	);
});
