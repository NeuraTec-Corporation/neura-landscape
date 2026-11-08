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
 assert.equal((await db.query("SELECT count(*)::int n FROM visit_tasks WHERE status='blocked' AND service_key='pruning'")).rows[0].n,0);
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
 // Emulate the previous labels in the existing tagged scenario, then upgrade in place.
 const customer=(await db.query("SELECT c.* FROM customers c JOIN sample_data_records r ON r.entity='customer' AND r.entity_id=c.id WHERE c.name='ADRIANA MENDOZA'")).rows[0];
 await db.query("UPDATE customers SET name='CLIENTE PRUEBA UNO' WHERE id=$1",[customer.id]);
 await db.query("UPDATE customer_profiles SET first_name='CLIENTE',last_name='PRUEBA UNO' WHERE customer_id=$1",[customer.id]);
 await db.query("UPDATE customer_contacts SET first_name='CONTACTO',last_name='PRUEBA',email='ux01-cliente-01@example.invalid' WHERE customer_id=$1",[customer.id]);
 const site=(await db.query("SELECT * FROM properties WHERE code LIKE 'LOC-NL-%-0001'")).rows[0];
 await db.query("UPDATE properties SET name='RESIDENCIA DE PRUEBA 1',code=replace(code,'LOC-NL-','LOC-PRUEBA-') WHERE id=$1",[site.id]);
 const staff=(await db.query("SELECT * FROM employees WHERE first_name='ELENA'")).rows[0];
 await db.query("UPDATE employees SET last_name='EJEMPLO',email='equipo-1@example.invalid' WHERE id=$1",[staff.id]);
 await db.query("UPDATE visit_personnel SET name_snapshot='ELENA EJEMPLO' WHERE employee_id=$1",[staff.id]);
 const estimate=(await db.query("SELECT e.*,r.snapshot FROM estimate_drafts e JOIN estimate_revisions r ON r.estimate_id=e.id AND r.revision=e.revision LIMIT 1")).rows[0];
 await db.query("UPDATE estimate_drafts SET title='PRUEBA · '||title WHERE id=$1",[estimate.id]);
 const before=(await managementDashboard(db,{from:r.operations.history_from,to:r.operations.to,origin:"sample"})).summary;
 await db.exec("DELETE FROM schema_migrations WHERE version=12");
 await migrate(db);
 assert.equal((await db.query("SELECT name FROM customers WHERE id=$1",[customer.id])).rows[0].name,"ADRIANA MENDOZA");
 assert.equal((await db.query("SELECT name FROM properties WHERE id=$1",[site.id])).rows[0].name,"CASA LOS OLMOS");
 assert.equal((await db.query("SELECT last_name FROM employees WHERE id=$1",[staff.id])).rows[0].last_name,"MORALES");
 assert.equal((await db.query("SELECT name FROM crews WHERE id=$1",[id])).rows[0].name,"EDICIÓN CONSERVADA");
 assert.equal((await db.query("SELECT name FROM customers WHERE id=$1",[prior])).rows[0].name,"REGISTRO PREVIO QA");
 const revised=(await db.query("SELECT * FROM estimate_drafts WHERE id=$1",[estimate.id])).rows[0];
 assert.equal(revised.revision,2);
 const revisions=(await db.query("SELECT * FROM estimate_revisions WHERE estimate_id=$1 ORDER BY revision",[estimate.id])).rows;
 assert.deepEqual(revisions[0].snapshot,estimate.snapshot);
 assert.deepEqual(revisions[1].snapshot.calculation,estimate.snapshot.calculation);
 const after=(await managementDashboard(db,{from:r.operations.history_from,to:r.operations.to,origin:"sample"})).summary;
 assert.deepEqual(after,before);
 await migrate(db);
 assert.equal((await db.query("SELECT revision FROM estimate_drafts WHERE id=$1",[estimate.id])).rows[0].revision,2);

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
