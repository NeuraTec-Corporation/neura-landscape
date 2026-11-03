import { z } from "zod";
export class EstimateError extends Error {
	status: number;
	fields: Record<string, string>;
	constructor(
		message: string,
		status = 422,
		fields: Record<string, string> = {},
	) {
		super(message);
		this.status = status;
		this.fields = fields;
	}
}
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
	const r = schema.safeParse(input);
	if (!r.success)
		throw new EstimateError(
			"Revisa los campos del presupuesto.",
			422,
			Object.fromEntries(
				r.error.issues.map((i) => [i.path.join("."), i.message]),
			),
		);
	return r.data;
}
const text = z.string().trim().min(1, "Campo obligatorio.").max(500);
const optionalMoney = z.preprocess(
	(v) => (v === "" || v === null || v === undefined ? null : v),
	z.coerce
		.number()
		.min(0)
		.max(1000000)
		.refine(
			(v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001,
			"Usa hasta dos decimales.",
		)
		.nullable(),
);
export const rateSchema = z.object({
	id: z.string().uuid().optional(),
	revision: z.number().int().positive().optional(),
	name: text,
	unit: z.enum(["sqft", "sqm"]),
	quantity_per_person_hour: z.coerce.number().min(0.0001).max(1e7),
	setup_person_minutes: z.coerce.number().min(0).max(1440),
	source: text,
	confidence: z.enum(["estimated", "field_validated"]),
	active: z.boolean(),
});
export const draftSchema = z.object({
	id: z.string().uuid().optional(),
	revision: z.number().int().positive().optional(),
	property_id: text,
	title: text,
	rate_id: z.string().uuid().nullable(),
	rate_revision: z.number().int().positive().nullable().optional(),
	zone_revisions: z.record(z.string(), z.number().int().positive()).optional(),
	zone_ids: z.array(text).min(1, "Selecciona al menos una zona.").max(100),
	areas_independent: z
		.boolean()
		.refine((v) => v, "Confirma que las zonas no se superponen."),
	resources_reviewed: z.boolean(),
	labor_hourly: optionalMoney,
	overhead_percent: optionalMoney.refine(
		(v) => v === null || v <= 1000,
		"Indirectos fuera de rango.",
	),
	margin_percent: optionalMoney.refine(
		(v) => v === null || v < 100,
		"El margen debe ser menor de 100%.",
	),
	lines: z
		.array(
			z.object({
				client_key: z.string().uuid(),
				description: text,
				category: z.enum(["materials", "equipment", "other"]),
				quantity: z.coerce.number().positive().max(1e6),
				unit: text,
				unit_price: optionalMoney,
			}),
		)
		.max(100),
	reason: z
		.string()
		.trim()
		.min(5, "Explica el cambio con al menos cinco caracteres.")
		.max(2000),
	notes: z.string().trim().max(3000),
});
export type Rate = z.infer<typeof rateSchema> & {
	id: string;
	revision: number;
};
export type DraftInput = z.infer<typeof draftSchema>;
export type Zone = {
	id: string;
	property_id: string;
	name: string;
	kind: string;
	area: number | string | null;
	unit: string;
	measurement_status: string;
	revision: number;
};
export type Calculation = {
	status: "complete" | "pending";
	margin_percent: number | null;
	missing: string[];
	area_sqm: number | null;
	person_hours: number | null;
	labor_cents: number | null;
	resource_cents: number | null;
	overhead_cents: number | null;
	cost_cents: number | null;
	price_cents: number | null;
	margin_cents: number | null;
	lines: (DraftInput["lines"][number] & { total_cents: number | null })[];
};
export function calculate(
	input: DraftInput,
	zones: Zone[],
	rate: Rate | null,
): Calculation {
	const missing: string[] = [];
	const round = (v: number) => Math.round(v * 1e6) / 1e6;
	if (!zones.length) missing.push("Zonas de césped");
	const areas = zones.map((z) =>
		z.area === null
			? null
			: Number(z.area) * (z.unit === "sqft" ? 0.09290304 : 1),
	);
	if (zones.some((z) => !["sqft", "sqm"].includes(z.unit)))
		throw new EstimateError(
			"La unidad de superficie debe ser ft² o m² para este servicio.",
		);
	if (areas.some((a) => a === null || !Number.isFinite(a) || a <= 0))
		missing.push("Superficie de todas las zonas");
	const area = missing.length
		? null
		: round(areas.reduce<number>((s, a) => s + Number(a), 0));
	if (!rate) missing.push("Rendimiento de trabajo");
	const hours =
		area !== null && rate
			? round(
					area /
						(rate.unit === "sqft" ? 0.09290304 : 1) /
						Number(rate.quantity_per_person_hour) +
						Number(rate.setup_person_minutes) / 60,
				)
			: null;
	if (input.labor_hourly === null)
		missing.push("Costo laboral por hora-persona");
	const labor =
		hours !== null && input.labor_hourly !== null
			? Math.round(hours * Math.round(input.labor_hourly * 100))
			: null;
	const lines = input.lines.map((l) => ({
		...l,
		total_cents:
			l.unit_price === null
				? null
				: Math.round(l.quantity * Math.round(l.unit_price * 100)),
	}));
	if (lines.some((l) => l.total_cents === null))
		missing.push("Precios de recursos");
	if (input.overhead_percent === null)
		missing.push("Porcentaje de indirectos (cero si no aplica)");
	if (input.margin_percent === null)
		missing.push("Margen objetivo (cero si no aplica)");
	if (!input.resources_reviewed)
		missing.push(
			"Revisión de materiales y equipos (también si no se requieren)",
		);
	const resources =
		input.resources_reviewed && lines.every((l) => l.total_cents !== null)
			? lines.reduce((s, l) => s + Number(l.total_cents), 0)
			: null;
	const direct =
		labor !== null && resources !== null ? labor + resources : null;
	const overhead =
		direct !== null && input.overhead_percent !== null
			? Math.round((direct * input.overhead_percent) / 100)
			: null;
	const cost = direct !== null && overhead !== null ? direct + overhead : null;
	const price =
		cost !== null && input.margin_percent !== null
			? Math.round(cost / (1 - input.margin_percent / 100))
			: null;
	for (const value of [labor, resources, overhead, cost, price])
		if (value !== null && (!Number.isSafeInteger(value) || value > 100000000))
			throw new EstimateError(
				"El importe supera el máximo permitido de USD 1.000.000.",
			);
	return {
		status: missing.length ? "pending" : "complete",
		margin_percent: input.margin_percent,
		missing,
		area_sqm: area,
		person_hours: hours,
		labor_cents: labor,
		resource_cents: resources,
		overhead_cents: overhead,
		cost_cents: cost,
		price_cents: price,
		margin_cents: cost !== null && price !== null ? price - cost : null,
		lines,
	};
}

export type Snapshot = {
	schema_version: number;
	currency: string;
	input: DraftInput;
	property: {
		id: string;
		name: string;
		code: string;
		customer_id: string;
		address: string;
	};
	zones: Zone[];
	rate: Rate | null;
	calculation: Calculation;
	warnings: string[];
	policy: string;
};
export type EstimateRecord = {
	id: string;
	number: string;
	title: string;
	revision: number;
	property_id: string;
	customer_name: string;
	property_name: string;
	snapshot: Snapshot;
	reason: string;
};
export type Workspace = {
	properties: {
		id: string;
		name: string;
		code: string;
		customer_id: string;
		customer_name: string;
	}[];
	zones: Zone[];
	rates: Rate[];
	estimates: EstimateRecord[];
	history: {
		estimate_id: string;
		revision: number;
		snapshot: Snapshot;
		reason: string;
		created_at: string;
	}[];
	canEdit: boolean;
	limits: Record<string, number>;
};

export const archiveSchema = z.object({
	id: z.string().uuid(),
	revision: z.number().int().positive(),
	reason: z.string().trim().min(5).max(2000),
});
