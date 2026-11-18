import { Pool } from "pg";
export function postgresDatabase(connectionString) {
	const pool = new Pool({
		connectionString,
		max: 3,
		connectionTimeoutMillis: 10000,
		idleTimeoutMillis: 10000,
	});
	return {
		query: (sql, params = []) => pool.query(sql, params),
		exec: (sql) => pool.query(sql),
		async transaction(callback) {
			const client = await pool.connect();
			try {
				await client.query("BEGIN");
				const result = await callback({
					query: (sql, params = []) => client.query(sql, params),
					exec: (sql) => client.query(sql),
				});
				await client.query("COMMIT");
				return result;
			} catch (error) {
				await client.query("ROLLBACK");
				throw error;
			} finally {
				client.release();
			}
		},
		close: () => pool.end(),
	};
}
