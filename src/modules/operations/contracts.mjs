import { requireOption } from "./catalog.mjs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
export const frequencies = [
	"Semanal",
	"Cada 14 días",
	"Dos veces al mes",
	"Mensual",
	"Dos veces por semana",
	"Personalizada",
];
const schema = z.object({
	id: z.string().uuid().optional(),
	revision: z.number().int().positive().optional(),
	property_id: z.string().min(1),
	service: z.string().trim().min(1).max(500),
	service_key: z.string().min(1).nullable().optional(),
	frequency: z.string().trim().min(1),
	monthly: z.coerce
		.number()
		.finite()
		.min(0)
		.max(1000000)
		.refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001),
	visits_per_month: z.coerce.number().int().min(1).max(100),
	estimated_minutes: z.coerce.number().int().min(1).max(1440),
	status: z.enum(["draft", "active", "paused", "ended", "cancelled"]),
});
export async function contracts(db) {
	return (
		await db.query(
			"SELECT c.*,p.name property_name,p.code property_code,k.name customer_name,p.customer_id FROM contracts c JOIN properties p ON p.id=c.property_id JOIN customers k ON k.id=p.customer_id ORDER BY k.name,p.name,c.id",
		)
	).rows;
}
export async function saveContract(db, input) {
	const v = schema.parse(input);
	const id = v.id || randomUUID();
	return db.transaction(async (tx) => {
		const p = (
			await tx.query("SELECT * FROM properties WHERE id=$1 FOR UPDATE", [
				v.property_id,
			])
		).rows[0];
		if (!p || p.deleted_at || (!v.id && p.status !== "active"))
			throw new Error("Selecciona una localidad activa.");
		if (v.id) {
			const old = (
				await tx.query("SELECT * FROM contracts WHERE id=$1 FOR UPDATE", [id])
			).rows[0];
			if (!old || old.deleted_at) throw new Error("Contrato no disponible.");
			if (old.revision !== v.revision)
				throw new Error("El contrato cambió. Recarga antes de editar.");
			if (old.property_id !== v.property_id)
				throw new Error("La localidad del contrato no se puede cambiar.");
			if (
				old.source_offer_id &&
				(old.service !== v.service ||
					old.frequency !== v.frequency ||
					old.monthly_cents !== Math.round(v.monthly * 100) ||
					old.visits_per_month !== v.visits_per_month ||
					old.estimated_minutes !== v.estimated_minutes ||
					(v.service_key !== undefined && v.service_key !== old.service_key))
			)
				throw new Error(
					"Contrato vinculado a presupuesto aceptado: prepara un cambio autorizado desde Presupuestos.",
				);
		}
		await requireOption(
			tx,
			"contract_frequency",
			v.frequency,
			v.id
				? (await tx.query("SELECT frequency FROM contracts WHERE id=$1", [id]))
						.rows[0]?.frequency
				: undefined,
		);
		if (v.service_key) await requireOption(tx, "service", v.service_key);
		const values = [
			id,
			v.property_id,
			v.service,
			v.frequency,
			Math.round(v.monthly * 100),
			v.visits_per_month,
			v.estimated_minutes,
			v.status,
		];
		if (v.id)
			await tx.query(
				"UPDATE contracts SET service=$3,frequency=$4,monthly_cents=$5,visits_per_month=$6,estimated_minutes=$7,status=$8,revision=revision+1 WHERE id=$1 AND property_id=$2",
				values,
			);
		else
			await tx.query(
				"INSERT INTO contracts(id,property_id,service,frequency,monthly_cents,visits_per_month,estimated_minutes,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
				values,
			);
		if (v.service_key)
			await tx.query("UPDATE contracts SET service_key=$2 WHERE id=$1", [
				id,
				v.service_key,
			]);
		await tx.query(
			"INSERT INTO service_audit(entity,entity_id,event) VALUES($1,$2,$3)",
			["contract", id, v.id ? "updated" : "created"],
		);
		return { id };
	});
}
export async function removeEntity(db, entity, id, revision) {
	if (
		!["contract", "property"].includes(entity) ||
		typeof id !== "string" ||
		!Number.isInteger(revision)
	)
		throw new Error("Solicitud inválida.");
	return db.transaction(async (tx) => {
		const table = entity === "contract" ? "contracts" : "properties";
		const old = (
			await tx.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [id])
		).rows[0];
		if (!old || old.deleted_at || old.revision !== revision)
			throw new Error("Registro modificado o no disponible. Recarga.");
		if (entity === "property") {
			if (
				(
					await tx.query(
						"SELECT id FROM contracts WHERE property_id=$1 AND deleted_at IS NULL LIMIT 1",
						[id],
					)
				).rows.length
			)
				throw new Error(
					"Primero elimina los contratos vinculados. Se conservará su historial.",
				);
		} else {
			const linked = await tx.query(
				"SELECT status FROM visits WHERE contract_id=$1 FOR UPDATE",
				[id],
			);
			if (linked.rows.some((v) => v.status === "started"))
				throw new Error(
					"Finaliza la visita en ejecución antes de eliminar el contrato.",
				);
			const cancelled = await tx.query(
				"UPDATE visits SET status='cancelled' WHERE contract_id=$1 AND status='scheduled' RETURNING id",
				[id],
			);
			for (const visit of cancelled.rows)
				await tx.query(
					"INSERT INTO activity(visit_id,event) VALUES($1,'cancelled')",
					[visit.id],
				);
		}
		await tx.query(
			`UPDATE ${table} SET deleted_at=now(),revision=revision+1 WHERE id=$1`,
			[id],
		);
		await tx.query(
			"INSERT INTO service_audit(entity,entity_id,event) VALUES($1,$2,$3)",
			[entity, id, "deleted"],
		);
		return { id };
	});
}
export async function serviceControl(db, month) {
	if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Mes inválido.");
	return db.transaction(async (tx) => {
		const all = await contracts(tx);
		const visits = (
			await tx.query(
				"SELECT * FROM visits WHERE to_char(scheduled_at AT TIME ZONE 'America/New_York','YYYY-MM')=$1",
				[month],
			)
		).rows;
		return all
			.filter(
				(c) => !c.deleted_at || visits.some((v) => v.contract_id === c.id),
			)
			.map((c) => {
				const rows = visits.filter((v) => v.contract_id === c.id),
					done = rows.filter((v) => v.status === "completed");
				const sum = (key) => done.reduce((s, v) => s + Number(v[key] || 0), 0);
				const costs = {
					labor_cents: sum("labor_cents"),
					materials_cents: sum("materials_cents"),
					equipment_cents: sum("equipment_cents"),
					travel_cents: sum("travel_cents"),
					overhead_cents: sum("overhead_cents"),
				};
				const total = Object.values(costs).reduce((a, b) => a + b, 0),
					revenue = sum("revenue_cents");
				return {
					...c,
					completed: done.length,
					scheduled: rows.filter((v) => v.status === "scheduled").length,
					started: rows.filter((v) => v.status === "started").length,
					cancelled: rows.filter((v) => v.status === "cancelled").length,
					remaining: Math.max(0, c.visits_per_month - done.length),
					...costs,
					total_cost_cents: total,
					allocated_revenue_cents: revenue,
					contribution_cents: revenue - total,
				};
			});
	});
}
