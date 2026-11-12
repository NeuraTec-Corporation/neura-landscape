import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { authenticationOptions } from "../src/modules/identity/auth.mjs";
import { postgresDatabase } from "../src/modules/operations/postgres.mjs";
import { migrate } from "../src/modules/operations/migrations.mjs";
import { saveCompany, storageForCompany } from "../src/modules/identity/companies.mjs";
import { defaultProfiles } from "../src/app/_security-manifest.mjs";
import { saveEmployee } from "../src/modules/operations/workforce.mjs";
import { loadSampleOperations } from "../src/modules/operations/sample-operations.mjs";

// This runner never accepts a hosted application URL or database name.
// It creates its own disposable databases on loopback and deletes only those.
const config = {
	host: "127.0.0.1",
	port: 5432,
	user: "postgres",
	password: process.env.LANDSCAPE_DRILL_PASSWORD,
	database: "postgres",
};
assert.equal(process.env.LANDSCAPE_POSTGRES_DRILL, "local-disposable-only");
assert.ok(config.password, "A disposable local PostgreSQL password is required");
const suffix = randomBytes(8).toString("hex");
const sourceName = `landscape_drill_${suffix}`;
const restoreName = `landscape_drill_${suffix}_restore`;
const names = [sourceName, restoreName];
const admin = new Pool(config);
const directory = await mkdtemp(join(tmpdir(), "landscape-drill-"));
const databases = [];
const connections = [];
const started = performance.now();
const root = "operator@recovery.invalid";
let report;
const quote = (name) => `"${name.replaceAll('"', '""')}"`;
function connect(name) {
	const url = new URL("postgresql://127.0.0.1:5432");
	url.username = config.user;
	url.password = config.password;
	url.pathname = `/${name}`;
	const db = postgresDatabase(url.toString());
	connections.push(db);
	return db;
}
function command(program, args, database) {
	execFileSync(program, args, {
		env: {
			...process.env,
			PGHOST: config.host,
			PGPORT: String(config.port),
			PGUSER: config.user,
			PGPASSWORD: config.password,
			PGDATABASE: database,
		},
		stdio: "pipe",
		timeout: 120000,
	});
}
async function fingerprint(db) {
	const tables = (await db.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname='public' OR schemaname LIKE 'tenant_%' ORDER BY 1,2")).rows;
	const hash = createHash("sha256");
	let rows = 0;
	for (const table of tables) {
		const result = await db.query(`SELECT to_jsonb(t)::text AS data FROM ${quote(table.schemaname)}.${quote(table.tablename)} t ORDER BY to_jsonb(t)::text`);
		hash.update(JSON.stringify([table, result.rows]));
		rows += result.rows.length;
	}
	const structure = (await db.query("SELECT table_schema,table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' OR table_schema LIKE 'tenant_%' ORDER BY 1,2,ordinal_position")).rows;
	const constraints = (await db.query("SELECT n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid) definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' OR n.nspname LIKE 'tenant_%' ORDER BY 1,2,3")).rows;
	const sequences = [];
	for (const sequence of (await db.query("SELECT schemaname,sequencename FROM pg_sequences WHERE schemaname='public' OR schemaname LIKE 'tenant_%' ORDER BY 1,2")).rows) {
		sequences.push([sequence, (await db.query(`SELECT last_value::text,is_called FROM ${quote(sequence.schemaname)}.${quote(sequence.sequencename)}`)).rows]);
	}
	hash.update(JSON.stringify([structure, constraints, sequences]));
	return { tables: tables.length, rows, sha256: hash.digest("hex") };
}
async function dropClosedDatabase(name) {
	for (let attempt = 0; ; attempt++) {
		try {
			await admin.query(`DROP DATABASE ${quote(name)}`);
			return;
		} catch (error) {
			if (error.code !== "55006" || attempt === 49) throw error;
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}
}
try {
	for (const name of names) {
		assert.match(name, /^landscape_drill_[a-f0-9]{16}(_restore)?$/);
		await admin.query(`CREATE DATABASE ${quote(name)}`);
		databases.push(name);
	}
	const db = connect(sourceName);
	// Two real pooled connections must serialize the migration lock.
	await Promise.all([migrate(db, true), migrate(db, true)]);
	assert.equal((await db.query("SELECT count(*)::int n FROM schema_migrations")).rows[0].n, 22);
	const identityPool = new Pool({ ...config, database: sourceName });
	try {
		const auth = betterAuth(authenticationOptions(identityPool, {
			BETTER_AUTH_URL: "http://localhost:3042",
			BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
		}));
		await (await getMigrations(auth.options)).runMigrations();
		await identityPool.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())', ["recovery-identity", "Marina Alder", "marina@recovery.invalid"]);
	} finally {
		await identityPool.end();
	}
	await db.query("INSERT INTO app_members VALUES($1,'Recovery Operator','it_admin','active',1)", [root]);
	await db.query("INSERT INTO security_platform_admins(subject_id) VALUES($1)", [root]);
	const company = await saveCompany(db, root, { name: "Cedar Grounds", prefix: "CED", status: "active" }, defaultProfiles);
	const first = await storageForCompany(db, "landscape");
	const second = await storageForCompany(db, company.id);
	await loadSampleOperations(first, { confirmed: true, actor: root, environment: "preview", now: new Date("2026-11-09T12:00:00Z") });
	await loadSampleOperations(second, { confirmed: true, actor: root, environment: "preview", now: new Date("2026-11-09T12:00:00Z") });
	const property = (await second.query("SELECT id FROM properties LIMIT 1")).rows[0].id;
	await second.query("INSERT INTO property_photos(id,property_id,viewpoint,caption,pathname,width,height,bytes) VALUES('recovery-photo',$1,'front','Synthetic binary preservation','recovery/private',1,1,4)", [property]);
	await second.query("INSERT INTO property_photo_data VALUES('recovery-photo',$1)", [Buffer.from([0, 127, 128, 255])]);
	const paths = await Promise.all(Array.from({ length: 3 }, () => db.query("SHOW search_path")));
	const initialPath = paths[0].rows[0].search_path;
	assert.ok(paths.every((r) => r.rows[0].search_path === initialPath));
	const jobs = await Promise.all(Array.from({ length: 48 }, async (_, i) => {
		const tenant = i % 2 ? second : first;
		return tenant.transaction(async (tx) => {
			const connection = (await tx.query("SELECT pg_backend_pid() pid")).rows[0].pid;
			await tx.query("INSERT INTO entity_sequences(entity,year,value) VALUES('concurrency_drill',2026,1) ON CONFLICT(entity,year) DO UPDATE SET value=entity_sequences.value+1");
			const scope = (await tx.query("SELECT current_schema() scope")).rows[0].scope;
			assert.equal(scope === "public", i % 2 === 0);
			return connection;
		});
	}));
	assert.ok(new Set(jobs).size > 1, "The drill must exercise multiple PostgreSQL connections");
	for (const tenant of [first, second]) {
		assert.equal((await tenant.query("SELECT value FROM entity_sequences WHERE entity='concurrency_drill'")).rows[0].value, 24);
		await assert.rejects(tenant.transaction(async (tx) => {
			await tx.query("UPDATE entity_sequences SET value=999 WHERE entity='concurrency_drill'");
			throw new Error("rollback-drill");
		}), /rollback-drill/);
		assert.equal((await tenant.query("SELECT value FROM entity_sequences WHERE entity='concurrency_drill'")).rows[0].value, 24);
	}
	// Real service-level optimistic revision race: exactly one update wins.
	const employee = (await second.query("SELECT * FROM employees WHERE deleted_at IS NULL LIMIT 1")).rows[0];
	const input = { id: employee.id, revision: employee.revision, first_name: employee.first_name, last_name: employee.last_name, email: "", phone: "", role_key: employee.role_key, skills: "", hourly: 25, status: "active" };
	const race = await Promise.allSettled([saveEmployee(second, { ...input, skills: "alpha" }), saveEmployee(second, { ...input, skills: "beta" })]);
	assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
	assert.equal(race.find((r) => r.status === "rejected").reason.status, 409);
	assert.equal((await second.query("SELECT revision FROM employees WHERE id=$1", [employee.id])).rows[0].revision, employee.revision + 1);
	for (let i = 0; i < 6; i++) assert.equal((await db.query("SHOW search_path")).rows[0].search_path, initialPath);
	const backup = join(directory, "snapshot.dump");
	const before = await fingerprint(db);
	command("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--file", backup], sourceName);
	command("pg_restore", ["--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges", "--dbname", restoreName, backup], restoreName);
	const restored = connect(restoreName);
	assert.deepEqual(await fingerprint(restored), before);
	const recovered = await storageForCompany(restored, company.id);
	assert.equal((await recovered.query("SELECT value FROM entity_sequences WHERE entity='concurrency_drill'")).rows[0].value, 24);
	// Identity-backed audit sequence remains usable after restore.
	const nextEmployee = await saveEmployee(recovered, { ...input, id: undefined, revision: undefined, first_name: "Marina", last_name: "Alder" });
	assert.ok(nextEmployee.id);
	report = { status: "passed", engine: (await db.query("SHOW server_version")).rows[0].server_version, simultaneousJobs: 48, pooledConnections: new Set(jobs).size, revisionRace: "one success, one 409", restore: before, postRestoreWrite: true, elapsedSeconds: Math.round((performance.now() - started) / 1000), scope: "disposable synthetic PostgreSQL; not hosted backup or production capacity certification" };
} finally {
	try {
		await Promise.all(connections.map((db) => db.close()));
		// pg Pool.end can resolve before PostgreSQL has processed socket closure.
		// Never FORCE-terminate a closing client: that races its idle error handler.
		for (const name of databases.reverse()) await dropClosedDatabase(name);
	} finally {
		await admin.end();
		await rm(directory, { recursive: true, force: true });
	}
}
// A successful drill includes successful cleanup, not just successful assertions.
console.log(JSON.stringify({ ...report, cleanup: "databases and temporary dump removed" }));
