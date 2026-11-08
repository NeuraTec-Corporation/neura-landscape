import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import {
	authenticationOptions,
	memberForSession,
} from "../src/modules/identity/auth.mjs";
import {
	operatorPrefix,
	ensureMemberCode,
	emailForUserCode,
	provisionEvaluationUsers,
} from "../src/modules/identity/user-codes.mjs";
import { evaluationUsers } from "../src/app/_evaluation-users.mjs";
import {
	enrollMembership,
	resolveSecurity,
} from "../src/modules/security/index.mjs";
import { permissionRegistry } from "../src/app/_security-manifest.mjs";
import { migrate } from "../src/modules/operations/migrations.mjs";
const env = {
	VERCEL: "1",
	VERCEL_ENV: "preview",
	LANDSCAPE_EVALUATION_USERS: "true",
	LANDSCAPE_EVALUATION_PASSWORD: "fixt789",
};
async function setup() {
	const db = new PGlite();
	await migrate(db);
	await db.query("INSERT INTO operator_settings(id,code) VALUES(1,'ROJAS')");
	const pool = {
		connect: async () => ({
			query: async (sql, params) => {
				const r = await db.query(sql, params);
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
	return { db, auth, password: (await auth.$context).password };
}
test("operator codes are stable, sequential and unique under concurrent allocation", async () => {
	assert.equal(operatorPrefix("Rojas"), "ROJ");
	assert.equal(operatorPrefix("Árboles del Norte"), "ARB");
	const { db } = await setup();
	try {
		for (const email of ["isabel@example.invalid", "valeria@example.invalid"]) {
			await db.query(
				"INSERT INTO app_members(email,name,role,status) VALUES($1,'Persona','manager','active')",
				[email],
			);
			await enrollMembership(db, "landscape", email, ["default-manager"]);
		}
		const codes = await Promise.all([
			ensureMemberCode(db, "landscape", "isabel@example.invalid"),
			ensureMemberCode(db, "landscape", "valeria@example.invalid"),
		]);
		assert.deepEqual([...codes].sort(), ["ROJ001", "ROJ002"]);
		await db.query("UPDATE operator_settings SET code='OTRA' WHERE id=1");
		assert.equal(
			await ensureMemberCode(db, "landscape", "isabel@example.invalid"),
			codes[0],
		);
		await migrate(db);
		assert.equal(
			(await db.query("SELECT last_sequence FROM security_company_logins"))
				.rows[0].last_sequence,
			2,
		);
	} finally {
		await db.close();
	}
});
test("six configured profiles receive usable code credentials without Google; replay never resets them", async () => {
	const { db, auth, password } = await setup();
	try {
		const result = await provisionEvaluationUsers(
			db,
			"landscape",
			evaluationUsers,
			password,
			env,
		);
		assert.equal(result.length, 6);
		const rows = (
			await db.query(
				'SELECT m.email,m.name,m.role,l.code,a.password FROM app_members m JOIN security_login_codes l ON l.subject_id=m.email JOIN security_local_identities i ON i.email=m.email JOIN account a ON a."userId"=i.user_id ORDER BY l.code',
			)
		).rows;
		assert.deepEqual(
			rows.map((r) => r.code),
			["ROJ001", "ROJ002", "ROJ003", "ROJ004", "ROJ005", "ROJ006"],
		);
		for (const row of rows) {
			assert.equal(
				await password.verify({
					hash: row.password,
					password: env.LANDSCAPE_EVALUATION_PASSWORD,
				}),
				true,
			);
			assert.equal(
				await emailForUserCode(db, "landscape", row.code.toLowerCase(), env),
				row.email,
			);
			const access = await resolveSecurity(
				db,
				"landscape",
				row.email,
				permissionRegistry,
			);
			assert.equal(access.profiles.length, 1);
			assert.equal(access.profiles[0].system_key, row.role);
		}
		for (const role of ["it_admin", "worker"]) {
			const row = rows.find((r) => r.role === role),
				email = await emailForUserCode(db, "landscape", row.code, env);
			const login = await auth.handler(
				new Request("http://localhost:3042/api/auth/sign-in/email", {
					method: "POST",
					headers: {
						host: "localhost:3042",
						origin: "http://localhost:3042",
						"content-type": "application/json",
					},
					body: JSON.stringify({
						email,
						password: env.LANDSCAPE_EVALUATION_PASSWORD,
					}),
				}),
			);
			assert.equal(login.status, 200, await login.clone().text());
			const cookie = login.headers
				.getSetCookie()
				.map((v) => v.split(";")[0])
				.join("; ");
			const session = await auth.api.getSession({
				headers: new Headers({ cookie }),
			});
			assert.ok(session);
			assert.equal((await memberForSession(db, session, "", env)).email, email);
			assert.equal(
				await memberForSession(db, session, "", {
					...env,
					VERCEL_ENV: "production",
				}),
				null,
			);
			const access = await resolveSecurity(
				db,
				"landscape",
				email,
				permissionRegistry,
			);
			assert.equal(access.scope, role === "worker" ? "assigned" : "company");
			assert.equal(
				access.grants.includes("security.update"),
				role === "it_admin",
			);
		}
		const snapshot = JSON.stringify(rows);
		assert.deepEqual(
			await provisionEvaluationUsers(
				db,
				"landscape",
				evaluationUsers,
				password,
				env,
			),
			[],
		);
		assert.equal(
			JSON.stringify(
				(
					await db.query(
						'SELECT m.email,m.name,m.role,l.code,a.password FROM app_members m JOIN security_login_codes l ON l.subject_id=m.email JOIN security_local_identities i ON i.email=m.email JOIN account a ON a."userId"=i.user_id ORDER BY l.code',
					)
				).rows,
			),
			snapshot,
		);
		const audit = JSON.stringify(
			(
				await db.query(
					"SELECT * FROM security_audit WHERE entity='evaluation_user'",
				)
			).rows,
		);
		assert.equal(audit.includes(env.LANDSCAPE_EVALUATION_PASSWORD), false);
	} finally {
		await db.close();
	}
});
test("code resolution denies disabled and foreign memberships and evaluation credentials are preview-only", async () => {
	const { db, password } = await setup();
	try {
		assert.deepEqual(
			await provisionEvaluationUsers(
				db,
				"landscape",
				evaluationUsers,
				password,
				{ ...env, VERCEL_ENV: "production" },
			),
			[],
		);
		await provisionEvaluationUsers(
			db,
			"landscape",
			evaluationUsers.slice(0, 1),
			password,
			env,
		);
		const row = (await db.query("SELECT * FROM security_login_codes")).rows[0];
		assert.equal(await emailForUserCode(db, "other", row.code, env), null);
		assert.equal(
			await emailForUserCode(db, "landscape", row.code, {
				...env,
				LANDSCAPE_EVALUATION_USERS: "false",
			}),
			null,
		);
		assert.equal(
			await emailForUserCode(db, "landscape", row.code, {
				...env,
				VERCEL_ENV: "production",
			}),
			null,
		);
		await db.query("UPDATE app_members SET status='disabled' WHERE email=$1", [
			row.subject_id,
		]);
		assert.equal(await emailForUserCode(db, "landscape", row.code, env), null);
		await db.query("UPDATE app_members SET status='active' WHERE email=$1", [
			row.subject_id,
		]);
		await db.query(
			"UPDATE security_memberships SET status='disabled' WHERE subject_id=$1",
			[row.subject_id],
		);
		assert.equal(await emailForUserCode(db, "landscape", row.code, env), null);
	} finally {
		await db.close();
	}
});
