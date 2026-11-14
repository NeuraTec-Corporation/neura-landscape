import { z } from "zod";
import type { Snapshot } from "./contract.ts";
const text = z.string().trim().min(1, "Campo obligatorio.").max(2000);
const date = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.refine(
		(v) =>
			!Number.isNaN(Date.parse(v)) &&
			new Date(v).toISOString().slice(0, 10) === v,
		"Fecha inválida.",
	);
export const termsSchema = z.object({
	valid_until: date,
	start_date: date,
	end_date: z.preprocess((v) => (v === "" ? null : v), date.nullable()),
	frequency: text,
	visits_per_month: z.coerce.number().int().min(1).max(100),
	estimated_minutes: z.coerce.number().int().min(1).max(1440),
	billing_timing: z.enum(["advance", "arrears"]),
	due_days: z.coerce.number().int().min(0).max(90),
	scope: text.max(500),
	exclusions: z.string().trim().max(3000),
	payment_terms: text,
	reviewed: z
		.boolean()
		.refine((v) => v, "Confirma que revisaste el precio y las condiciones."),
});
export const issueSchema = z.object({
	id: z.string().uuid(),
	revision: z.number().int().positive(),
	terms: termsSchema,
});
export const acceptanceSchema = z.object({
	offer_id: z.string().uuid(),
	revision: z.number().int().positive(),
	accepted_by: text,
	authority: text,
	accepted_at: z.string().datetime({ offset: true }),
	evidence_method: z.enum(["signed_document", "email", "written_confirmation"]),
	evidence_reference: z.string().trim().min(5).max(2000),
	confirmed: z
		.boolean()
		.refine((v) => v, "Confirma la aceptación y representación recibidas."),
});
export const closeSchema = z.object({
	offer_id: z.string().uuid(),
	revision: z.number().int().positive(),
	action: z.enum(["withdraw", "decline"]),
	reason: z.string().trim().min(5).max(2000),
});
export const bindSchema = z.object({
	offer_id: z.string().uuid(),
	revision: z.number().int().positive(),
	contract_revision: z.number().int().positive().optional(),
});
export type OfferTerms = z.infer<typeof termsSchema> & {
	price_basis: "per_visit";
	currency: "USD";
	per_visit_cents: number;
	monthly_cents: number;
};
export type Offer = {
	id: string;
	estimate_id: string;
	estimate_revision: number;
	status: "issued" | "accepted" | "withdrawn" | "declined";
	revision: number;
	snapshot: Snapshot;
	terms: OfferTerms;
	issued_at: string;
	issued_by: string;
	accepted_at: string | null;
	accepted_by: string | null;
	acceptance_authority: string | null;
	evidence_method: string | null;
	evidence_reference: string | null;
	contract_id: string | null;
	target_contract_id: string | null;
	target_baseline_version: number | null;
	replaces_offer_id: string | null;
	closed_reason: string | null;
};
export type BoundContract = {
	id: string;
	revision: number;
	property_id: string;
	source_offer_id: string | null;
	current_offer_id: string | null;
	baseline_version: number;
	status: string;
	deleted_at: string | null;
	monthly_cents: number;
	visits_per_month: number;
};
