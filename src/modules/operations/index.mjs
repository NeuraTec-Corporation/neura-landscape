export { database, snapshot, mutate } from "./store.mjs";
export { listProperties, saveProperty, PropertyError } from "./properties.mjs";
export async function customerPropertyCounts(db) {
	return (
		await db.query(
			"SELECT customer_id,count(*)::int property_count FROM properties WHERE deleted_at IS NULL GROUP BY customer_id",
		)
	).rows;
}
