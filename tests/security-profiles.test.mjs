import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/modules/operations/migrations.mjs";
import {
	securityService,
	enrollMembership,
	resolveSecurity,
	permits,
	validateGrants,
} from "../src/modules/security/index.mjs";
import {
	permissionRegistry,
	defaultProfiles,
} from "../src/app/_security-manifest.mjs";
import {
	routeAllowed,
	mutationAllowed,
	manageAllowed,
} from "../src/app/_permission-policy.mjs";
import { redactFinancials } from "../src/app/api/_security-data.ts";

const registry = [
	"security.read",
	"security.update",
	"records.read",
	"records.update",
	"money.read",
	"money.update",
].map((key) => ({
	key,
	resource: key.split(".")[0],
	scopes: ["company"],
	label: key,
	action: key.split(".")[1],
	actionLabel: key,
}));
const ctx = { companyId: "alpha", subjectId: "root-alpha" };
async function core() {
	const db = new PGlite();
	const sql = await readFile("db/migrations/013_security_profiles.sql", "utf8");
	await db.exec(sql.split("-- Landscape adapter seeds")[0]);
	for (const company of ["alpha", "beta"]) {
		await db.query(
			"INSERT INTO security_companies(id,name,status) VALUES($1,$1,'active')",
			[company],
		);
		await db.query(
			"INSERT INTO security_profiles(company_id,id,name,protected,scope,grants) VALUES($1,'root','TI',true,'company',$2::jsonb)",
			[company, JSON.stringify(registry.map((c) => c.key))],
		);
		await enrollMembership(db, company, `root-${company}`, ["root"]);
	}
	return { db, svc: securityService(db, registry) };
}
const draft = (version, extra = {}) => ({
	version,
	name: "Consulta operativa",
	description: "Solo consulta",
	status: "active",
	scope: "company",
	grants: ["records.read"],
	...extra,
});
async function version(svc, actor = ctx) {
	return (await svc.snapshot(actor)).company.version;
}

test("security module runs without Landscape tables and isolates memberships, profiles and foreign references", async () => {
	const { db, svc } = await core();
	try {
		assert.equal(
			permits(
				await resolveSecurity(db, "alpha", "root-alpha", registry),
				"security.update",
				"beta",
			),
			false,
		);
		assert.equal(
			await resolveSecurity(db, "beta", "root-alpha", registry),
			null,
		);
		await assert.rejects(
			svc.snapshot({ companyId: "beta", subjectId: "root-alpha" }),
			(e) => e.status === 403,
		);
		const b = await svc.saveProfile(
			{ companyId: "beta", subjectId: "root-beta" },
			draft(1, { name: "Solo beta" }),
		);
		await assert.rejects(
			svc.saveProfile(ctx, draft(1, { id: b.id })),
			(e) => e.status === 404,
		);
		await enrollMembership(db, "alpha", "reader", []);
		await assert.rejects(
			svc.assign(ctx, {
				version: 1,
				subjectId: "reader",
				profileIds: [b.id],
				status: "active",
			}),
			/no está disponible/,
		);
		await assert.rejects(
			db.query("INSERT INTO security_assignments VALUES('alpha','reader',$1)", [
				b.id,
			]),
			/foreign key/,
		);
		const a = await svc.snapshot(ctx);
		assert.equal(
			a.profiles.some((p) => p.id === b.id),
			false,
		);
		assert.equal(
			a.memberships.some((m) => m.subject_id === "root-beta"),
			false,
		);
		assert.equal(
			(await db.query("SELECT to_regclass('customers') c")).rows[0].c,
			null,
		);
	} finally {
		await db.close();
	}
});

test("profile changes are versioned, audited and effective without a new identity session", async () => {
	const { db, svc } = await core();
	try {
		const p = await svc.saveProfile(ctx, draft(1));
		await assert.rejects(
			svc.saveProfile(ctx, draft(1, { id: p.id })),
			(e) => e.status === 409,
		);
		await enrollMembership(db, "alpha", "reader", []);
		await svc.assign(ctx, {
			version: 2,
			subjectId: "reader",
			profileIds: [p.id],
			status: "active",
		});
		assert.equal(
			permits(
				await resolveSecurity(db, "alpha", "reader", registry),
				"records.read",
			),
			true,
		);
		await svc.saveProfile(
			ctx,
			draft(3, { id: p.id, grants: ["records.read", "records.update"] }),
		);
		assert.equal(
			permits(
				await resolveSecurity(db, "alpha", "reader", registry),
				"records.update",
			),
			true,
		);
		await svc.saveProfile(ctx, draft(4, { id: p.id, status: "retired" }));
		assert.equal(await resolveSecurity(db, "alpha", "reader", registry), null);
		const count = Number(
			(
				await db.query(
					"SELECT count(*) n FROM security_audit WHERE company_id='alpha'",
				)
			).rows[0].n,
		);
		assert.equal(count, 4);
	} finally {
		await db.close();
	}
});

