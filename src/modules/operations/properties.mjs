import { requireOption } from "./catalog.mjs";
import { randomUUID } from "node:crypto";

import { z } from "zod";

import { parsePhoneNumberFromString } from "libphonenumber-js";

const upper = z

	.string()

	.trim()

	.max(200)

	.transform((v) =>
		v.normalize("NFC").replace(/\s+/g, " ").toLocaleUpperCase("es"),
	);

const required = upper.pipe(z.string().min(1, "Campo obligatorio."));

const area = z.number().finite().min(0).max(1000000000).nullable();

const schema = z

	.object({
		id: z.string().uuid().optional(),

		revision: z.number().int().positive().optional(),

		customer_id: z.string().uuid(),

		name: required,

		code: upper.pipe(z.string().max(80)),

		kind: z.string().trim().min(1),

		status: z.enum(["active", "inactive"]),

		line1: required,

		line2: upper,

		city: required,

		region: required,

		postal_code: required,

		country: z

			.string()

			.trim()

			.regex(/^[a-zA-Z]{2}$/, "Selecciona un país.")

			.transform((v) => v.toUpperCase()),

		latitude: z.number().min(-90).max(90).nullable(),

		longitude: z.number().min(-180).max(180).nullable(),

		contact_name: upper,

		contact_phone: z

			.string()

			.trim()

			.transform((v, ctx) => {
				if (!v) return "";

				const phone = parsePhoneNumberFromString(v);

				if (!phone?.isValid()) {
					ctx.addIssue({
						code: "custom",

						message: "Revisa el teléfono del contacto local.",
					});

					return z.NEVER;
				}

				return phone.number;
			}),

		lawn_sqft: area,

		garden_sqft: area,

		paved_sqft: area,

		access_instructions: z.string().trim().max(2000),

		service_hours: z.string().trim().max(500),

		notes: z.string().trim().max(3000),
	})

	.superRefine((v, ctx) => {
		if ((v.latitude === null) !== (v.longitude === null))
			ctx.addIssue({
				code: "custom",

				path: ["latitude"],

				message: "Completa ambas coordenadas o deja ambas vacías.",
			});
	});

export class PropertyError extends Error {
	constructor(message, status = 400, fields = {}) {
		super(message);

		this.status = status;

		this.fields = fields;
	}
}

export async function listProperties(db, customerId) {
	const rows = (
		await db.query(
			"SELECT p.*,(SELECT batch_id FROM sample_data_records sr WHERE sr.entity='property' AND sr.entity_id=p.id) sample_batch_id,c.name customer_name,(SELECT count(*)::int FROM contracts ct WHERE ct.property_id=p.id) contract_count FROM properties p JOIN customers c ON c.id=p.customer_id WHERE p.deleted_at IS NULL AND ($1::text IS NULL OR p.customer_id=$1) ORDER BY p.status,p.name,p.id",

			[customerId || null],
		)
	).rows;

	return rows.map((row) => ({
		...row,

		lawn_sqft: row.lawn_sqft === null ? null : Number(row.lawn_sqft),

		garden_sqft: row.garden_sqft === null ? null : Number(row.garden_sqft),

		paved_sqft: row.paved_sqft === null ? null : Number(row.paved_sqft),
	}));
}

export async function saveProperty(db, input) {
	const parsed = schema.safeParse(input);

	if (!parsed.success)
		throw new PropertyError(
			"Revisa los campos de la localidad.",

			422,

			Object.fromEntries(
				parsed.error.issues.map((i) => [i.path.join("."), i.message]),
			),
		);

	const v = parsed.data,
		id = v.id || randomUUID();

	let code = v.code;

	try {
		return await db.transaction(async (tx) => {
			if (
				!(
					await tx.query("SELECT id FROM customers WHERE id=$1", [
						v.customer_id,
					])
				).rows.length
			)
				throw new PropertyError("Selecciona un cliente existente.", 422, {
					customer_id: "El cliente no existe.",
				});

			let revision = 1;
			const previous = v.id
				? (await tx.query("SELECT kind FROM properties WHERE id=$1", [id]))
						.rows[0]
				: null;
			await requireOption(tx, "property_kind", v.kind, previous?.kind);

			if (v.id) {
				const old = (
					await tx.query(
						"SELECT customer_id,revision,code,deleted_at FROM properties WHERE id=$1 FOR UPDATE",

						[id],
					)
				).rows[0];

				if (!old || old.deleted_at)
					throw new PropertyError("Localidad no encontrada.", 404);

				if (old.customer_id !== v.customer_id)
					throw new PropertyError(
						"No se puede trasladar la localidad a otro cliente.",

						409,
					);

				if (old.revision !== v.revision)
					throw new PropertyError(
						"Otra edición cambió esta localidad. Recarga antes de guardar.",

						409,
					);

				revision = old.revision + 1;

				code = old.code;
			}

			if (!v.id && !code) {
				const configured = (
					await tx.query(
						"SELECT code FROM operator_settings WHERE id=1 FOR SHARE",
					)
				).rows[0];
				const operator = (
					configured?.code ||
					process.env.LANDSCAPE_OPERATOR_CODE ||
					""
				)
					.trim()
					.toUpperCase();

				if (
					!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(operator) ||
					operator.length > 40
				)
					throw new PropertyError(
						"Configura el identificador de la empresa operadora en Integraciones.",
						422,
					);

				const year = new Date().getUTCFullYear();

				const sequence = (
					await tx.query(
						"INSERT INTO location_sequences(operator,year,value) VALUES($1,$2,1) ON CONFLICT(operator,year) DO UPDATE SET value=location_sequences.value+1 RETURNING value",
						[operator, year],
					)
				).rows[0].value;

				code = `LOC-${operator}-${year}-${String(sequence).padStart(4, "0")}`;
			}

			const full = [
				v.line1,

				v.line2,

				v.city,

				v.region,

				v.postal_code,

				v.country,
			]

				.filter(Boolean)

				.join(", ");

			const columns = [
				"customer_id",

				"name",

				"address",

				"lawn_sqft",

				"code",

				"kind",

				"status",

				"line1",

				"line2",

				"city",

				"region",

				"postal_code",

				"country",

				"latitude",

				"longitude",

				"contact_name",

				"contact_phone",

				"garden_sqft",

				"paved_sqft",

				"access_instructions",

				"service_hours",

				"notes",

				"revision",
			];

			const values = [
				v.customer_id,

				v.name,

				full,

				v.lawn_sqft,

				code,

				v.kind,

				v.status,

				v.line1,

				v.line2,

				v.city,

				v.region,

				v.postal_code,

				v.country,

				v.latitude,

				v.longitude,

				v.contact_name,

				v.contact_phone,

				v.garden_sqft,

				v.paved_sqft,

				v.access_instructions,

				v.service_hours,

				v.notes,

				revision,
			];

			if (v.id)
				await tx.query(
					`UPDATE properties SET ${columns.map((c, i) => `${c}=$${i + 2}`).join(",")},updated_at=now() WHERE id=$1`,

					[id, ...values],
				);
			else
				await tx.query(
					`INSERT INTO properties(id,${columns.join(",")}) VALUES(${[id, ...values].map((_, i) => `$${i + 1}`).join(",")})`,

					[id, ...values],
				);

			return { id, revision };
		});
	} catch (error) {
		if (error.code === "23505")
			throw new PropertyError(
				"Ese código ya está en uso para este cliente.",

				409,

				{ code: "Usa un código diferente." },
			);

		throw error;
	}
}
