import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { authenticationOptions } from "../src/modules/identity/auth.mjs";
import { migrate } from "../src/modules/operations/migrations.mjs";
import { loadSampleOperations } from "../src/modules/operations/sample-operations.mjs";
import { provisionEnterpriseScenario } from "../src/modules/identity/enterprise-scenario.mjs";
import {
	provisionEvaluationUsers,
	ensureMemberCode,
	emailForUserCode,
} from "../src/modules/identity/user-codes.mjs";
import { evaluationUsers } from "../src/app/_evaluation-users.mjs";
import {
	defaultProfiles,
	permissionRegistry,
} from "../src/app/_security-manifest.mjs";
import {
	availableCompanies,
	storageForCompany,
	platformIT,
	assignCompany,
} from "../src/modules/identity/companies.mjs";
import { resolveSecurity } from "../src/modules/security/index.mjs";
import { changeVisit } from "../src/modules/operations/visits.mjs";
const env = {
	VERCEL: "1",
	VERCEL_ENV: "preview",
	LANDSCAPE_EVALUATION_USERS: "true",
	LANDSCAPE_ENTERPRISE_SETUP: "true",
	LANDSCAPE_EVALUATION_PASSWORD: "fixture789",
};
async function setup() {
	const db = new PGlite();
	await migrate(db);
	await db.query("INSERT INTO operator_settings VALUES(1,'ROJ')");
	const pool = {
		connect: async () => ({
			query: async (s, p) => {
				const r = await db.query(s, p);
				return { ...r, rowCount: r.affectedRows || r.rows.length };
			},
			release() {},
		}),
		end: async () => {},
	};
	const auth = betterAuth(
		authenticationOptions(pool, {
			BETTER_AUTH_URL: "http://localhost:3042",
			BETTER_AUTH_SECRET: "fixture-private-session-secret-32-characters",
		}),
	);
	await (await getMigrations(auth.options)).runMigrations();
	const password = (await auth.$context).password;
	await provisionEvaluationUsers(
		db,
		"landscape",
		evaluationUsers,
		password,
		env,
	);
	return { db, password };
}
test("authorized Preview distribution conserves the portfolio and live resources, segments profiles and preserves native credentials", async () => {
	const { db, password } = await setup();
	try {
		await loadSampleOperations(db, {
			confirmed: true,
			actor: "fixture",
			environment: "preview",
			now: new Date("2026-11-01T23:30:00Z"),
		});
		const originalHash = (
			await db.query(
				"SELECT password FROM account WHERE \"userId\"=(SELECT user_id FROM security_local_identities WHERE email='landscape.it_admin@access.neuratec.invalid')",
			)
		).rows[0].password;
		const result = await provisionEnterpriseScenario(
			db,
			password,
			defaultProfiles,
			env,
		);
		assert.equal(
			(await db.query("SELECT count(*)::int n FROM security_companies")).rows[0]
				.n,
			3,
		);
		assert.equal(
			result.distribution.source.customers +
				result.distribution.destination.customers,
			33,
		);
		assert.equal(result.distribution.destination.employees, 9);
		assert.equal(result.distribution.source.employees, 9);
		assert.equal(result.distribution.destination.crews, 3);
		assert.equal(result.distribution.source.crews, 3);
		assert.equal(result.platformCounts.customers, 0);
		assert.equal(result.platformCounts.crews, 0);
		const root = "landscape.it_admin@access.neuratec.invalid";
		assert.equal((await availableCompanies(db, root)).length, 3);
		assert.equal(await ensureMemberCode(db, "landscape", root), "NEU001");
		assert.equal(
			(
				await db.query(
					"SELECT company_id FROM security_login_codes WHERE code='NEU001'",
				)
			).rows[0].company_id,
			result.platform_company,
		);
		assert.equal(
			(
				await db.query(
					'SELECT password FROM account WHERE "userId"=(SELECT user_id FROM security_local_identities WHERE email=$1)',
					[root],
				)
			).rows[0].password,
			originalHash,
		);
		for (const user of result.users) {
			const companies = await availableCompanies(
				db,
				(
					await db.query(
						"SELECT subject_id FROM security_login_codes WHERE code=$1",
						[user.code],
					)
				).rows[0].subject_id,
			);
			assert.equal(companies.length, 1);
			assert.equal(companies[0].id, user.company_id);
			const email = await emailForUserCode(db, user.company_id, user.code, env);
			assert.ok(email);
			assert.equal(await platformIT(db, email), false);
			const profile = await resolveSecurity(
				db,
				user.company_id,
				email,
				permissionRegistry,
			);
			assert.equal(profile.root, false);
			const hash = (
				await db.query(
					'SELECT a.password FROM account a JOIN security_local_identities i ON i.user_id=a."userId" WHERE i.email=$1',
					[email],
				)
			).rows[0].password;
			assert.equal(
				await password.verify({
					hash,
					password: env.LANDSCAPE_EVALUATION_PASSWORD,
				}),
				true,
			);
		}
		await assert.rejects(
			assignCompany(db, root, {
				company_id: result.platform_company,
				subject_id: "landscape.owner@access.neuratec.invalid",
				profile_id: "default-owner",
			}),
		);
		const evergreen = result.operators[1].id,
			port = await storageForCompany(db, evergreen),
			pending = (
				await port.query(
					"SELECT * FROM visits WHERE assignment_review_required LIMIT 1",
				)
			).rows[0];
		assert.ok(pending);
		await assert.rejects(
			changeVisit(port, {
				action: "start",
				id: pending.id,
				revision: pending.revision,
			}),
			/cuadrilla propia/,
		);
		const targetIds = (await port.query("SELECT id FROM customers")).rows.map(
			(r) => r.id,
		);
		assert.equal(
			(
				await db.query(
					"SELECT count(*)::int n FROM customers WHERE id=ANY($1::text[])",
					[targetIds],
				)
			).rows[0].n,
			0,
		);
		await provisionEvaluationUsers(
			db,
			"landscape",
			evaluationUsers,
			password,
			env,
		);
		const snapshot = JSON.stringify(result);
		assert.equal(
			await provisionEnterpriseScenario(db, password, defaultProfiles, env),
			null,
		);
		assert.deepEqual(
			(await db.query("SELECT manifest FROM security_scenarios")).rows[0]
				.manifest,
			JSON.parse(snapshot),
		);
		assert.equal(
			await provisionEnterpriseScenario(db, password, defaultProfiles, {
				...env,
				VERCEL_ENV: "production",
			}),
			null,
		);
	} finally {
		await db.close();
	}
});
test("a blocked redistribution rolls back company creation, resource edits and user credentials", async () => {
	const { db, password } = await setup();
	try {
		const before = (await db.query("SELECT count(*)::int n FROM app_members"))
			.rows[0].n;
		await db.exec(
			"INSERT INTO customers VALUES('a','Adriana'),('b','Bruno');INSERT INTO crews(id,name,workers,hourly_cents) VALUES('a','Aurora',1,2000),('b','Bosque',1,2000);INSERT INTO employees(id,code,first_name,last_name) VALUES('a','EMP001','Adriana','Luna'),('b','EMP002','Bruno','Vega');INSERT INTO crew_employees VALUES('a','a','Operador'),('b','b','Operador')",
		);
		const failing = {
			query: (s, p) => db.query(s, p),
			transaction: (fn) =>
				db.transaction((tx) =>
					fn({
						exec: (s) => tx.exec(s),
						query: (s, p) => {
							if (s.startsWith("INSERT INTO security_scenarios"))
								throw Error("injected final ledger failure");
							return tx.query(s, p);
						},
					}),
				),
		};
		await assert.rejects(
			provisionEnterpriseScenario(failing, password, defaultProfiles, env),
			/injected final ledger failure/,
		);
		assert.equal(
			(await db.query("SELECT count(*)::int n FROM customers")).rows[0].n,
			2,
		);
		assert.equal(
			(await db.query("SELECT count(*)::int n FROM crews WHERE reference_only"))
				.rows[0].n,
			0,
		);
		assert.equal(
			(
				await db.query(
					"SELECT company_id FROM security_login_codes WHERE code='NEU001'",
				)
			).rows[0].company_id,
			"landscape",
		);
		assert.equal(
			(await db.query("SELECT count(*)::int n FROM security_companies")).rows[0]
				.n,
			1,
		);
		assert.equal(
			(await db.query("SELECT count(*)::int n FROM app_members")).rows[0].n,
			before,
		);
		assert.equal(
			(
				await db.query(
					"SELECT count(*)::int n FROM pg_namespace WHERE nspname LIKE 'tenant_%'",
				)
			).rows[0].n,
			0,
		);
		assert.equal(
			(await db.query("SELECT count(*)::int n FROM security_scenarios")).rows[0]
				.n,
			0,
		);
	} finally {
		await db.close();
	}
});
