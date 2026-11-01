export { database, snapshot, mutate } from "./store.mjs";
export async function customerPropertyCounts(db) {
	return (
		await db.query(
			"SELECT customer_id,count(*)::int property_count FROM properties GROUP BY customer_id",
		)
	).rows;
}
