import { randomUUID } from "node:crypto";
import { parse, EstimateError, type Snapshot } from "./contract.ts";
import {
	issueSchema,
	acceptanceSchema,
	closeSchema,
	bindSchema,
	type Offer,
	type OfferTerms,
	type BoundContract,
} from "./lifecycle-contract.ts";
import {
	recordEstimateAudit,
	type Database,
	type Queryable,
} from "./service.ts";
import { applyAcceptedOffer, BaselineError } from "../operations/index.mjs";
const today = () =>
	new Date().toLocaleDateString("sv-SE", { timeZone: "America/New_York" });
type Family = {
	id: string;
	revision: number;
	deleted_at: string | null;
	property_id: string;
};
async function family(tx: Queryable, id: string) {
	const e = (
		await tx.query<Family>(
			"SELECT * FROM estimate_drafts WHERE id=$1 FOR UPDATE",
			[id],
		)
	).rows[0];
	if (!e || e.deleted_at)
		throw new EstimateError("Presupuesto no disponible.", 404);
	return e;
}
async function lockOffer(tx: Queryable, id: string) {
	const ref = (
		await tx.query<{ estimate_id: string }>(
			"SELECT estimate_id FROM estimate_offers WHERE id=$1",
			[id],
		)
	).rows[0];
	if (!ref) throw new EstimateError("Oferta no disponible.", 404);
	const e = await family(tx, ref.estimate_id);
	await tx.query("SELECT id FROM properties WHERE id=$1 FOR UPDATE", [
		e.property_id,
	]);
	const o = (
		await tx.query<Offer>(
			"SELECT * FROM estimate_offers WHERE id=$1 FOR UPDATE",
			[id],
		)
	).rows[0];
	return o;
}
export async function issueOffer(db: Database, input: unknown, actor: string) {
	const v = parse(issueSchema, input);
	return db.transaction(async (tx) => {
		const e = await family(tx, v.id);
		if (e.revision !== v.revision)
			throw new EstimateError("El presupuesto cambió. Recarga.", 409);
		const existing = (
			await tx.query<Offer>(
				"SELECT * FROM estimate_offers WHERE estimate_id=$1 AND estimate_revision=$2",
				[v.id, v.revision],
			)
		).rows[0];
		if (existing) {
			const same = Object.entries(v.terms).every(
				([key, value]) => existing.terms[key as keyof OfferTerms] === value,
			);
			if (existing.status === "issued" && same)
				return { id: existing.id, replayed: true };
			throw new EstimateError(
				"Esta versión ya fue emitida. Guarda una nueva revisión para otra oferta.",
				409,
			);
		}
		const open = (
			await tx.query(
				"SELECT id FROM estimate_offers WHERE estimate_id=$1 AND status IN ('issued','accepted') AND contract_id IS NULL",
				[e.id],
			)
		).rows;
		if (open.length)
			throw new EstimateError(
				"Resuelve la oferta pendiente antes de emitir otra versión.",
				409,
			);
		const snapshot = (
			await tx.query<{ snapshot: Snapshot }>(
				"SELECT snapshot FROM estimate_revisions WHERE estimate_id=$1 AND revision=$2",
				[e.id, e.revision],
			)
		).rows[0]?.snapshot;
		if (
			snapshot?.calculation.status !== "complete" ||
			snapshot.calculation.price_cents === null ||
			snapshot.calculation.price_cents <= 0
		)
			throw new EstimateError(
				"Completa el presupuesto con precio positivo antes de emitir.",
			);
		const property = (
			await tx.query<{ status: string; deleted_at: string | null }>(
				"SELECT * FROM properties WHERE id=$1 FOR UPDATE",
				[e.property_id],
			)
		).rows[0];
		if (!property || property.deleted_at || property.status !== "active")
			throw new EstimateError("La localidad no está activa.");
		const t = v.terms;
		if (
			t.valid_until < today() ||
			(t.end_date && (t.end_date < t.start_date || t.end_date < today()))
		)
			throw new EstimateError("Revisa vigencia y fechas del servicio.");
		if (
			!(
				await tx.query(
					"SELECT key FROM catalog_options WHERE category='contract_frequency' AND key=$1 AND active=true",
					[t.frequency],
				)
			).rows.length
		)
			throw new EstimateError("Selecciona una frecuencia vigente.");
		const monthly = snapshot.calculation.price_cents * t.visits_per_month;
		if (!Number.isSafeInteger(monthly) || monthly > 100000000)
			throw new EstimateError("El importe mensual supera el máximo permitido.");
		const prior = (
			await tx.query<Offer>(
				"SELECT * FROM estimate_offers WHERE estimate_id=$1 AND contract_id IS NOT NULL ORDER BY issued_at DESC LIMIT 1",
				[e.id],
			)
		).rows[0];
		let target: BoundContract | undefined;
		if (prior) {
			target = (
				await tx.query<BoundContract>(
					"SELECT * FROM contracts WHERE id=$1 FOR UPDATE",
					[prior.contract_id],
				)
			).rows[0];
			if (
				!target ||
				target.deleted_at ||
				["ended", "cancelled"].includes(target.status)
			)
				throw new EstimateError("El contrato anterior no admite cambios.");
		}
		const terms: OfferTerms = {
			...t,
			price_basis: "per_visit",
			currency: "USD",
			per_visit_cents: snapshot.calculation.price_cents,
			monthly_cents: monthly,
		};
		const id = randomUUID();
		await tx.query(
			"INSERT INTO estimate_offers(id,estimate_id,estimate_revision,status,snapshot,terms,issued_by,target_contract_id,target_baseline_version,replaces_offer_id) VALUES($1,$2,$3,'issued',$4::jsonb,$5::jsonb,$6,$7,$8,$9)",
			[
				id,
				e.id,
				e.revision,
				JSON.stringify(snapshot),
				JSON.stringify(terms),
				actor,
				target?.id ?? null,
				target?.baseline_version ?? null,
				target?.current_offer_id ?? null,
			],
		);
		await recordEstimateAudit(tx, actor, "estimate_offer", id, "issued", {
			estimate_id: e.id,
			revision: e.revision,
			terms,
		});
		return { id, replayed: false };
	});
}
export async function acceptOffer(db: Database, input: unknown, actor: string) {
	const v = parse(acceptanceSchema, input);
	return db.transaction(async (tx) => {
		const o = await lockOffer(tx, v.offer_id);
		if (o.status !== "issued" || o.revision !== v.revision)
			throw new EstimateError("La oferta cambió o ya fue resuelta.", 409);
		if (
			o.terms.valid_until < today() ||
			(o.terms.end_date && o.terms.end_date < today())
		)
			throw new EstimateError("La oferta venció. Emite una nueva versión.");
		const received = Date.parse(v.accepted_at);
		if (
			received > Date.now() + 60000 ||
			received < Date.parse(o.issued_at) - 60000
		)
			throw new EstimateError(
				"La aceptación debe corresponder a esta emisión y no ser futura.",
			);
		await tx.query(
			"UPDATE estimate_offers SET status='accepted',revision=revision+1,accepted_at=$2,accepted_by=$3,acceptance_authority=$4,evidence_method=$5,evidence_reference=$6,recorded_at=now(),recorded_by=$7 WHERE id=$1",
			[
				o.id,
				v.accepted_at,
				v.accepted_by,
				v.authority,
				v.evidence_method,
				v.evidence_reference,
				actor,
			],
		);
		await recordEstimateAudit(
			tx,
			actor,
			"estimate_offer",
			o.id,
			"acceptance_recorded",
			{
				accepted_by: v.accepted_by,
				authority: v.authority,
				accepted_at: v.accepted_at,
				evidence_method: v.evidence_method,
				evidence_reference: v.evidence_reference,
			},
		);
		return { id: o.id };
	});
}
export async function closeOffer(db: Database, input: unknown, actor: string) {
	const v = parse(closeSchema, input);
	return db.transaction(async (tx) => {
		const o = await lockOffer(tx, v.offer_id);
		if (o.status !== "issued" || o.revision !== v.revision)
			throw new EstimateError(
				"Solo se retiran o rechazan ofertas pendientes vigentes.",
				409,
			);
		await tx.query(
			"UPDATE estimate_offers SET status=$2,revision=revision+1,closed_reason=$3 WHERE id=$1",
			[o.id, v.action === "withdraw" ? "withdrawn" : "declined", v.reason],
		);
		await recordEstimateAudit(tx, actor, "estimate_offer", o.id, v.action, {
			reason: v.reason,
		});
		return { id: o.id };
	});
}
export async function bindOffer(db: Database, input: unknown, actor: string) {
	const v = parse(bindSchema, input);
	return db.transaction(async (tx) => {
		const o = await lockOffer(tx, v.offer_id);
		if (o.status !== "accepted")
			throw new EstimateError(
				"Registra la aceptación antes de crear o actualizar un contrato.",
			);
		if (o.contract_id) return { id: o.contract_id, replayed: true };
		if (o.revision !== v.revision)
			throw new EstimateError("La oferta cambió. Recarga.", 409);
		try {
			const result = await applyAcceptedOffer(
				tx,
				o.id,
				v.contract_revision,
				actor,
			);
			await recordEstimateAudit(
				tx,
				actor,
				"contract",
				result.id,
				o.target_contract_id
					? "accepted_change_applied"
					: "created_from_acceptance",
				{
					offer_id: o.id,
					estimate_id: o.estimate_id,
					estimate_revision: o.estimate_revision,
					baseline_version: result.baseline_version,
				},
			);
			return result;
		} catch (e) {
			if (e instanceof BaselineError)
				throw new EstimateError(e.message, e.status);
			throw e;
		}
	});
}