test("delegation cannot escalate, protected TI cannot be altered and lockout rolls back adapter writes", async () => {
	const { db, svc } = await core();
	try {
		await assert.rejects(
			svc.saveProfile(ctx, draft(1, { id: "root" })),
			/protegido/,
		);
		const p = await svc.saveProfile(
			ctx,
			draft(1, {
				name: "Administrador limitado",
				grants: ["security.read", "security.update", "records.read"],
			}),
		);
		await enrollMembership(db, "alpha", "delegate", []);
		await svc.assign(ctx, {
			version: 2,
			subjectId: "delegate",
			profileIds: [p.id],
			status: "active",
		});
		const delegate = { companyId: "alpha", subjectId: "delegate" };
		await assert.rejects(
			svc.saveProfile(delegate, draft(3, { grants: ["money.read"] })),
			(e) => e.status === 403,
		);
		await assert.rejects(
			svc.assign(delegate, {
				version: 3,
				subjectId: "root-alpha",
				profileIds: [p.id],
				status: "active",
			}),
			(e) => e.status === 403,
		);
		await db.exec("CREATE TABLE adapter_probe(value text)");
		await assert.rejects(
			svc.assign(
				ctx,
				{
					version: 3,
					subjectId: "root-alpha",
					profileIds: [],
					status: "disabled",
				},
				async (tx) => {
					await tx.query("INSERT INTO adapter_probe VALUES('must rollback')");
				},
			),
			(e) => e.status === 409,
		);
		assert.equal(
			Number(
				(await db.query("SELECT count(*) n FROM adapter_probe")).rows[0].n,
			),
			0,
		);
		assert.equal(await version(svc), 3);
		assert.equal(
			permits(
				await resolveSecurity(db, "alpha", "root-alpha", registry),
				"security.update",
			),
			true,
		);
	} finally {
		await db.close();
	}
});

test("multiple profiles combine only within an active membership and every disabling boundary revokes access", async () => {
	const { db, svc } = await core();
	try {
		const p = await svc.saveProfile(ctx, draft(1));
		const money = await svc.saveProfile(
			ctx,
			draft(2, { name: "Consulta financiera", grants: ["money.read"] }),
		);
		await enrollMembership(db, "alpha", "reader", []);
		await svc.assign(ctx, {
			version: 3,
			subjectId: "reader",
			profileIds: [p.id, money.id],
			status: "active",
		});
		const access = await resolveSecurity(db, "alpha", "reader", registry);
		assert.equal(permits(access, "money.read"), true);
		assert.equal(permits(access, "records.update"), false);
		await svc.assign(ctx, {
			version: 4,
			subjectId: "reader",
			profileIds: [p.id],
			status: "disabled",
		});
		assert.equal(await resolveSecurity(db, "alpha", "reader", registry), null);
		await svc.assign(ctx, {
			version: 5,
			subjectId: "reader",
			profileIds: [p.id],
			status: "active",
		});
		await db.query(
			"UPDATE security_companies SET status='disabled' WHERE id='alpha'",
		);
		assert.equal(await resolveSecurity(db, "alpha", "reader", registry), null);
	} finally {
		await db.close();
	}
});

