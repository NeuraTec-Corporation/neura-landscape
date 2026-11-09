import { AsyncLocalStorage } from "node:async_hooks";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const context = new AsyncLocalStorage();
export const requestTenant = () => context.getStore();
export const withTenant = (value, fn) => context.run(value, fn);
const shared = [
	"schema_migrations",
	"app_members",
	"user",
	"account",
	"session",
	"verification",
	"rateLimit",
	"media_budget",
];
const businessFiles = [
	"001_foundation.sql",
	"002_customer_profiles.sql",
	"003_property_locations.sql",
	"004_service_control.sql",
	"005_property_survey.sql",
	"007_operational_management.sql",
	"008_estimate_drafts.sql",
	"009_estimate_acceptance.sql",
	"010_ux_catalogs_samples.sql",
	"011_sample_operations.sql",
	"018_resource_ownership.sql",
];
function namespace(schema) {
	if (schema !== "public" && !/^tenant_[a-f0-9]{32}$/.test(schema))
		throw new Error("Invalid company storage namespace");
	return schema;
}
async function path(tx, schema) {
	await tx.query("SELECT set_config('search_path',$1,true)", [
		`"${namespace(schema)}",public`,
	]);
}
export async function bootstrapCompanyStorage(tx, schema) {
	namespace(schema);
	if (schema === "public") throw new Error("Cannot bootstrap shared storage");
	await tx.exec(`CREATE SCHEMA "${schema}"`);
	// Bootstrap without public fallback: CREATE IF NOT EXISTS must not resolve
	// the existing company's tables. PostgreSQL builtins remain in pg_catalog.
	await tx.query("SELECT set_config('search_path',$1,true)", [`"${schema}"`]);
	// Replay only product structure and static reference catalogs, never identity,
	// customer samples or another company's records.
	for (const file of businessFiles)
		await tx.exec(await readFile(resolve("db/migrations", file), "utf8"));
	await tx.exec(
		"CREATE TABLE app_crew_members(email text NOT NULL REFERENCES public.app_members(email),crew_id text NOT NULL REFERENCES crews(id),PRIMARY KEY(email,crew_id)); DROP TABLE media_budget;",
	);
	await tx.query("SELECT set_config('search_path','public',true)");
}
const signatureSql = `SELECT c.relname,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod) type,a.attnotnull FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid WHERE n.nspname=$1 AND c.relkind IN('r','p') AND a.attnum>0 AND NOT a.attisdropped AND NOT(c.relname=ANY($2::text[])) AND c.relname NOT LIKE 'security_%' ORDER BY c.relname,a.attnum`;
export async function assertCompanyStorage(db, schema) {
	namespace(schema);
	if (schema === "public") return;
	const expected = (await db.query(signatureSql, ["public", shared])).rows;
	const actual = (await db.query(signatureSql, [schema, shared])).rows;
	if (JSON.stringify(actual) !== JSON.stringify(expected))
		throw new Error(
			"Company storage requires a compatible migration before access",
		);
	// A product FK must never reference another company's product tables.
	const foreign = (
		await db.query(
			`SELECT r.relname,n.nspname FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class t ON t.oid=k.conrelid JOIN pg_catalog.pg_namespace tn ON tn.oid=t.relnamespace JOIN pg_catalog.pg_class r ON r.oid=k.confrelid JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace WHERE k.contype='f' AND tn.nspname=$1`,
			[schema],
		)
	).rows;
	if (
		foreign.some(
			(r) =>
				r.nspname !== schema &&
				!(r.nspname === "public" && shared.includes(r.relname)),
		)
	)
		throw new Error("Foreign company relationship rejected");
}
export function companyDatabase(db, schema) {
	namespace(schema);
	const transaction = (fn) =>
		db.transaction(async (tx) => {
			await path(tx, schema);
			return fn(tx);
		});
	return {
		query: (sql, params = []) => transaction((tx) => tx.query(sql, params)),
		exec: (sql) => transaction((tx) => tx.exec(sql)),
		transaction,
	};
}
