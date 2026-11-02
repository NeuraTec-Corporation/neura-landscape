import { postgresDatabase } from "../src/modules/operations/postgres.mjs";
import { migrate } from "../src/modules/operations/migrations.mjs";
if (!process.env.DATABASE_URL)
	throw new Error("DATABASE_URL is required. No credentials are printed.");
const db = postgresDatabase(process.env.DATABASE_URL);
try {
	await migrate(db, true);
	console.log("PostgreSQL migrations through 007 completed.");
} finally {
	await db.close();
}
