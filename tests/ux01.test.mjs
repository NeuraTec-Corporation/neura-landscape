import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/modules/operations/migrations.mjs";
import {
	loadSampleCustomers,
	sampleStatus,
	canLoadSamples,
} from "../src/modules/operations/sample-data.mjs";
import {
	saveOption,
	catalogMetadata,
	canManageCatalog,
} from "../src/modules/operations/catalog.mjs";
import {
	saveEmployee,
	saveCrew,
	workforce,
} from "../src/modules/operations/workforce.mjs";
test("UX01 synthetic customer batch is relational, atomic and repeatable without overwriting edits", async () => {
	const db = new PGlite();
	try {
		await migrate(db);
		await assert.rejects(
			loadSampleCustomers(db, { confirmed: false, actor: "qa" }),
			/Confirma/,
		);
		await assert.rejects(
			loadSampleCustomers(db, {
				confirmed: true,
				actor: "qa",
				environment: "production",
			}),
			(e) => e.status === 403,
		);
		assert.equal((await sampleStatus(db)).loaded, false);
		const result = await loadSampleCustomers(db, {
			confirmed: true,
			actor: "qa",
			environment: "preview",
		});
		assert.equal(result.customers, 33);
		assert.equal(result.properties, 78);
		assert.equal(result.replayed, false);
		const counts = (
			await db.query(
				"SELECT p.kind,count(*)::int n FROM customer_profiles p GROUP BY p.kind ORDER BY p.kind",
			)
		).rows;
		assert.deepEqual(counts, [
			{ kind: "company", n: 5 },
			{ kind: "person", n: 28 },
		]);
		const groups = (
			await db.query(
				"SELECT p.kind,count(s.id)::int n FROM customer_profiles p JOIN properties s ON s.customer_id=p.customer_id GROUP BY p.kind,p.customer_id",
			)
		).rows;
		assert.equal(
			groups.filter((g) => g.kind === "company" && g.n >= 5 && g.n <= 10)
				.length,
			5,
		);
		assert.equal(
			groups.filter((g) => g.kind === "person" && g.n >= 1 && g.n <= 2).length,
			28,
		);
		assert.equal(
			(await db.query("SELECT count(*)::int n FROM property_zones")).rows[0].n,
			78,
		);
		assert.equal(
			(
				await db.query(
					"SELECT count(*)::int n FROM properties WHERE latitude IS NOT NULL OR longitude IS NOT NULL",
				)
			).rows[0].n,
			0,
		);
		const id = (await db.query("SELECT id FROM customers LIMIT 1")).rows[0].id;
		await db.query("UPDATE customers SET name=$2 WHERE id=$1", [
			id,
			"EDICIÓN CONSERVADA",
		]);
		const replay = await loadSampleCustomers(db, {
			confirmed: true,
			actor: "qa",
			environment: "preview",
		});
		assert.equal(replay.replayed, true);
		assert.equal(
			(await db.query("SELECT name FROM customers WHERE id=$1", [id])).rows[0]
				.name,
			"EDICIÓN CONSERVADA",
		);
		assert.equal(
			(await db.query("SELECT count(*)::int n FROM customers")).rows[0].n,
			33,
		);
		assert.equal(
			(await db.query("SELECT count(*)::int n FROM invoices")).rows[0].n,
			0,
		);
		assert.equal(canLoadSamples("manager"), false);
		assert.equal(canLoadSamples("owner"), true);
	} finally {
		await db.close();
	}
});
test("UX01 failure during sample loading rolls back batch and all inserted records", async () => {
	const db = new PGlite();
	try {
		await migrate(db);
		const fail = {
			transaction: (fn) =>
				db.transaction((tx) =>
					fn({
						query: (sql, args) => {
							if (sql.startsWith("INSERT INTO sample_data_records"))
								throw new Error("Injected failure");
							return tx.query(sql, args);
						},
					}),
				),
		};
		await assert.rejects(
			loadSampleCustomers(fail, { confirmed: true, actor: "qa" }),
			/Injected failure/,
		);
		assert.equal((await sampleStatus(db)).loaded, false);
		assert.equal(
			(await db.query("SELECT count(*)::int n FROM customers")).rows[0].n,
			0,
		);
	} finally {
		await db.close();
	}
});
test("UX01 catalogs preserve operational semantics and retired crew assignments per employee", async () => {
	const db = new PGlite();
	try {
		await migrate(db);
		assert.equal((await catalogMetadata(db)).extensible.app_role, false);
		assert.equal(canManageCatalog("manager", "app_role"), false);
		assert.equal(canManageCatalog("manager", "employee_role"), true);
		await assert.rejects(
			saveOption(db, {
				category: "app_role",
				label: "Super usuario",
				active: true,
			}),
			/claves de sistema/,
		);
		const a = await saveEmployee(db, {
				first_name: "Persona",
				last_name: "Uno",
				email: "",
				phone: "",
				role_key: "operator",
				skills: "",
				hourly: 20,
				status: "active",
			}),
			b = await saveEmployee(db, {
				first_name: "Persona",
				last_name: "Dos",
				email: "",
				phone: "",
				role_key: "operator",
				skills: "",
				hourly: 20,
				status: "active",
			});
		const input = {
			name: "Equipo",
			shift_start: "08:00",
			shift_end: "17:00",
			break_minutes: 30,
			members: [{ employee_id: a.id, duty: "operator" }],
		};
		const crew = await saveCrew(db, input);
		await saveOption(db, {
			category: "employee_role",
			key: "operator",
			label: "Operador retirado",
			active: false,
			revision: 1,
		});
		await saveCrew(db, {
			...input,
			id: crew.id,
			revision: 1,
			name: "Equipo editado",
		});
		assert.equal(
			(await workforce(db)).crews.find((c) => c.id === crew.id).name,
			"Equipo editado",
		);
		await assert.rejects(
			saveCrew(db, {
				...input,
				id: crew.id,
				revision: 2,
				members: [{ employee_id: b.id, duty: "operator" }],
			}),
			/activa/,
		);
		await assert.rejects(
			saveCrew(db, { ...input, id: crew.id, revision: 1 }),
			(e) => e.status === 409,
		);
	} finally {
		await db.close();
	}
});
