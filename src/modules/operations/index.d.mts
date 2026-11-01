export { database, snapshot, mutate } from "./store.mjs";
export { listProperties, saveProperty, PropertyError } from "./properties.mjs";
export type { PropertyDraft, PropertyRecord } from "./properties.mjs";
export function customerPropertyCounts(
	db: unknown,
): Promise<{ customer_id: string; property_count: number }[]>;
