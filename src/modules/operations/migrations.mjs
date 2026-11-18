import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const files = [
	"001_foundation.sql",
	"002_customer_profiles.sql",
	"003_property_locations.sql",
	"004_service_control.sql",
	"005_property_survey.sql",
	"006_identity_roles.sql",
	"007_operational_management.sql",
	"008_estimate_drafts.sql",
	"009_estimate_acceptance.sql",
	"010_ux_catalogs_samples.sql",
	"011_sample_operations.sql",
	"012_sample_identities.sql",
	"013_security_profiles.sql",
	"014_local_access.sql",
	"015_user_codes.sql",
	"016_platform_admin.sql",
	"017_companies.sql",
	"018_resource_ownership.sql",
	"019_enterprise_scenario.sql",
	"020_visit_resources.sql",
	"021_crew_execution.sql",
	"022_resource_cost_baseline.sql",
	"023_working_calendar.sql",
	"024_inventory.sql",
	"025_customer_engagement.sql",
	"026_engagement_permissions.sql",
	"027_assignment_controls.sql",
	"028_warehouses.sql",
	"029_delivery_outbox.sql",
];
export async function migrate(db, advisory = false) {
	await db.transaction(async (tx) => {
		if (advisory) await tx.query("SELECT pg_advisory_xact_lock(703919)");
		await tx.exec(
			"CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY)",
		);
		const applied = new Set(
			(await tx.query("SELECT version FROM schema_migrations")).rows.map(
				(row) => row.version,
			),
		);
		for (const file of files)
			if (!applied.has(Number(file.slice(0, 3))))
				await tx.exec(await readFile(resolve("db/migrations", file), "utf8"));
		// Business deltas must reach already-existing company namespaces too.
		// New namespaces include this delta in the trusted bootstrap list.
		const companies = (
			await tx.query(
				"SELECT schema_name FROM security_company_storage WHERE schema_name<>'public'",
			)
		).rows;
		for (const company of companies) {
			const schema = company.schema_name;
			if (!/^tenant_[a-f0-9]{32}$/.test(schema))
				throw Error("Invalid company migration namespace");
			for(const [version,file] of [[18,"018_resource_ownership.sql"],[20,"020_visit_resources.sql"],[22,"022_resource_cost_baseline.sql"],[23,"023_working_calendar.sql"],[24,"024_inventory.sql"],[25,"025_customer_engagement.sql"],[27,"027_assignment_controls.sql"],[28,"028_warehouses.sql"],[29,"029_delivery_outbox.sql"]]) if (
				!(
					await tx.query(
						`SELECT version FROM "${schema}".schema_migrations WHERE version=$1`,[version],
					)
				).rows.length
			) {
				await tx.query("SELECT set_config('search_path',$1,true)", [
					`"${schema}"`,
				]);
				await tx.exec(
					await readFile(
						resolve("db/migrations", file),
						"utf8",
					),
				);
				await tx.query("SELECT set_config('search_path','public',true)");
			}
		}
	});
}
