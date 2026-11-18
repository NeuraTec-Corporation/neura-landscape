import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { dailyCapacity, planningDay } from "../src/modules/operations/daily-capacity.mjs";
import { migrate } from "../src/modules/operations/migrations.mjs";
import { saveEmployee, saveCrew } from "../src/modules/operations/workforce.mjs";
import { saveVisit, changeVisit, visitList } from "../src/modules/operations/visits.mjs";

test("daily planning accounts for shifts, travel, shared people, revisions and New York calendar boundaries", () => {
	const crew = { id: "a", name: "North", shift_start: "08:00", shift_end: "17:00", break_minutes: 30, members: [{ employee_id: "one", status: "active" }] };
	const other = { ...crew, id: "b", name: "South" };
	const visit = { id: "v1", crew_id: "a", scheduled_at: "2026-11-10T15:00:00Z", status: "scheduled", planned_minutes: 60, travel_minutes: 15, personnel: [{ employee_id: "one" }] };
	let row = dailyCapacity([crew], [visit], "2026-11-10")[0];
	assert.deepEqual([row.capacity, row.reserved, row.remaining, row.visits], [510, 75, 435, 1]);
	assert.equal(row.warnings.length, 0);
	row = dailyCapacity([crew], [visit], "2026-11-10", { ...visit, planned_minutes: 90 })[0];
	assert.deepEqual([row.reserved, row.visits], [105, 1], "editing replaces, rather than duplicates, the saved visit");
	const overlap = { ...visit, id: "v2", crew_id: "b", scheduled_at: "2026-11-10T15:45:00Z" };
	assert.ok(dailyCapacity([crew, other], [visit, overlap], "2026-11-10").every((r) => r.warnings.some((w) => w.includes("cruce"))));
	assert.equal(dailyCapacity([crew], [visit, { ...overlap, status: "cancelled" }], "2026-11-10")[0].warnings.length, 0);
	row = dailyCapacity([crew], [{ ...visit, planned_minutes: 510, assignment_review_required: true }], "2026-11-10")[0];
	assert.ok(row.warnings.some((w) => w.includes("Sobrecarga de 15")));
	assert.ok(row.warnings.some((w) => w.includes("fuera del turno")));
	assert.equal(row.review, 1);
	assert.ok(dailyCapacity([crew], [{ ...visit, planned_minutes: null }], "2026-11-10")[0].warnings.some((w) => w.includes("sin duración")));
	assert.ok(dailyCapacity([{ ...crew, members: [{ employee_id: "one", status: "inactive" }] }], [], "2026-11-10")[0].warnings.some((w) => w.includes("Personal incompleto")));
	assert.equal(planningDay("2026-11-10T02:00:00Z"), "2026-11-09");
	assert.equal(planningDay("2026-07-10T04:00:00Z"), "2026-07-10");
});

test("pending reassignment cannot start; failed plans preserve it and a valid save clears it with personnel and history", async () => {
	const db = new PGlite();
	try {
		await migrate(db);
		await db.query("INSERT INTO customers VALUES('customer','Marina Alder')");
		await db.query("INSERT INTO properties(id,customer_id,name,address) VALUES('property','customer','Elm Garden','Synthetic address')");
		await db.query("INSERT INTO contracts(id,property_id,service,frequency,monthly_cents,visits_per_month,estimated_minutes) VALUES('contract','property','Corte','Semanal',32000,4,60)");
		const employee = await saveEmployee(db, { first_name: "Lucas", last_name: "Alder", email: "", phone: "", role_key: "operator", skills: "Corte", hourly: 20, status: "active" });
		const crew = await saveCrew(db, { name: "North", shift_start: "08:00", shift_end: "17:00", break_minutes: 30, members: [{ employee_id: employee.id, duty: "operator" }] });
		const input = { contract_id: "contract", crew_id: crew.id, scheduled_at: "2026-11-10T15:00:00Z", title: "Corte frontal", planned_minutes: 60, travel_minutes: 10, tasks: [{ service_key: "mowing", description: "Corte frontal", employee_id: employee.id, quantity: 150, unit: "sqft" }] };
		const visit = await saveVisit(db, input);
		await db.query("UPDATE visits SET assignment_review_required=true,assignment_review_reason='Revisar reparto' WHERE id=$1", [visit.id]);
		await assert.rejects(changeVisit(db, { id: visit.id, revision: 1, action: "start" }), /cuadrilla propia/);
		await assert.rejects(saveVisit(db, { ...input, id: visit.id, revision: 1, planned_minutes: 600 }), /turno|capacidad/);
		assert.equal((await visitList(db))[0].assignment_review_required, true);
		await saveVisit(db, { ...input, id: visit.id, revision: 1 });
		const saved = (await visitList(db))[0];
		assert.equal(saved.assignment_review_required, false);
		assert.equal(saved.revision, 2);
		assert.equal(saved.scheduled_at.toISOString(), input.scheduled_at.replace("Z", ".000Z"));
		assert.equal(saved.personnel[0].employee_id, employee.id);
		assert.equal(saved.tasks[0].description, "Corte frontal");
		assert.equal((await db.query("SELECT count(*)::int n FROM change_history WHERE entity='visit' AND entity_id=$1 AND event='rescheduled'", [visit.id])).rows[0].n, 1);
	} finally { await db.close(); }
});
