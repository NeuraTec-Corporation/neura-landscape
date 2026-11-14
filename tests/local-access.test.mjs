import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import {
	authenticationOptions,
	prepareIdentitySchema,
	memberForSession,
} from "../src/modules/identity/auth.mjs";
import { localAccessService } from "../src/modules/identity/local-access.mjs";
import { permissionRegistry } from "../src/app/_security-manifest.mjs";
import { migrate } from "../src/modules/operations/migrations.mjs";
import {
	enrollMembership,
	resolveSecurity,
} from "../src/modules/security/index.mjs";
const ctx = { companyId: "landscape", subjectId: "irene@example.invalid" };
const email = "marcos@example.invalid",
	secret = "Una frase privada para Marcos 2026";
async function setup() {
	const db = new PGlite();
	await migrate(db);
	// pg-compatible test transport. All SQL/schema/session operations are real PGlite;
	// this is not a hosted PostgreSQL concurrency assertion.
	const client = {
		query: async (sql, params) => {
			const r = await db.query(sql, params);
			return { ...r, rowCount: r.affectedRows || r.rows.length };
		},
		release() {},
	};
	const pool = { connect: async () => client, end: async () => {} };
	const auth = betterAuth(
		authenticationOptions(pool, {
			BETTER_AUTH_URL: "http://localhost:3042",
			BETTER_AUTH_SECRET:
				"private-fixture-session-secret-minimum-32-characters",
		}),
	);
	const migrations = await getMigrations(auth.options);
	await migrations.runMigrations();
	for (const [e, role] of [
		[ctx.subjectId, "it_admin"],
		[email, "manager"],
	]) {
		await db.query(
			"INSERT INTO app_members(email,name,role,status) VALUES($1,$2,$3,'active')",
			[e, e.split("@")[0], role],
		);
		await enrollMembership(db, "landscape", e, [`default-${role}`]);
	}
	const service = localAccessService(
		db,
		permissionRegistry,
		(await auth.$context).password,
	);
	const request = async (path, body, cookie = "") =>
		auth.handler(
			new Request(`http://localhost:3042/api/auth/${path}`, {
				method: body ? "POST" : "GET",
				headers: {
					host: "localhost:3042",
					origin: "http://localhost:3042",
					...(body ? { "content-type": "application/json" } : {}),
					...(cookie ? { cookie } : {}),
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			}),
		);
	return { db, auth, service, request };
}
test("local invitation establishes a Better Auth credential without Google and recovery revokes sessions", async () => {
	const { db, auth, service, request } = await setup();
	try {
		const link = await service.issue(ctx, email);
		assert.equal(
			JSON.stringify(
				(await db.query("SELECT * FROM security_access_links")).rows,
			).includes(link.token),
			false,
		);
		assert.equal(
			(
				await request("sign-up/email", {
					email: "outsider@example.invalid",
					name: "Outside",
					password: secret,
				})
			).status,
			400,
		);
		await assert.rejects(service.redeem(link.token, "short"));
		await service.redeem(link.token, secret);
		await assert.rejects(service.redeem(link.token, secret));
		const account = (
			await db.query(
				"SELECT password FROM account WHERE \"providerId\"='credential'",
			)
		).rows[0];
		assert.notEqual(account.password, secret);
		assert.equal(
			await (await auth.$context).password.verify({
				hash: account.password,
				password: secret,
			}),
			true,
		);
		assert.equal(
			(
				await request("sign-in/email", {
					email,
					password: "Incorrecta y muy larga",
				})
			).status,
			401,
		);
		const login = await request("sign-in/email", { email, password: secret });
		assert.equal(login.status, 200, await login.clone().text());
		const cookie = login.headers
			.getSetCookie()
			.map((v) => v.split(";")[0])
			.join("; ");
		assert.ok(cookie);
		const session = await (await request("get-session", null, cookie)).json();
		assert.equal(session.user.email, email);
		assert.equal(session.user.emailVerified, false);
		const member = await memberForSession(db, session);
		assert.equal(member.email, email);
		const permissions = await resolveSecurity(
			db,
			"landscape",
			member.email,
			permissionRegistry,
		);
		assert.ok(permissions.grants.includes("customers.create"));
		assert.equal(permissions.root, false);
		const recovery = await service.issue(ctx, email);
		await service.redeem(
			recovery.token,
			"Otra frase privada larga para Marcos",
		);
		assert.equal(
			await (await request("get-session", null, cookie)).json(),
			null,
		);
		assert.equal(
			(await request("sign-in/email", { email, password: secret })).status,
			401,
		);
		assert.equal(
			(await request("sign-in/email", { email, password: secret })).status,
			429,
		);
		// Recovery does not bypass the provider's persistent login rate limit.
		await db.query('DELETE FROM "rateLimit"');
		assert.equal(
			(
				await request("sign-in/email", {
					email,
					password: "Otra frase privada larga para Marcos",
				})
			).status,
			200,
		);
		await db.query("UPDATE app_members SET status='disabled' WHERE email=$1", [
			email,
		]);
		assert.equal(await memberForSession(db, session), null);
		const audit = JSON.stringify(
			(await db.query("SELECT * FROM security_audit WHERE entity='credential'"))
				.rows,
		);
		assert.equal(audit.includes(secret), false);
		assert.equal(audit.includes(link.token), false);
	} finally {
		await db.close();
	}
});
test("activation links expire, supersede, bind revisions, obey current grants and roll back on failure", async () => {
	const { db, service } = await setup();
	try {
		const first = await service.issue(ctx, email),
			second = await service.issue(ctx, email);
		await assert.rejects(service.redeem(first.token, secret));
		await db.query(
			"UPDATE security_access_links SET expires_at=now()-interval '1 minute' WHERE used_at IS NULL",
		);
		await assert.rejects(service.redeem(second.token, secret));
		const revised = await service.issue(ctx, email);
		await db.query(
			"UPDATE app_members SET revision=revision+1 WHERE email=$1",
			[email],
		);
		await assert.rejects(service.redeem(revised.token, secret));
		await assert.rejects(
			service.issue(
				{ companyId: "landscape", subjectId: email },
				ctx.subjectId,
			),
		);
		await db.query(
			"INSERT INTO security_companies(id,name,status,operational_enabled) VALUES('other','Otra empresa','active',false)",
		);
		await enrollMembership(db, "other", email, []);
		await assert.rejects(service.issue(ctx, email), /varias empresas/);
		await db.query(
			"UPDATE security_memberships SET status='disabled' WHERE company_id='other'",
		);
		const active = await service.issue(ctx, email);
		await db.query(
			"UPDATE security_memberships SET status='disabled' WHERE subject_id=$1",
			[ctx.subjectId],
		);
		await assert.rejects(service.redeem(active.token, secret));
		assert.equal(
			(await db.query("SELECT * FROM security_local_identities")).rows.length,
			0,
		);
		await db.query(
			"UPDATE security_memberships SET status='active' WHERE subject_id=$1",
			[ctx.subjectId],
		);
		await db.exec(
			"CREATE FUNCTION reject_local_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END $$; CREATE TRIGGER reject_local BEFORE INSERT ON security_local_identities FOR EACH ROW EXECUTE FUNCTION reject_local_identity();",
		);
		await assert.rejects(service.redeem(active.token, secret));
		assert.equal((await db.query('SELECT * FROM "user"')).rows.length, 0);
		assert.equal(
			(
				await db.query(
					"SELECT * FROM security_access_links WHERE used_at IS NULL AND expires_at>now()",
				)
			).rows.length,
			1,
		);
	} finally {
		await db.close();
	}
});
test("adding a local credential preserves an existing Google identity and account", async () => {
	const { db, service, request } = await setup();
	try {
		await db.query(
			'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES(\'google-existing\',\'Marcos\',$1,true,now(),now())',
			[email],
		);
		await db.query(
			'INSERT INTO account(id,"userId","accountId","providerId","createdAt","updatedAt") VALUES(\'google-account\',\'google-existing\',\'google-subject\',\'google\',now(),now())',
		);
		const link = await service.issue(ctx, email);
		await service.redeem(link.token, secret);
		assert.equal(
			(await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0]
				.id,
			"google-existing",
		);
		assert.deepEqual(
			(
				await db.query('SELECT "providerId" FROM account ORDER BY "providerId"')
			).rows.map((r) => r.providerId),
			["credential", "google"],
		);
		assert.equal(
			(await request("sign-in/email", { email, password: secret })).status,
			200,
		);
	} finally {
		await db.close();
	}
});

test("concurrent redemption consumes a bearer link only once", async () => {
	const { db, service } = await setup();
	try {
		const link = await service.issue(ctx, email);
		const result = await Promise.allSettled([
			service.redeem(link.token, secret),
			service.redeem(link.token, secret),
		]);
		assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
		assert.equal(result.filter((r) => r.status === "rejected").length, 1);
		assert.equal(
			(
				await db.query(
					"SELECT * FROM account WHERE \"providerId\"='credential'",
				)
			).rows.length,
			1,
		);
	} finally {
		await db.close();
	}
});

test("identity initialization coordinates migrations with a transaction-scoped lock and releases on failure", async () => {
	for (const failure of [false, true]) {
		const events = [];
		const pool = {
			connect: async () => ({
				query: async (sql) => {
					events.push(sql);
				},
				release: () => events.push("release"),
			}),
		};
		const fn = prepareIdentitySchema(pool, {}, async () => ({
			runMigrations: async () => {
				events.push("migrate");
				if (failure) throw Error("fixture");
			},
		}));
		if (failure) await assert.rejects(fn, /fixture/);
		else await fn;
		assert.equal(events[0], "BEGIN");
		assert.ok(events.some((v) => v.includes("pg_advisory_xact_lock")));
		assert.equal(
			events.some((v) => v.includes("pg_advisory_unlock(")),
			false,
		);
		assert.deepEqual(events.slice(-2), [
			failure ? "ROLLBACK" : "COMMIT",
			"release",
		]);
	}
});
