export { database, snapshot, mutate } from "./store.mjs";
export function customerPropertyCounts(
	db: unknown,
): Promise<{ customer_id: string; property_count: number }[]>;
