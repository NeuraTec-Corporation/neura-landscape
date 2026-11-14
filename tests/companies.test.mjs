import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/modules/operations/migrations.mjs";
import {
	saveCompany,
	assignCompany,
	availableCompanies,
	platformIT,
	storageForCompany,
	synchronizeIT,
	selectCompany,
} from "../src/modules/identity/companies.mjs";
import {
	resolveSecurity,
	securityService,
} from "../src/modules/security/index.mjs";
import {
	defaultProfiles,
	permissionRegistry,
} from "../src/app/_security-manifest.mjs";
import {
	companyDatabase,
	assertCompanyStorage,
	withTenant,
} from "../src/modules/operations/tenant-database.mjs";
import { database } from "../src/modules/operations/store.mjs";
const root = "admin@neuratec.invalid";
async function setup() {
	const db = new PGlite();
	await migrate(db);
	await db.query(
		"INSERT INTO app_members VALUES($1,'NeuraTec','it_admin','active',1)",
		[root],
	);
	await db.query(
		"INSERT INTO security_platform_admins(subject_id) VALUES($1)",
		[root],
	);
	return db;
}
const create = (db, name, prefix) =>
	saveCompany(db, root, { name, prefix, status: "active" }, defaultProfiles);
async function user(db, email) {
	await db.query("INSERT INTO app_members VALUES($1,$1,'manager','active',1)", [
		email,
	]);
}
test("company creation is IT-only, atomic, prefix-unique and preserves all existing product data", async () => {
	const db = await setup();
	try {
		await db.query(
			"INSERT INTO customers VALUES('existing','Original customer')",
		);
		await user(db, "owner@invalid.example");
		await assert.rejects(
			saveCompany(
				db,
				"owner@invalid.example",
				{ name: "Forbidden", prefix: "FOR", status: "active" },
				defaultProfiles,
			),
			(e) => e.status === 403,
		);
		const { id } = await create(db, "Jardines del Norte", "NOR"),
			port = await storageForCompany(db, id);
		assert.equal(
			(await port.query("SELECT count(*)::int n FROM customers")).rows[0].n,
			0,
		);
		assert.equal(
			(await db.query("SELECT name FROM customers")).rows[0].name,
			"Original customer",
		);
		assert.equal(
			(await port.query("SELECT count(*)::int n FROM catalog_options")).rows[0]
				.n > 0,
			true,
		);
		assert.equal(
			(
				await port.query(
					"SELECT count(*)::int n FROM security_profiles WHERE company_id=$1",
					[id],
				)
			).rows[0].n,
			7,
		);
		await assert.rejects(create(db, "Duplicate", "NOR"));
		assert.equal(
			(await db.query("SELECT count(*)::int n FROM security_companies")).rows[0]
				.n,
			2,
		);
		const schemas = (
			await db.query(
				"SELECT count(*)::int n FROM pg_namespace WHERE nspname LIKE 'tenant_%'",
			)
		).rows[0].n;
		assert.equal(schemas, 1);
		await assert.rejects(create(db, "Reserved", "NEU"));
	} finally {
		await db.close();
	}
});
test("two companies isolate customers, properties, visits, finance, photos, IDs and concurrent request contexts", async () => {
	const db = await setup();
	try {
		const initialPath = (await db.query("SHOW search_path")).rows[0]
			.search_path;
		const a = await create(db, "Empresa Aurora", "AUR"),
			b = await create(db, "Empresa Bosque", "BOS");
		const pa = await storageForCompany(db, a.id),
			pb = await storageForCompany(db, b.id);
		for (const [port, name] of [
			[pa, "Aurora"],
			[pb, "Bosque"],
		]) {
			await port.query("INSERT INTO customers VALUES('same',$1)", [name]);
			await port.exec(
				"INSERT INTO properties(id,customer_id,name,address) VALUES('place','same','Garden','Address');INSERT INTO contracts(id,property_id,service,frequency,monthly_cents,visits_per_month,estimated_minutes) VALUES('contract','place','Mowing','Monthly',10000,1,30);INSERT INTO crews(id,name,workers,hourly_cents) VALUES('crew','Crew',2,2000);INSERT INTO visits(id,contract_id,crew_id,scheduled_at,route_order) VALUES('visit','contract','crew',now(),1);INSERT INTO invoices(id,number,customer_id,issue_date,due_date,total_cents) VALUES('invoice','INV-001','same',current_date,current_date,10000);",
			);
		}
		await pa.query("UPDATE customers SET name='Changed A' WHERE id='same'");
		assert.equal(
			(await pb.query("SELECT name FROM customers")).rows[0].name,
			"Bosque",
		);
		await pa.query("INSERT INTO customers VALUES('a-only','A only')");
		await assert.rejects(
			pb.query(
				"INSERT INTO properties(id,customer_id,name,address) VALUES('bad','a-only','Bad','Bad')",
			),
		);
		await pa.query("DELETE FROM visits WHERE id='visit'");
		assert.equal(
			(await pb.query("SELECT count(*)::int n FROM visits")).rows[0].n,
			1,
		);
		await pa.query("DELETE FROM invoices WHERE id='invoice'");
		assert.equal(
			(await pb.query("SELECT count(*)::int n FROM invoices")).rows[0].n,
			1,
		);
		assert.equal(
			(await pa.query("SELECT count(*)::int n FROM property_photos")).rows[0].n,
			0,
		);
		const names = await Promise.all(
			[pa, pb, pa, pb].map((port) =>
				withTenant({ db: port }, async () => {
					await new Promise((r) => setTimeout(r, 2));
					return (
						await (
							await database()
						).query("SELECT name FROM customers WHERE id='same'")
					).rows[0].name;
				}),
			),
		);
		assert.deepEqual(names, ["Changed A", "Bosque", "Changed A", "Bosque"]);
		assert.equal(
			(await db.query("SHOW search_path")).rows[0].search_path,
			initialPath,
		);
		const schema = (
			await db.query(
				"SELECT schema_name FROM security_company_storage WHERE company_id=$1",
				[a.id],
			)
		).rows[0].schema_name;
		await db.exec(
			`ALTER TABLE "${schema}".customers ADD COLUMN incompatible text`,
		);
		await assert.rejects(
			assertCompanyStorage(db, schema),
			/compatible migration/,
		);
		assert.throws(
			() => companyDatabase(db, "public;DROP TABLE customers"),
			/Invalid/,
		);
	} finally {
		await db.close();
	}
});
test("memberships assign company-specific profiles; owner and general administrator cannot become platform IT", async () => {
	const db = await setup();
	try {
		const a = await create(db, "Empresa Aurora", "AUR"),
			b = await create(db, "Empresa Bosque", "BOS");
		for (const email of [
			"owner@invalid.example",
			"administrator@invalid.example",
		])
			await user(db, email);
		await assignCompany(db, root, {
			company_id: a.id,
			subject_id: "owner@invalid.example",
			profile_id: "default-owner",
		});
		await assignCompany(db, root, {
			company_id: a.id,
			subject_id: "administrator@invalid.example",
			profile_id: "default-company_admin",
		});
		assert.deepEqual(
			(await availableCompanies(db, "owner@invalid.example")).map((c) => c.id),
			[a.id],
		);
		assert.equal((await availableCompanies(db, root)).length, 3);
		assert.equal(await platformIT(db, "owner@invalid.example"), false);
		assert.equal(await synchronizeIT(db, b.id, "owner@invalid.example"), false);
		assert.equal(
			await resolveSecurity(
				db,
				b.id,
				"owner@invalid.example",
				permissionRegistry,
			),
			null,
		);
		await assert.rejects(
			assignCompany(db, "owner@invalid.example", {
				company_id: b.id,
				subject_id: "owner@invalid.example",
				profile_id: "default-owner",
			}),
			(e) => e.status === 403,
		);
		await assert.rejects(
			assignCompany(db, root, {
				company_id: a.id,
				subject_id: "owner@invalid.example",
				profile_id: "default-it_admin",
			}),
		);
		const admin = await resolveSecurity(
			db,
			a.id,
			"administrator@invalid.example",
			permissionRegistry,
		);
		assert.equal(admin.authority_level, 20);
		assert.equal(admin.root, false);
		const version = (
			await db.query("SELECT version FROM security_companies WHERE id=$1", [
				a.id,
			])
		).rows[0].version;
		await assert.rejects(
			securityService(db, permissionRegistry).assign(
				{ companyId: a.id, subjectId: "administrator@invalid.example" },
				{
					subjectId: "owner@invalid.example",
					profileIds: ["default-company_admin"],
					status: "active",
					version,
				},
			),
			(e) => e.status === 403,
		);
		await assignCompany(db, root, {
			company_id: b.id,
			subject_id: "owner@invalid.example",
			profile_id: "default-manager",
		});
		assert.equal(
			(
				await resolveSecurity(
					db,
					b.id,
					"owner@invalid.example",
					permissionRegistry,
				)
			).authority_level,
			30,
		);
		assert.equal(
			(
				await resolveSecurity(
					db,
					a.id,
					"owner@invalid.example",
					permissionRegistry,
				)
			).authority_level,
			10,
		);
		const codes = (
			await db.query(
				"SELECT code FROM security_login_codes WHERE subject_id=$1 ORDER BY code",
				["owner@invalid.example"],
			)
		).rows;
		assert.deepEqual(
			codes.map((c) => c.code),
			["AUR001", "BOS001"],
		);
		await db.query(
			"UPDATE security_memberships SET status='disabled' WHERE company_id=$1 AND subject_id=$2",
			[a.id, "owner@invalid.example"],
		);
		assert.equal(
			await resolveSecurity(
				db,
				a.id,
				"owner@invalid.example",
				permissionRegistry,
			),
			null,
		);
		assert.equal(
			(await availableCompanies(db, "owner@invalid.example")).length,
			1,
		);
		await db.query(
			"UPDATE security_platform_admins SET status='disabled' WHERE subject_id=$1",
			[root],
		);
		assert.equal(await platformIT(db, root), false);
		await assert.rejects(
			create(db, "Forbidden", "DEN"),
			(e) => e.status === 403,
		);
	} finally {
		await db.close();
	}
});

