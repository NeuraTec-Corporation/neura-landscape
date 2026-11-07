import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/modules/operations/migrations.mjs";
import { loadSampleOperations } from "../src/modules/operations/sample-operations.mjs";
import { managementDashboard } from "../src/modules/operations/dashboard.mjs";
test("operational scenario feeds dashboard from linked records, preserves prior data and replays without duplicates", async () => {
	const db = new PGlite();
	try {
		await migrate(db);
		const prior = randomUUID();
		await db.query("INSERT INTO customers VALUES($1,$2)", [
			prior,
			"REGISTRO PREVIO QA",
		]);
		await assert.rejects(
			loadSampleOperations(db, {
				confirmed: true,
				actor: "qa",
				environment: "production",
			}),
			(e) => e.status === 403,
		);
		const r = await loadSampleOperations(db, {
			confirmed: true,
			actor: "qa",
			environment: "preview",
		});
		assert.equal(r.customers, 33);
		assert.equal(r.operations.properties, 78);
		assert.equal(r.operations.contracts, 78);
		assert.equal(r.operations.draft_contracts, 4);
		assert.equal(r.operations.estimates, 78);
		assert.equal(r.operations.employees, 18);
		assert.equal(r.operations.crews, 6);
		assert.equal(r.operations.visits, 296);
		assert.equal(r.operations.invoices, 148);
		const d = await managementDashboard(db, {
			from: r.operations.history_from,
			to: r.operations.to,
			origin: "sample",
		});
		assert.equal(d.portfolio.customers, 33);
		assert.equal(d.portfolio.properties, 78);
		const priorView = await managementDashboard(db, {
			from: r.operations.from,
			to: r.operations.to,
			origin: "existing",
		});
		assert.equal(priorView.portfolio.customers, 1);
		assert.equal(priorView.summary.visits, 0);
		assert.equal(priorView.summary.billed_cents, 0);
		assert.equal(
			(await db.query("SELECT name FROM customers WHERE id=$1", [prior]))
				.rows[0].name,
			"REGISTRO PREVIO QA",
		);
		assert.ok(d.summary.completed > 0);
		assert.ok(d.summary.scheduled > 0);
		assert.ok(d.summary.trees_pruned > 0);
		assert.ok(d.summary.blocked_tasks > 0);
		assert.ok(d.production.length >= 7);
		assert.ok(d.productivity.length === 18);
		assert.ok(d.summary.billed_cents > 0);
		assert.ok(d.summary.collected_cents > 0);
		assert.ok(d.summary.receivable_cents > 0);
		assert.ok(d.summary.overdue_cents > 0);
		assert.ok(d.summary.known_cost_cents > 0);
		assert.equal(
			Object.values(d.costBreakdown).reduce((a, b) => a + b, 0),
			d.summary.known_cost_cents,
		);
		assert.ok(
			(
				await db.query(
					"SELECT count(*)::int n FROM visits WHERE status='completed' AND labor_cents+materials_cents+equipment_cents+travel_cents+overhead_cents>revenue_cents",
				)
			).rows[0].n > 0,
		);
		const billed = (
			await db.query(
				"SELECT sum(total_cents)::bigint n FROM invoices WHERE status='issued' AND issue_date BETWEEN $1 AND $2",
				[r.operations.history_from, r.operations.to],
			)
		).rows[0];
		assert.equal(d.summary.billed_cents, Number(billed.n));
		const id = (await db.query("SELECT id FROM crews LIMIT 1")).rows[0].id;
		await db.query("UPDATE crews SET name=$2 WHERE id=$1", [
			id,
			"EDICIÓN CONSERVADA",
		]);
		const repeat = await loadSampleOperations(db, {
			confirmed: true,
			actor: "qa",
		});
		assert.equal(repeat.replayed, true);
		assert.equal(
			(await db.query("SELECT count(*)::int n FROM visits")).rows[0].n,
			296,
		);
		assert.equal(
			(await db.query("SELECT name FROM crews WHERE id=$1", [id])).rows[0].name,
			"EDICIÓN CONSERVADA",
		);
	} finally {
		await db.close();
	}
});

test("operational fixture rollback preserves the existing portfolio and removes partial financial/resource inserts", async () => {
	const db = new PGlite();
	try {
		await migrate(db);
		const { loadSampleCustomers, sampleStatus } = await import(
			"../src/modules/operations/sample-data.mjs"
		);
		await loadSampleCustomers(db, { confirmed: true, actor: "qa" });
		const scoped = {
			transaction: (fn) =>
				db.transaction((tx) =>
					fn({
						query: (sql, args) => {
							if (
								sql.startsWith("INSERT INTO sample_scenario_records") &&
								args[1] === "crew"
							)
								throw Error("Injected scenario failure");
							return tx.query(sql, args);
						},
					}),
				),
		};
		await assert.rejects(
			loadSampleOperations(scoped, { confirmed: true, actor: "qa" }),
			/Injected scenario failure/,
		);
		assert.equal((await sampleStatus(db)).customers, 33);
		assert.equal((await sampleStatus(db)).operations, null);
		for (const table of [
			"employees",
			"crews",
			"invoices",
			"payments",
			"production_rates",
		])
			assert.equal(
				(await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n,
				0,
			);
	} finally {
		await db.close();
	}
});
