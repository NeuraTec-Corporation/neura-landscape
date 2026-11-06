import { randomUUID } from "node:crypto";
import type { Offer, BoundContract } from "../estimates/lifecycle-contract.ts";
interface Tx {
	query<T = Record<string, unknown>>(
		sql: string,
		params?: unknown[],
	): Promise<{ rows: T[] }>;
}
export class BaselineError extends Error {
	status = 409;
}
export async function applyAcceptedOffer(
	tx: Tx,
	offerId: string,
	expectedContractRevision: number | undefined,
	actor: string,
) {
	const offer = (
		await tx.query<Offer>(
			"SELECT * FROM estimate_offers WHERE id=$1 FOR UPDATE",
			[offerId],
		)
	).rows[0];
	if (offer?.status !== "accepted")
		throw new BaselineError("Registra primero la aceptación de la oferta.");
	if (offer.contract_id) return { id: offer.contract_id, replayed: true };
	const property = (
		await tx.query<{ id: string; deleted_at: string | null; status: string }>(
			"SELECT * FROM properties WHERE id=$1 FOR UPDATE",
			[offer.snapshot.property.id],
		)
	).rows[0];
	if (!property || property.deleted_at || property.status !== "active")
		throw new BaselineError("La localidad ya no está activa.");
	const t = offer.terms;
	const today = new Date().toLocaleDateString("sv-SE", {
		timeZone: "America/New_York",
	});
	if (t.end_date && t.end_date < today)
		throw new BaselineError("El período de servicio ya finalizó.");
	if (offer.target_contract_id && t.start_date > today)
		throw new BaselineError(
			"El cambio aceptado se aplicará cuando llegue su fecha de inicio; el acuerdo actual continúa vigente.",
		);
	let id = offer.target_contract_id || randomUUID(),
		version = 1;
	if (offer.target_contract_id) {
		const old = (
			await tx.query<BoundContract>(
				"SELECT * FROM contracts WHERE id=$1 FOR UPDATE",
				[id],
			)
		).rows[0];
		if (
			!old ||
			old.deleted_at ||
			["ended", "cancelled"].includes(old.status) ||
			old.revision !== expectedContractRevision ||
			old.current_offer_id !== offer.replaces_offer_id ||
			old.baseline_version !== offer.target_baseline_version
		)
			throw new BaselineError(
				"El contrato o su acuerdo vigente cambió. Recarga y revisa el cambio.",
			);
		version = old.baseline_version + 1;
		await tx.query(
			"UPDATE contracts SET service=$2,service_key='mowing',frequency=$3,monthly_cents=$4,visits_per_month=$5,estimated_minutes=$6,current_offer_id=$7,baseline_version=$8,effective_from=$9,effective_until=$10,billing_timing=$11,due_days=$12,revision=revision+1 WHERE id=$1",
			[
				id,
				t.scope,
				t.frequency,
				t.monthly_cents,
				t.visits_per_month,
				t.estimated_minutes,
				offer.id,
				version,
				t.start_date,
				t.end_date,
				t.billing_timing,
				t.due_days,
			],
		);
	} else {
		await tx.query(
			"INSERT INTO contracts(id,property_id,service,service_key,frequency,monthly_cents,visits_per_month,estimated_minutes,status,source_offer_id,current_offer_id,baseline_version,effective_from,effective_until,billing_timing,due_days) VALUES($1,$2,$3,'mowing',$4,$5,$6,$7,'draft',$8,$8,1,$9,$10,$11,$12)",
			[
				id,
				property.id,
				t.scope,
				t.frequency,
				t.monthly_cents,
				t.visits_per_month,
				t.estimated_minutes,
				offer.id,
				t.start_date,
				t.end_date,
				t.billing_timing,
				t.due_days,
			],
		);
	}
	await tx.query(
		"INSERT INTO contract_baselines(contract_id,version,offer_id,snapshot,effective_from,actor) VALUES($1,$2,$3,$4::jsonb,$5,$6)",
		[
			id,
			version,
			offer.id,
			JSON.stringify({
				estimate_id: offer.estimate_id,
				estimate_revision: offer.estimate_revision,
				estimate: offer.snapshot,
				terms: t,
				accepted_at: offer.accepted_at,
				accepted_by: offer.accepted_by,
				authority: offer.acceptance_authority,
				evidence_method: offer.evidence_method,
				evidence_reference: offer.evidence_reference,
			}),
			t.start_date,
			actor,
		],
	);
	await tx.query(
		"UPDATE estimate_offers SET contract_id=$2,revision=revision+1 WHERE id=$1",
		[offer.id, id],
	);
	return { id, baseline_version: version, replayed: false };
}