test("company selection never trusts an unauthorized explicit target and stale preferences cannot cross account boundaries", () => {
	const companies = [
		{ id: "own", status: "active", operational_enabled: true },
		{ id: "disabled", status: "disabled", operational_enabled: true },
	];
	assert.equal(selectCompany(companies, "foreign", "own"), undefined);
	assert.equal(selectCompany(companies, "disabled", "own"), undefined);
	assert.equal(selectCompany(companies, null, "foreign").id, "own");
	assert.equal(selectCompany([], null, "own"), undefined);
});

test("business migrations upgrade existing company namespaces without copying or dropping business records", async () => {
	const db = await setup();
	try {
		const { id } = await create(db, "Aurora", "AUR"),
			schema = (
				await db.query(
					"SELECT schema_name FROM security_company_storage WHERE company_id=$1",
					[id],
				)
			).rows[0].schema_name;
		const port = await storageForCompany(db, id);
		await port.query("INSERT INTO customers VALUES('retained','Retained')");
		await db.exec(
			`ALTER TABLE "${schema}".crews DROP COLUMN reference_only,DROP COLUMN origin_company_id;ALTER TABLE "${schema}".employees DROP COLUMN reference_only,DROP COLUMN origin_company_id;ALTER TABLE "${schema}".visits DROP COLUMN assignment_review_required,DROP COLUMN assignment_review_reason;DELETE FROM "${schema}".schema_migrations WHERE version=18`,
		);
		await migrate(db);
		await migrate(db);
		const upgraded = await storageForCompany(db, id);
		assert.equal(
			(await upgraded.query("SELECT name FROM customers")).rows[0].name,
			"Retained",
		);
	} finally {
		await db.close();
	}
});
