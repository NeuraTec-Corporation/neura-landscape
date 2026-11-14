import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/modules/operations/migrations.mjs";
import {
	listProperties,
	saveProperty,
	mutate,
} from "../src/modules/operations/index.mjs";
const location = (customer_id, code) => ({
	customer_id,
	code,
	name: "Sucursal de prueba",
	kind: "commercial",
	status: "active",
	line1: "12 Test Street",
	line2: "Suite 2",
	city: "Newark",
	region: "NJ",
	postal_code: "07102",
	country: "US",
	latitude: null,
	longitude: null,
	contact_name: "Persona de prueba",
	contact_phone: "+12015550123",
	lawn_sqft: null,
	garden_sqft: 120.5,
	paved_sqft: 0,
	access_instructions: "Entrar por acceso lateral",
	service_hours: "Lunes a viernes, 09:00–16:00",
	notes: "",
});
test("property migration preserves existing identifiers, address text and contract/visit links", async () => {
	const db = new PGlite();
	try {
		await db.exec(await readFile("db/migrations/001_foundation.sql", "utf8"));
		const customer = randomUUID(),
			property = randomUUID();
		await db.query("INSERT INTO customers VALUES($1,$2)", [
			customer,
			"Cliente previo",
		]);
		await db.query("INSERT INTO properties VALUES($1,$2,$3,$4,$5)", [
			property,
			customer,
			"Lugar previo",
			"Dirección histórica",
			8400,
		]);
		const contract = await mutate(db, {
			action: "contract",
			property_id: property,
			service: "Mantenimiento",
			frequency: "Semanal",
			monthly: 320,
			visits_per_month: 4,
			estimated_minutes: 45,
		});
		const crew = await mutate(db, {
			action: "crew",
			name: "Cuadrilla",
			workers: 2,
			hourly: 20,
		});
		const visit = await mutate(db, {
			action: "visit",
			contract_id: contract.id,
			crew_id: crew.id,
			scheduled_at: "2030-01-01T09:00:00Z",
			route_order: 1,
		});
		await migrate(db);
		let row = (await listProperties(db, customer))[0];
		assert.equal(row.id, property);
		assert.equal(row.address, "Dirección histórica");
		assert.equal(row.line1, "Dirección histórica");
		assert.equal(row.city, "");
		assert.equal(row.country, "");
		assert.equal(row.contract_count, 1);
		assert.equal(row.kind, "other");
		await saveProperty(db, {
			...location(customer, row.code),
			id: property,
			revision: row.revision,
			status: "inactive",
		});
		row = (await listProperties(db, customer))[0];
		assert.equal(row.revision, 2);
		assert.equal(row.status, "inactive");
		assert.equal(row.lawn_sqft, null);
		await migrate(db);
		assert.equal((await listProperties(db, customer))[0].city, "NEWARK");
		assert.equal(
			(
				await db.query("SELECT property_id FROM contracts WHERE id=$1", [
					contract.id,
				])
			).rows[0].property_id,
			property,
		);
		assert.equal(
			(await db.query("SELECT contract_id FROM visits WHERE id=$1", [visit.id]))
				.rows[0].contract_id,
			contract.id,
		);
		assert.equal(
			(await db.query("SELECT count(*)::int n FROM schema_migrations")).rows[0]
				.n,
			22,
		);
	} finally {
		await db.close();
	}
});
test("multiple customer locations, field validation, owner binding and edit conflicts", async () => {
	const db = new PGlite();
	try {
		await migrate(db);
		const company = randomUUID(),
			person = randomUUID();
		await db.query("INSERT INTO customers VALUES($1,$2),($3,$4)", [
			company,
			"Empresa de prueba",
			person,
			"Persona de prueba",
		]);
		const first = await saveProperty(db, location(company, "NORTE"));
		await saveProperty(db, { ...location(company, "SUR"), name: "Local Sur" });
		const residential = await saveProperty(db, {
			...location(person, "NORTE"),
			kind: "residential",
			name: "Casa principal",
		});
		await saveProperty(db, {
			...location(person, "TERRENO"),
			kind: "land",
			name: "Terreno",
		});
		assert.equal((await listProperties(db, company)).length, 2);
		assert.equal((await listProperties(db, person)).length, 2);
		assert.equal(
			(await listProperties(db, person)).every(
				(row) => row.customer_id === person,
			),
			true,
		);
		await assert.rejects(
			saveProperty(db, location(company, "norte")),
			(e) => e.status === 409,
		);
		await assert.rejects(
			saveProperty(db, { ...location(company, "BAD"), city: "" }),
			(e) => e.status === 422 && !!e.fields.city,
		);
		await assert.rejects(
			saveProperty(db, {
				...location(company, "BAD"),
				latitude: 40.1,
				longitude: null,
			}),
			(e) => e.status === 422,
		);
		await assert.rejects(
			saveProperty(db, { ...location(company, "BAD"), lawn_sqft: -1 }),
			(e) => e.status === 422,
		);
		await assert.rejects(
			saveProperty(db, { ...location(randomUUID(), "BAD") }),
			(e) => e.status === 422,
		);
		const stale = (await listProperties(db, company)).find(
			(row) => row.id === first.id,
		);
		await saveProperty(db, { ...stale, name: "Local actualizado" });
		await assert.rejects(
			saveProperty(db, { ...stale, name: "Sobrescritura" }),
			(e) => e.status === 409,
		);
		await assert.rejects(
			saveProperty(db, { ...stale, customer_id: person, revision: 2 }),
			(e) => e.status === 409,
		);
		assert.equal(
			(await listProperties(db, person)).some(
				(row) => row.id === residential.id,
			),
			true,
		);
		assert.equal((await listProperties(db)).length, 4);
	} finally {
		await db.close();
	}
});

test("customer address changes do not move saved service locations", async () => {
	const db = new PGlite();
	try {
		await migrate(db);
		const customer = randomUUID(),
			address = randomUUID();
		await db.query("INSERT INTO customers VALUES($1,$2)", [
			customer,
			"Cliente con varios lugares",
		]);
		await db.query(
			"INSERT INTO customer_addresses(id,customer_id,label,line1,line2,city,region,postal_code,country,place_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
			[
				address,
				customer,
				"billing",
				"12 Test Street",
				"",
				"Newark",
				"NJ",
				"07102",
				"US",
				"",
			],
		);
		const copied = (
			await db.query("SELECT * FROM customer_addresses WHERE id=$1", [address])
		).rows[0];
		await saveProperty(db, {
			...location(customer, "COPIA"),
			line1: copied.line1,
			city: copied.city,
			region: copied.region,
			postal_code: copied.postal_code,
			country: copied.country,
		});
		await db.query(
			"UPDATE customer_addresses SET line1=$2,city=$3 WHERE id=$1",
			[address, "34 Other Street", "Jersey City"],
		);
		const site = (await listProperties(db, customer))[0];
		assert.equal(site.line1, "12 TEST STREET");
		assert.equal(site.city, "NEWARK");
		await saveProperty(db, { ...site, city: "Hoboken" });
		assert.equal(
			(
				await db.query("SELECT city FROM customer_addresses WHERE id=$1", [
					address,
				])
			).rows[0].city,
			"Jersey City",
		);
	} finally {
		await db.close();
	}
});
