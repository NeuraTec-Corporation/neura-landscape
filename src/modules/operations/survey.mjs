import { randomUUID } from "node:crypto";
import { z } from "zod";
export class SurveyError extends Error {
	constructor(message, status = 422) {
		super(message);
		this.status = status;
	}
}
const coordinates = {
	latitude: z.number().min(-90).max(90).nullable(),
	longitude: z.number().min(-180).max(180).nullable(),
};
const base = {
	id: z.string().uuid().optional(),
	property_id: z.string().min(1),
	revision: z.number().int().positive().optional(),
	name: z.string().trim().min(1).max(150),
	notes: z.string().trim().max(3000),
	...coordinates,
};
const zone = z.object({
	...base,
	kind: z.enum(["lawn", "garden", "driveway", "walkway", "patio", "other"]),
	area: z.number().min(0).max(1e9).nullable(),
	unit: z.enum(["sqft", "sqm"]),
	measurement_status: z.enum(["estimated", "measured", "verified"]),
});
const element = z.object({
	...base,
	zone_id: z.string().uuid(),
	kind: z.enum([
		"tree",
		"fruit_tree",
		"planter",
		"hedge",
		"irrigation",
		"lawn",
		"surface",
		"other",
	]),
	quantity: z.number().positive().max(1e8),
	unit: z.enum(["each", "sqft", "sqm", "ft", "m"]),
	service: z.enum([
		"maintenance",
		"mowing",
		"pruning",
		"planting",
		"snow",
		"inspection",
		"preserve",
		"other",
	]),
	frequency: z.enum([
		"on_request",
		"weekly",
		"every14days",
		"monthly",
		"quarterly",
		"annual",
		"seasonal",
	]),
	season: z.enum(["all", "spring", "summer", "autumn", "winter"]),
	protection_notes: z.string().trim().max(2000),
}).refine(v=>v.unit!=="each"||Number.isInteger(v.quantity),"Las unidades se registran como enteros.");
export async function survey(db, propertyId) {
	return db.transaction(async (tx) => {
		const property = (
			await tx.query(
				"SELECT * FROM properties WHERE id=$1 AND deleted_at IS NULL",
				[propertyId],
			)
		).rows[0];
		if (!property) throw new SurveyError("Localidad no encontrada.", 404);
		const zones = (
			await tx.query(
				"SELECT * FROM property_zones WHERE property_id=$1 AND deleted_at IS NULL ORDER BY name",
				[propertyId],
			)
		).rows;
		const elements = (
			await tx.query(
				"SELECT * FROM property_elements WHERE property_id=$1 AND deleted_at IS NULL ORDER BY name",
				[propertyId],
			)
		).rows;
		const photos = (
			await tx.query(
				"SELECT id,property_id,zone_id,element_id,viewpoint,caption,width,height,latitude,longitude,uploaded_at FROM property_photos WHERE property_id=$1 AND deleted_at IS NULL ORDER BY uploaded_at DESC",
				[propertyId],
			)
		).rows;
		const totals = {};
		for (const row of zones) {
			if (row.area !== null) {
				totals[row.unit] = (totals[row.unit] || 0) + Number(row.area);
			}
		}
		return {
			property,
			zones,
			elements,
			photos,
			totals,
			unmeasured: zones.filter((z) => z.area === null).length,
		};
	});
}
export async function saveSurveyItem(db, kind, input) {
	if (!["zone", "element"].includes(kind))
		throw new SurveyError("Tipo inválido.");
	const parsed = (kind === "zone" ? zone : element).safeParse(input);
	if (!parsed.success)
		throw new SurveyError(
			"Completa los campos del levantamiento y revisa medidas y coordenadas.",
		);
	const v = parsed.data;
	if ((v.latitude === null) !== (v.longitude === null))
		throw new SurveyError("Completa ambas coordenadas o deja ambas vacías.");
	return db.transaction(async (tx) => {
		const property = (
			await tx.query(
				"SELECT id FROM properties WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
				[v.property_id],
			)
		).rows[0];
		if (!property) throw new SurveyError("Localidad no disponible.", 404);
		if (
			kind === "element" &&
			!(
				await tx.query(
					"SELECT id FROM property_zones WHERE id=$1 AND property_id=$2 AND deleted_at IS NULL",
					[v.zone_id, v.property_id],
				)
			).rows.length
		)
			throw new SurveyError("Selecciona una zona de esta localidad.");
		const table = kind === "zone" ? "property_zones" : "property_elements",
			id = v.id || randomUUID();
		if (v.id) {
			const old = (
				await tx.query(
					`SELECT revision FROM ${table} WHERE id=$1 AND property_id=$2 AND deleted_at IS NULL FOR UPDATE`,
					[id, v.property_id],
				)
			).rows[0];
			if (!old || old.revision !== v.revision)
				throw new SurveyError(
					"El registro cambió. Recarga antes de editar.",
					409,
				);
		}
		const { id: unusedId, revision: unusedRevision, ...fields } = v;
		void unusedId;
		void unusedRevision;
		const keys = Object.keys(fields),
			values = Object.values(fields);
		if (v.id)
			await tx.query(
				`UPDATE ${table} SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(",")},revision=revision+1 WHERE id=$1`,
				[id, ...values],
			);
		else
			await tx.query(
				`INSERT INTO ${table}(id,${keys.join(",")}) VALUES(${[id, ...values].map((_, i) => `$${i + 1}`).join(",")})`,
				[id, ...values],
			);
		await tx.query(
			"INSERT INTO service_audit(entity,entity_id,event) VALUES($1,$2,$3)",
			[kind, id, v.id ? "updated" : "created"],
		);
		return { id };
	});
}
export async function deleteSurveyItem(db, kind, input) {
	if (
		!["zone", "element"].includes(kind) ||
		typeof input.id !== "string" ||
		!Number.isInteger(input.revision)
	)
		throw new SurveyError("Solicitud inválida.");
	return db.transaction(async (tx) => {
		const property = (
			await tx.query(
				"SELECT id FROM properties WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
				[input.property_id],
			)
		).rows[0];
		if (!property) throw new SurveyError("Localidad no disponible.", 404);
		const table = kind === "zone" ? "property_zones" : "property_elements";
		if (
			kind === "zone" &&
			(
				await tx.query(
					"SELECT id FROM property_elements WHERE zone_id=$1 AND deleted_at IS NULL LIMIT 1",
					[input.id],
				)
			).rows.length
		)
			throw new SurveyError("Elimina primero los elementos de la zona.");
		const row = await tx.query(
			`UPDATE ${table} SET deleted_at=now(),revision=revision+1 WHERE id=$1 AND property_id=$2 AND revision=$3 AND deleted_at IS NULL RETURNING id`,
			[input.id, input.property_id, input.revision],
		);
		if (!row.rows.length)
			throw new SurveyError(
				"El registro cambió. Recarga antes de eliminar.",
				409,
			);
		await tx.query(
			"UPDATE property_photos SET deleted_at=now() WHERE property_id=$1 AND " +
				(kind === "zone" ? "zone_id" : "element_id") +
				"=$2",
			[input.property_id, input.id],
		);
		await tx.query(
			"INSERT INTO service_audit(entity,entity_id,event) VALUES($1,$2,$3)",
			[kind, input.id, "deleted"],
		);
		return { id: input.id };
	});
}
