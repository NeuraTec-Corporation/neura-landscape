import { AsyncLocalStorage } from "node:async_hooks";
const actorContext = new AsyncLocalStorage();
export const withActor = (actor, fn) => actorContext.run(actor, fn);
import { z } from "zod";
export class ManageError extends Error {
	constructor(message, status = 422, fields = {}) {
		super(message);
		this.status = status;
		this.fields = fields;
	}
}
export function parse(schema, input) {
	const result = schema.safeParse(input);
	if (!result.success)
		throw new ManageError(
			"Revisa los campos marcados.",
			422,
			Object.fromEntries(
				result.error.issues.map((i) => [i.path.join("."), i.message]),
			),
		);
	return result.data;
}
export const money = z.coerce
	.number()
	.finite()
	.min(0)
	.max(1000000)
	.refine(
		(v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001,
		"Usa hasta dos decimales.",
	);
export const date = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.refine(
		(v) =>
			!Number.isNaN(Date.parse(v)) &&
			new Date(v).toISOString().slice(0, 10) === v,
		"Fecha inválida.",
	);
export const text = z.string().trim().min(1, "Campo obligatorio.").max(500);
export const revision = z.number().int().positive().optional();
export async function audit(tx, entity, id, event, details) {
	const actor = actorContext.getStore() || "system";
	await tx.query(
		"INSERT INTO service_audit(entity,entity_id,event,actor) VALUES($1,$2,$3,$4)",
		[entity, id, event, actor],
	);
	if (details)
		await tx.query(
			"INSERT INTO change_history(entity,entity_id,event,actor,details) VALUES($1,$2,$3,$4,$5::jsonb)",
			[entity, id, event, actor, JSON.stringify(details)],
		);
}
export async function sequence(tx, entity, prefix) {
	const year = new Date().getUTCFullYear();
	const row = (
		await tx.query(
			"INSERT INTO entity_sequences(entity,year,value) VALUES($1,$2,1) ON CONFLICT(entity,year) DO UPDATE SET value=entity_sequences.value+1 RETURNING value",
			[entity, year],
		)
	).rows[0];
	return `${prefix}-${year}-${String(row.value).padStart(4, "0")}`;
}
