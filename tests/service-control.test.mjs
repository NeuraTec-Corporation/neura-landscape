import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/modules/operations/migrations.mjs";
import {
	saveProperty,
	listProperties,
} from "../src/modules/operations/properties.mjs";
import {
	contracts,
	saveContract,
	removeEntity,
	serviceControl,
} from "../src/modules/operations/contracts.mjs";
import { mutate } from "../src/modules/operations/store.mjs";
const site = (customer_id) => ({
	customer_id,
	name: "Lugar",
	code: "",
	kind: "commercial",
	status: "active",
	line1: "1 Test",
	line2: "",
	city: "Newark",
	region: "NJ",
	postal_code: "07102",
	country: "US",
	latitude: null,
	longitude: null,
	contact_name: "",
	contact_phone: "",
	lawn_sqft: null,
	garden_sqft: null,
	paved_sqft: null,
	access_instructions: "",
	service_hours: "",
	notes: "",
});
test("operator codes, contract edits, monthly costs, cancellation and deletion preserve history", async () => {
	const db = new PGlite();
	try {
		await migrate(db);
		await migrate(db);
		const customer = randomUUID();
		await db.query("INSERT INTO customers VALUES($1,$2)", [
			customer,
			"Cliente de prueba",
		]);
		await assert.rejects(saveProperty(db, site(customer)), /empresa operadora/);
		await db.query("INSERT INTO operator_settings VALUES(1,'OPERADORA')");
		const first = await saveProperty(db, site(customer)),
			second = await saveProperty(db, site(customer));
		let properties = await listProperties(db, customer);
		assert.match(
			properties.find((p) => p.id === first.id).code,
			/^LOC-OPERADORA-\d{4}-0001$/,
		);
		assert.match(properties.find((p) => p.id === second.id).code, /0002$/);
		const input = {
			property_id: first.id,
			service: "Corte y limpieza",
			frequency: "Semanal",
			monthly: 320,
			visits_per_month: 4,
			estimated_minutes: 45,
			status: "active",
		};
		const contract = await saveContract(db, input);
		await assert.rejects(saveContract(db, { ...input, frequency: "algo" }));
		assert.equal((await contracts(db))[0].customer_name, "Cliente de prueba");
		await assert.rejects(
			removeEntity(db, "property", first.id, 1),
			/contratos vinculados/,
		);
		const crew = await mutate(db, {
			action: "crew",
			name: "Equipo",
			workers: 2,
			hourly: 20,
		});
		const visit = await mutate(db, {
			action: "visit",
			contract_id: contract.id,
			crew_id: crew.id,
			scheduled_at: "2030-01-02T14:00:00Z",
			route_order: 1,
		});
		await saveContract(db, {
			...input,
			id: contract.id,
			revision: 1,
			monthly: 640,
		});
		await assert.rejects(
			saveContract(db, { ...input, id: contract.id, revision: 1 }),
			/Recarga/,
		);
		await mutate(db, { action: "start", id: visit.id });
		await assert.rejects(
			removeEntity(db, "contract", contract.id, 2),
			/ejecución/,
		);
		await mutate(db, {
			action: "complete",
			id: visit.id,
			actual_minutes: 60,
			materials: 5,
			equipment: 2,
			travel: 3,
			overhead: 1,
		});
		const pending = await mutate(db, {
			action: "visit",
			contract_id: contract.id,
			crew_id: crew.id,
			scheduled_at: "2030-01-03T14:00:00Z",
			route_order: 1,
		});
		// UTC February 1 is still January in the service timezone.
		await mutate(db, {
			action: "visit",
			contract_id: contract.id,
			crew_id: crew.id,
			scheduled_at: "2030-02-01T02:00:00Z",
			route_order: 2,
		});
		let report = (await serviceControl(db, "2030-01"))[0];
		assert.equal(report.completed, 1);
		assert.equal(report.scheduled, 2);
		assert.equal(report.remaining, 3);
		assert.equal(report.allocated_revenue_cents, 8000);
		assert.equal(report.total_cost_cents, 5100);
		assert.equal(report.contribution_cents, 2900);
		await removeEntity(db, "contract", contract.id, 2);
		assert.equal(
			(await db.query("SELECT status FROM visits WHERE id=$1", [pending.id]))
				.rows[0].status,
			"cancelled",
		);
		await assert.rejects(
			mutate(db, {
				action: "visit",
				contract_id: contract.id,
				crew_id: crew.id,
				scheduled_at: "2030-01-04",
				route_order: 1,
			}),
			/no activo/,
		);
		await removeEntity(db, "property", first.id, 1);
		assert.equal((await listProperties(db, customer)).length, 1);
		report = (await serviceControl(db, "2030-01"))[0];
		assert.equal(report.completed, 1);
		assert.equal(report.cancelled, 2);
		assert.equal(report.total_cost_cents, 5100);
		assert.equal(
			(await db.query("SELECT count(*)::int n FROM service_audit")).rows[0].n,
			4,
		);
		properties = await listProperties(db, customer);
		const original = properties[0];
		await saveProperty(db, { ...original, code: "CAMBIADO" });
		assert.equal((await listProperties(db, customer))[0].code, original.code);
	} finally {
		await db.close();
	}
});
