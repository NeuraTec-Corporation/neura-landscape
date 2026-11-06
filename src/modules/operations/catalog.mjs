import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ManageError, parse, audit, revision, text } from "./manage.mjs";
export const categories = {
	zone_kind: "Tipos de zona",
	element_kind: "Tipos de elemento",
	service: "Servicios y trabajos",
	frequency: "Frecuencias del inventario",
	season: "Temporadas",
	area_unit: "Unidades de superficie",
	element_unit: "Unidades de trabajo",
	measurement_quality: "Calidad de la medición",
	contract_frequency: "Frecuencias de contratos",
	property_kind: "Tipos de localidad",
	employee_role: "Funciones de empleados",
	payment_method: "Medios de pago",
};
export async function catalogOptions(db) {
	return (
		await db.query("SELECT * FROM catalog_options ORDER BY category,label")
	).rows;
}
export async function requireOption(tx, category, key, previous) {
	if (key === previous) return;
	const row = (
		await tx.query(
			"SELECT key FROM catalog_options WHERE category=$1 AND key=$2 AND active=true FOR SHARE",
			[category, key],
		)
	).rows[0];
	if (!row)
		throw new ManageError("Selecciona una opción activa del catálogo.", 422, {
			[category]: "La opción no existe o está inactiva.",
		});
}
export async function catalogMetadata(db) {
	const rows = (
		await db.query("SELECT * FROM catalog_categories ORDER BY label")
	).rows;
	return {
		categories: Object.fromEntries(rows.map((r) => [r.category, r.label])),
		extensible: Object.fromEntries(rows.map((r) => [r.category, r.extensible])),
	};
}
export function canManageCatalog(role, category) {
	return (
		["it_admin", "owner"].includes(role) ||
		(role === "manager" && !["app_role", "member_status"].includes(category))
	);
}
const schema = z.object({
	category: z.string().min(1).max(80),
	key: z.string().max(80).optional(),
	label: text,
	active: z.boolean(),
	semantic_key: z.string().max(50).nullable().optional(),
	revision,
});
export async function saveOption(db, input) {
	const v = parse(schema, input);
	return db.transaction(async (tx) => {
		const metadata = (
			await tx.query(
				"SELECT * FROM catalog_categories WHERE category=$1 FOR SHARE",
				[v.category],
			)
		).rows[0];
		if (!metadata)
			throw new ManageError("Categoría de catálogo no disponible.");
		if (!v.key && !metadata.extensible)
			throw new ManageError(
				"Esta categoría usa claves de sistema; puedes editar etiquetas y disponibilidad.",
			);
		const key = v.key || `custom_${randomUUID()}`;
		if (!v.key && v.semantic_key) {
			const valid = await tx.query(
				"SELECT key FROM catalog_options WHERE category=$1 AND key=$2 AND key=semantic_key",
				[v.category, v.semantic_key],
			);
			if (!valid.rows.length)
				throw new ManageError("Selecciona una clasificación base válida.");
		}
		if (v.key) {
			const old = (
				await tx.query(
					"SELECT * FROM catalog_options WHERE category=$1 AND key=$2 FOR UPDATE",
					[v.category, key],
				)
			).rows[0];
			if (!old || old.revision !== v.revision)
				throw new ManageError("La opción cambió. Recarga el catálogo.", 409);
			await tx.query(
				"UPDATE catalog_options SET label=$3,active=$4,semantic_key=$5,revision=revision+1 WHERE category=$1 AND key=$2",
				[v.category, key, v.label, v.active, old.semantic_key],
			);
		} else
			await tx.query(
				"INSERT INTO catalog_options(category,key,label,active,semantic_key) VALUES($1,$2,$3,$4,$5)",
				[v.category, key, v.label, v.active, v.semantic_key ?? null],
			);
		await audit(
			tx,
			"catalog",
			`${v.category}:${key}`,
			v.active ? "saved" : "archived",
		);
		return { key };
	});
}