test("manifest rejects unknown capabilities and scope escalation, and request policy ignores role labels", () => {
	assert.throws(
		() => validateGrants(permissionRegistry, ["customers.update"], "company"),
		/consulta/,
	);
	assert.throws(
		() => validateGrants(permissionRegistry, ["made.up"], "company"),
		/no existe/,
	);
	assert.throws(
		() => validateGrants(permissionRegistry, ["finance.read"], "assigned"),
		/alcance/,
	);
	const reader = {
		role: "it_admin",
		security: {
			active: true,
			company_id: "landscape",
			scope: "company",
			grants: ["customers.read"],
		},
	};
	assert.equal(routeAllowed(reader, "/api/customers", "GET"), true);
	assert.equal(routeAllowed(reader, "/api/customers", "POST"), false);
	assert.equal(mutationAllowed(reader, "customers", { id: "x" }), false);
	assert.equal(manageAllowed(reader, "finance", "GET"), false);
	assert.equal(
		mutationAllowed(
			{
				security: {
					...reader.security,
					grants: ["estimates.read", "estimates.approve"],
				},
			},
			"estimates",
			{ action: "bind" },
		),
		false,
	);
	assert.equal(routeAllowed(reader, "/api/operations", "GET"), false);
	const editor = {
		security: {
			...reader.security,
			grants: ["finance.read", "finance.update"],
		},
	};
	assert.equal(
		mutationAllowed(editor, "finance", { action: "payment" }),
		false,
	);
	assert.equal(mutationAllowed(editor, "finance", { action: "issue" }), false);
	assert.equal(
		mutationAllowed(editor, "finance", { action: "save", id: "x" }),
		true,
	);
	assert.equal(
		mutationAllowed(editor, "finance", { action: "delete", id: "x" }),
		false,
	);
	const operational = {
		security: { ...reader.security, grants: ["visits.read", "visits.execute"] },
	};
	assert.equal(
		mutationAllowed(operational, "visits", { action: "start" }),
		true,
	);
	assert.equal(
		mutationAllowed(operational, "visits", { action: "delete" }),
		false,
	);
	const stamp = new Date("2026-11-08T13:00:00Z");
	assert.equal(redactFinancials(stamp), stamp);
	const redacted = redactFinancials([
		{
			id: "v",
			planned_revenue_cents: 200,
			personnel: [{ name: "A", hourly_cents: 100 }],
			cost_lines: [{ total_cents: 3 }],
		},
	]);
	assert.deepEqual(redacted, [{ id: "v", personnel: [{ name: "A" }] }]);
});

test("migration backfills existing access without changing identities and is repeatable", async () => {
	const db = new PGlite();
	try {
		await db.exec(
			"CREATE TABLE schema_migrations(version integer PRIMARY KEY)",
		);
		const files = (await readdir("db/migrations"))
			.filter((f) => /^\d{3}.*\.sql$/.test(f) && Number(f.slice(0, 3)) < 13)
			.sort();
		for (const f of files)
			await db.exec(await readFile(`db/migrations/${f}`, "utf8"));
		await db.exec(
			"INSERT INTO app_members VALUES('it@example.invalid','TI','it_admin','active',1),('crew@example.invalid','Persona','worker','active',1)",
		);
		await migrate(db);
		assert.equal(
			(
				await db.query(
					"SELECT role FROM app_members WHERE email='crew@example.invalid'",
				)
			).rows[0].role,
			"worker",
		);
		const access = await resolveSecurity(
			db,
			"landscape",
			"crew@example.invalid",
			permissionRegistry,
		);
		assert.equal(access.scope, "assigned");
		assert.equal(permits(access, "finance.read"), false);
		for (const p of defaultProfiles) {
			const row = (
				await db.query(
					"SELECT grants FROM security_profiles WHERE company_id='landscape' AND system_key=$1",
					[p.key],
				)
			).rows[0];
			assert.deepEqual(row.grants, [...new Set(p.grants)].sort());
		}
		await migrate(db);
		assert.equal(
			Number(
				(await db.query("SELECT count(*) n FROM security_assignments")).rows[0]
					.n,
			),
			2,
		);
	} finally {
		await db.close();
	}
});

test("concurrent security edits with the same observed version commit only once", async () => {
	const { db, svc } = await core();
	try {
		const results = await Promise.allSettled([
			svc.saveProfile(ctx, draft(1, { name: "Primero" })),
			svc.saveProfile(ctx, draft(1, { name: "Segundo" })),
		]);
		assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
		assert.equal(
			results.filter((r) => r.status === "rejected" && r.reason.status === 409)
				.length,
			1,
		);
		assert.equal(await version(svc), 2);
		assert.equal(
			Number(
				(
					await db.query(
						"SELECT count(*) n FROM security_audit WHERE company_id='alpha'",
					)
				).rows[0].n,
			),
			1,
		);
	} finally {
		await db.close();
	}
});
