import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const files = [
	"001_foundation.sql",
	"002_customer_profiles.sql",
	"003_property_locations.sql",
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
	});
}
