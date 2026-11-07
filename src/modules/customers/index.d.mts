export type Contact = {
	id?: string;
	first_name: string;
	last_name: string;
	relationship: string;
	roles: ("primary" | "signer" | "approver" | "billing" | "notifications")[];
	phone_mobile: string;
	phone_home: string;
	phone_office: string;
	email: string;
	preferred_channel: "call" | "sms" | "whatsapp" | "email";
	preferred_phone: "mobile" | "home" | "office";
	contact_from: string;
	contact_to: string;
	consent_sms: boolean;
	consent_whatsapp: boolean;
	consent_email: boolean;
};
export type Address = {
	id?: string;
	label: string;
	line1: string;
	line2: string;
	city: string;
	region: string;
	postal_code: string;
	country: string;
	latitude: number | null;
	longitude: number | null;
	place_id: string;
};
export type CustomerDraft = {
	id?: string;
	revision?: number;
	kind: "person" | "company";
	first_name: string;
	last_name: string;
	company_name: string;
	status: "prospect" | "active" | "inactive";
	marital_status: string;
	language: "es" | "en";
	timezone: string;
	notes: string;
	contacts: Contact[];
	addresses: Address[];
};
export type CustomerRecord = CustomerDraft & {
	name: string;
	created_at: string;
	updated_at: string;
	reminders: {
		id: string;
		title: string;
		due_at: string;
		channel: string;
		status: string;
	}[];
	audit: { action: string; revision: number; occurred_at: string }[];
};
export type CustomerSummary = {
	id: string;
	name: string;
	status: CustomerDraft["status"] | null;
	kind: CustomerDraft["kind"] | null;
	revision: number | null;
	updated_at: string | null;
	property_count?: number;
	sample_batch_id?: string | null;
	email: string | null;
	phone: string | null;
};
export const customerSchema: import("zod").ZodType<CustomerDraft>;
export function listCustomers(db: unknown): Promise<CustomerSummary[]>;
export function getCustomer(db: unknown, id: string): Promise<CustomerRecord>;
export function saveCustomer(
	db: unknown,
	input: unknown,
): Promise<{ id: string; revision: number }>;
export function customerReminder(
	db: unknown,
	input: unknown,
): Promise<{ id: string }>;
export class CustomerError extends Error {
	status: number;
	fields: Record<string, string>;
}
