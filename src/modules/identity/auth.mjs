import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { getMigrations } from "better-auth/db/migration";
import { Pool } from "pg";
import { database } from "../operations/index.mjs";
export function authConfigured() {
	return Boolean(
		process.env.GOOGLE_CLIENT_ID &&
			process.env.GOOGLE_CLIENT_SECRET &&
			process.env.BETTER_AUTH_SECRET &&
			process.env.BETTER_AUTH_URL &&
			process.env.DATABASE_URL,
	);
}
let instance;
export async function authentication() {
	if (!authConfigured()) throw new Error("Google OAuth no está configurado.");
	if (!instance)
		instance = (async () => {
			await database();
			const pool = new Pool({
				connectionString: process.env.DATABASE_URL,
				max: 3,
			});
			const auth = betterAuth({
				database: pool,
				baseURL: process.env.BETTER_AUTH_URL,
				secret: process.env.BETTER_AUTH_SECRET,
				emailAndPassword: { enabled: false },
				socialProviders: {
					google: {
						clientId: process.env.GOOGLE_CLIENT_ID,
						clientSecret: process.env.GOOGLE_CLIENT_SECRET,
						prompt: "select_account",
					},
				},
				account: { accountLinking: { enabled: false } },
				session: { expiresIn: 60 * 60 * 12, cookieCache: { enabled: false } },
				rateLimit: { enabled: true, storage: "database" },
				plugins: [nextCookies()],
			});
			const client = await pool.connect();
			try {
				await client.query("SELECT pg_advisory_lock(703920)");
				const migration = await getMigrations(auth.options);
				await migration.runMigrations();
			} finally {
				await client.query("SELECT pg_advisory_unlock(703920)");
				client.release();
			}
			return auth;
		})();
	return instance;
}
export async function memberForSession(db, session, bootstrapEmail = "") {
	if (!session?.user?.emailVerified || !session.user.email) return null;
	const email = session.user.email.toLowerCase();
	if (bootstrapEmail && email === bootstrapEmail.toLowerCase())
		await db.query(
			"INSERT INTO app_members(email,name,role,status) VALUES($1,$2,'it_admin','active') ON CONFLICT(email) DO NOTHING",
			[email, session.user.name || email],
		);
	const member = (
		await db.query(
			"SELECT * FROM app_members WHERE email=$1 AND status='active'",
			[email],
		)
	).rows[0];
	return member || null;
}
export function canUse(role, path, method = "GET") {
	if (["it_admin", "owner"].includes(role)) return true;
	if (path === "/api/me" || path === "/api/my-work") return true;
	if (path === "/api/users") return false;
	if (["worker", "crew_lead"].includes(role))
		return path === "/api/survey" || path === "/api/photos";
	if (role === "manager") return !["/api/operator"].includes(path);
	if (role === "finance")
		return (
			method === "GET" && ["/api/contracts", "/api/operations"].includes(path)
		);
	return false;
}

export function canManage(role, area, method) {
	if (
		![
			"workforce",
			"visits",
			"costs",
			"finance",
			"dashboard",
			"settings",
		].includes(area)
	)
		return false;
	if (["it_admin", "owner"].includes(role)) return true;
	if (role === "manager")
		return (
			["workforce", "visits", "costs", "dashboard"].includes(area) ||
			(area === "finance" && method === "GET")
		);
	if (role === "finance")
		return (
			["finance", "costs"].includes(area) ||
			(area === "dashboard" && method === "GET")
		);
	return false;
}
