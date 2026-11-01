import { readFile } from "node:fs/promises";
import { postgresDatabase } from "../src/modules/operations/postgres.mjs";
if (!process.env.DATABASE_URL)
	throw new Error("DATABASE_URL is required. No credentials are printed.");
const db = postgresDatabase(process.env.DATABASE_URL);
try {
	await db.transaction(async (tx) => {
		await tx.query("SELECT pg_advisory_xact_lock(703919)");
		for (const file of ["001_foundation.sql", "002_customer_profiles.sql"])
			await tx.exec(
				await readFile(
					new URL(`../db/migrations/${file}`, import.meta.url),
					"utf8",
				),
			);
	});
	console.log("PostgreSQL migrations 001 and 002 completed.");
} finally {
	await db.close();
}
