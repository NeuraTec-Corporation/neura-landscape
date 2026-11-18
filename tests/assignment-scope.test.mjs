import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/modules/operations/migrations.mjs";
import {
	assignedWork,
	assignedProperty,
} from "../src/modules/identity/assignments.mjs";
test("crew list and direct resource scope revoke archived, inactive and disabled assignments", async () => {
	const db = new PGlite();
	await migrate(db);
	try {
		await db.exec(
			"INSERT INTO customers VALUES('c','QA'); INSERT INTO properties(id,customer_id,name,address) VALUES('p','c','QA','QA'); INSERT INTO contracts(id,property_id,service,frequency,monthly_cents,visits_per_month,estimated_minutes) VALUES('k','p','QA','Mensual',10000,1,30); INSERT INTO crews(id,name,workers,hourly_cents) VALUES('g','QA',1,2000); INSERT INTO visits(id,contract_id,crew_id,scheduled_at,route_order) VALUES('v','k','g',now(),1); INSERT INTO app_members VALUES('qa@example.invalid','QA','worker','active',1); INSERT INTO app_crew_members VALUES('qa@example.invalid','g');",
		);
		const check = async (allowed) => {
			assert.equal(
				(await assignedWork(db, "qa@example.invalid")).length,
				allowed ? 1 : 0,
			);
			assert.equal(
				await assignedProperty(db, "qa@example.invalid", "p"),
				allowed,
			);
		};
		await check(true);
		for (const [off, on] of [
			[
				"UPDATE visits SET deleted_at=now()",
				"UPDATE visits SET deleted_at=NULL",
			],
			[
				"UPDATE visits SET status='cancelled'",
				"UPDATE visits SET status='scheduled'",
			],
			[
				"UPDATE visits SET status='completed'",
				"UPDATE visits SET status='scheduled'",
			],
			[
				"UPDATE contracts SET deleted_at=now()",
				"UPDATE contracts SET deleted_at=NULL",
			],
			[
				"UPDATE contracts SET status='ended'",
				"UPDATE contracts SET status='active'",
			],
			[
				"UPDATE properties SET deleted_at=now()",
				"UPDATE properties SET deleted_at=NULL",
			],
			[
				"UPDATE properties SET status='inactive'",
				"UPDATE properties SET status='active'",
			],
			["UPDATE crews SET deleted_at=now()", "UPDATE crews SET deleted_at=NULL"],
			[
				"UPDATE app_members SET status='disabled'",
				"UPDATE app_members SET status='active'",
			],
		]) {
			await db.exec(off);
			await check(false);
			await db.exec(on);
			await check(true);
		}
		// Legacy global role is not company authority; the route checks the
		// selected company's profiles before invoking this scoped data function.
		await db.exec("UPDATE app_members SET role='finance'");
		await check(true);
		await db.exec("DELETE FROM app_crew_members");
		await check(false);
		assert.equal(
			(await db.query("SELECT count(*)::int n FROM visits")).rows[0].n,
			1,
		);
	} finally {
		await db.close();
	}
});
