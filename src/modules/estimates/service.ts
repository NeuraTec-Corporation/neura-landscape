import { randomUUID } from "node:crypto";
import {
	archiveSchema,
	calculate,
	draftSchema,
	EstimateError,
	parse,
	rateSchema,
	type Rate,
	type Zone,
} from "./contract.ts";
export interface Queryable {
	query<T = Record<string, unknown>>(
		sql: string,
		params?: unknown[],
	): Promise<{ rows: T[] }>;
}
export interface Database extends Queryable {
	transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
}
async function audit(
	tx: Queryable,
	actor: string,
	entity: string,
	id: string,
	event: string,
	details: unknown,
) {
	await tx.query(
		"INSERT INTO service_audit(entity,entity_id,event,actor) VALUES($1,$2,$3,$4)",
		[entity, id, event, actor],
	);
	await tx.query(
		"INSERT INTO change_history(entity,entity_id,event,actor,details) VALUES($1,$2,$3,$4,$5::jsonb)",
		[entity, id, event, actor, JSON.stringify(details)],
	);
}
export async function saveRate(db: Database, input: unknown, actor: string) {
	const v = parse(rateSchema, input),
		id = v.id || randomUUID();
	return db.transaction(async (tx) => {
		const old = (
			await tx.query<Rate>(
				"SELECT * FROM production_rates WHERE id=$1 FOR UPDATE",
				[id],
			)
		).rows[0];
		if (v.id && (!old || old.revision !== v.revision))
			throw new EstimateError(
				"El rendimiento cambió. Recarga antes de guardar.",
				409,
			);
		if (v.id)
			await tx.query(
				"UPDATE production_rates SET name=$2,unit=$3,quantity_per_person_hour=$4,setup_person_minutes=$5,source=$6,confidence=$7,active=$8,revision=revision+1,updated_at=now() WHERE id=$1",
				[
					id,
					v.name,
					v.unit,
					v.quantity_per_person_hour,
					v.setup_person_minutes,
					v.source,
					v.confidence,
					v.active,
				],
			);
		else
			await tx.query(
				"INSERT INTO production_rates(id,name,service_key,unit,quantity_per_person_hour,setup_person_minutes,source,confidence,active) VALUES($1,$2,'mowing',$3,$4,$5,$6,$7,$8)",
				[
					id,
					v.name,
					v.unit,
					v.quantity_per_person_hour,
					v.setup_person_minutes,
					v.source,
					v.confidence,
					v.active,
				],
			);
		await audit(
			tx,
			actor,
			"production_rate",
			id,
			v.active ? "saved" : "archived",
			{ before: old, after: v },
		);
		return { id };
	});
}
export async function saveEstimate(
	db: Database,
	input: unknown,
	actor: string,
) {
	const v = parse(draftSchema, input),
		id = v.id || randomUUID();
	if (new Set(v.zone_ids).size !== v.zone_ids.length)
		throw new EstimateError("No selecciones una zona más de una vez.");
	return db.transaction(async (tx) => {
		const old = (
			await tx.query<{
				revision: number;
				deleted_at: string | null;
				number: string;
				property_id: string;
			}>("SELECT * FROM estimate_drafts WHERE id=$1 FOR UPDATE", [id])
		).rows[0];
		if (v.id && (!old || old.deleted_at || old.revision !== v.revision))
			throw new EstimateError(
				"El presupuesto cambió. Recarga antes de guardar.",
				409,
			);
		if (old && old.property_id !== v.property_id)
			throw new EstimateError(
				"Conserva la localidad del presupuesto; crea otro para otra propiedad.",
			);
		if (
			(
				await tx.query(
					"SELECT id FROM estimate_offers WHERE estimate_id=$1 AND (status='issued' OR (status='accepted' AND contract_id IS NULL)) LIMIT 1",
					[id],
				)
			).rows.length
		)
			throw new EstimateError(
				"La versión emitida está bloqueada. Retira la oferta pendiente o vincula la aceptación antes de preparar cambios.",
				409,
			);
		const property = (
			await tx.query<{
				id: string;
				customer_id: string;
				name: string;
				code: string;
				city: string;
				region: string;
				line1: string;
				postal_code: string;
				country: string;
			}>(
				"SELECT * FROM properties WHERE id=$1 AND deleted_at IS NULL AND status='active' FOR SHARE",
				[v.property_id],
			)
		).rows[0];
		if (!property) throw new EstimateError("Selecciona una localidad activa.");
		const zones = (
			await tx.query<Zone>(
				"SELECT * FROM property_zones WHERE property_id=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL ORDER BY id FOR SHARE",
				[v.property_id, v.zone_ids],
			)
		).rows;
		if (
			zones.length !== v.zone_ids.length ||
			zones.some((z) => z.kind !== "lawn")
		)
			throw new EstimateError(
				"Selecciona zonas de césped de esta localidad. Las superficies de otras zonas no se incluyen.",
			);
		const rate = v.rate_id
			? (
					await tx.query<Rate>(
						"SELECT * FROM production_rates WHERE id=$1 AND active=true FOR SHARE",
						[v.rate_id],
					)
				).rows[0]
			: null;
		if (v.rate_id && !rate)
			throw new EstimateError(
				"El rendimiento está retirado o no existe. Selecciona uno vigente.",
			);
		if (
			zones.some((z) => v.zone_revisions?.[z.id] !== z.revision) ||
			(rate && v.rate_revision !== rate.revision)
		)
			throw new EstimateError(
				"Las medidas o el rendimiento cambiaron. Recarga para revisar el cálculo vigente.",
				409,
			);
		const result = calculate(v, zones, rate);
		const version = (old?.revision || 0) + 1;
		const snapshot = {
			schema_version: 1,
			currency: "USD",
			service_key: "mowing",
			input: v,
			property: {
				id: property.id,
				name: property.name,
				code: property.code,
				customer_id: property.customer_id,
				address: [
					property.line1,
					property.city,
					property.region,
					property.postal_code,
					property.country,
				]
					.filter(Boolean)
					.join(", "),
			},
			zones,
			rate: rate || null,
			calculation: result,
			policy:
				"persona-hora; indirectos sobre costo directo; margen sobre venta; redondeo por componente en centavos",
			warnings: [
				"Borrador interno. No aprobado, no contrato ni factura.",
				"Superficies no solapadas declaradas por el usuario; no verificadas por geometría.",
				"Las horas-persona no predicen automáticamente duración ni tamaño de cuadrilla.",
				...(zones.some((z) => z.measurement_status !== "verified")
					? ["Hay medidas estimadas o no verificadas."]
					: []),
			],
		};
		let number = old?.number;
		if (!number) {
			const year = new Date().getUTCFullYear();
			const n = (
				await tx.query<{ value: number }>(
					"INSERT INTO entity_sequences(entity,year,value) VALUES('estimate',$1,1) ON CONFLICT(entity,year) DO UPDATE SET value=entity_sequences.value+1 RETURNING value",
					[year],
				)
			).rows[0].value;
			number = `PRE-${year}-${String(n).padStart(4, "0")}`;
			await tx.query(
				"INSERT INTO estimate_drafts(id,number,customer_id,property_id,title) VALUES($1,$2,$3,$4,$5)",
				[id, number, property.customer_id, property.id, v.title],
			);
		} else
			await tx.query(
				"UPDATE estimate_drafts SET title=$2,revision=$3,updated_at=now() WHERE id=$1",
				[id, v.title, version],
			);
		await tx.query(
			"INSERT INTO estimate_revisions(estimate_id,revision,snapshot,actor,reason) VALUES($1,$2,$3::jsonb,$4,$5)",
			[id, version, JSON.stringify(snapshot), actor, v.reason],
		);
		await audit(tx, actor, "estimate", id, "draft_saved", {
			revision: version,
			reason: v.reason,
		});
		return { id, number, revision: version, snapshot };
	});
}
export async function archiveEstimate(
	db: Database,
	input: unknown,
	actor: string,
) {
	const v = parse(archiveSchema, input);
	const id = v.id;
	return db.transaction(async (tx) => {
		await tx.query("SELECT id FROM estimate_drafts WHERE id=$1 FOR UPDATE", [
			id,
		]);
		if (
			(
				await tx.query(
					"SELECT id FROM estimate_offers WHERE estimate_id=$1 AND status IN ('issued','accepted') LIMIT 1",
					[id],
				)
			).rows.length
		)
			throw new EstimateError(
				"Conserva el presupuesto con su oferta o contrato. No puede retirarse.",
				409,
			);
		const row = (
			await tx.query(
				"UPDATE estimate_drafts SET deleted_at=now(),revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$2 AND deleted_at IS NULL RETURNING id",
				[v.id, v.revision],
			)
		).rows[0];
		if (!row) throw new EstimateError("El presupuesto cambió. Recarga.", 409);
		await audit(tx, actor, "estimate", id, "archived", { reason: v.reason });
		return { id: v.id };
	});
}
export async function estimateWorkspace(db: Database) {
	return db.transaction(async (tx) => ({
		properties: (
			await tx.query(
				"SELECT p.id,p.name,p.code,p.customer_id,c.name customer_name FROM properties p JOIN customers c ON c.id=p.customer_id WHERE p.deleted_at IS NULL AND p.status='active' ORDER BY c.name,p.name LIMIT 500",
			)
		).rows,
		zones: (
			await tx.query(
				"SELECT id,property_id,name,kind,area,unit,measurement_status,revision FROM property_zones WHERE deleted_at IS NULL AND kind='lawn' ORDER BY name LIMIT 5000",
			)
		).rows,
		rates: (
			await tx.query(
				"SELECT * FROM production_rates ORDER BY updated_at DESC LIMIT 500",
			)
		).rows,
		estimates: (
			await tx.query(
				"SELECT e.*,c.name customer_name,p.name property_name,r.snapshot,r.reason FROM estimate_drafts e JOIN customers c ON c.id=e.customer_id JOIN properties p ON p.id=e.property_id JOIN estimate_revisions r ON r.estimate_id=e.id AND r.revision=e.revision WHERE e.deleted_at IS NULL ORDER BY e.updated_at DESC LIMIT 200",
			)
		).rows,
		history: (
			await tx.query(
				"SELECT r.* FROM estimate_revisions r JOIN estimate_drafts e ON e.id=r.estimate_id WHERE e.deleted_at IS NULL ORDER BY r.created_at DESC LIMIT 2000",
			)
		).rows,
		offers: (
			await tx.query(
				"SELECT o.*,e.number,e.title,c.name customer_name FROM estimate_offers o JOIN estimate_drafts e ON e.id=o.estimate_id JOIN customers c ON c.id=e.customer_id ORDER BY o.issued_at DESC LIMIT 500",
			)
		).rows,
		contracts: (
			await tx.query(
				"SELECT * FROM contracts WHERE source_offer_id IS NOT NULL ORDER BY id LIMIT 500",
			)
		).rows,
		baselines: (
			await tx.query(
				"SELECT * FROM contract_baselines ORDER BY contract_id,version DESC LIMIT 2000",
			)
		).rows,
		frequency_options: (
			await tx.query(
				"SELECT key,label FROM catalog_options WHERE category='contract_frequency' AND active=true ORDER BY label",
			)
		).rows,
		limits: {
			properties: 500,
			zones: 5000,
			rates: 500,
			estimates: 200,
			history: 2000,
		},
	}));
}

export { audit as recordEstimateAudit };
