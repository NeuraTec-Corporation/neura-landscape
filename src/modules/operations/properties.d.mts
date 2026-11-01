export type PropertyDraft = {
	id?: string;
	revision?: number;
	customer_id: string;
	name: string;
	code: string;
	kind:
		| "residential"
		| "commercial"
		| "office"
		| "warehouse"
		| "land"
		| "other";
	status: "active" | "inactive";
	line1: string;
	line2: string;
	city: string;
	region: string;
	postal_code: string;
	country: string;
	latitude: number | null;
	longitude: number | null;
	contact_name: string;
	contact_phone: string;
	lawn_sqft: number | null;
	garden_sqft: number | null;
	paved_sqft: number | null;
	access_instructions: string;
	service_hours: string;
	notes: string;
};
export type PropertyRecord = PropertyDraft & {
	id: string;
	revision: number;
	address: string;
	customer_name: string;
	contract_count: number;
};
export function listProperties(
	db: unknown,
	customerId?: string,
): Promise<PropertyRecord[]>;
export function saveProperty(
	db: unknown,
	input: unknown,
): Promise<{ id: string; revision: number }>;
export class PropertyError extends Error {
	status: number;
	fields: Record<string, string>;
}
