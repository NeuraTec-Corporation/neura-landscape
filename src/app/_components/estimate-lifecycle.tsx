"use client";
import { CatalogField } from "./catalogs";
import { useState } from "react";
import type { Workspace } from "@/modules/estimates/contract";
import { usd } from "./management-shared";
const states = {
	issued: "Pendiente de aceptación",
	accepted: "Aceptación registrada",
	withdrawn: "Retirada",
	declined: "Rechazada",
};
export function EstimateLifecycle({
	data,
	busy,
	save,
}: {
	data: Workspace;
	busy: boolean;
	save: (v: unknown) => Promise<boolean>;
}) {
	const [selected, setSelected] = useState(""),
		[visits, setVisits] = useState(4);
	const e = data.estimates.find((e) => e.id === selected);
	const offers = data.offers.filter(
		(o) => !selected || o.estimate_id === selected,
	);
	const pending =
		e &&
		data.offers.some(
			(o) =>
				o.estimate_id === e.id &&
				(o.status === "issued" || (o.status === "accepted" && !o.contract_id)),
		);
	const bound =
		e && data.offers.some((o) => o.estimate_id === e.id && o.contract_id);
	return (
		<div className="manage-workspace">
			<section className="panel">
				<p className="eyebrow">DEL PRECIO AL ACUERDO</p>
				<h2>Ofertas y contratos</h2>
				<p>
					1. Revisa y emite condiciones · 2. Registra la aceptación recibida ·
					3. Crea el contrato en borrador o aplica el cambio autorizado.
				</p>
				<p>
					Este registro no envía ofertas ni constituye una firma electrónica. La
					aceptación se registra con su evidencia y la persona que la autoriza.
				</p>
				<label>
					Presupuesto
					<select
						value={selected}
						onChange={(x) => setSelected(x.target.value)}
					>
						<option value="">Todos los acuerdos</option>
						{data.estimates.map((x) => (
							<option key={x.id} value={x.id}>
								{x.number} · {x.customer_name} · {x.title} · v{x.revision}
							</option>
						))}
					</select>
				</label>
			</section>
			{e && data.canEdit && !pending ? (
				<section className="panel">
					<h2>
						{bound
							? "Proponer cambio al contrato"
							: "Emitir oferta de servicio"}
					</h2>
					<p>
						Versión {e.revision} · {e.property_name} · Precio por visita:{" "}
						<strong>{usd(e.snapshot.calculation.price_cents ?? 0)}</strong>. El
						precio mensual se obtiene multiplicando por las visitas acordadas;
						no se deduce de la frecuencia.
					</p>
					{e.snapshot.calculation.status !== "complete" ? (
						<p role="status">Completa el cálculo antes de emitir.</p>
					) : (
						<form
							className="manage-form"
							key={e.id + e.revision}
							onSubmit={async (ev) => {
								ev.preventDefault();
								const f = new FormData(ev.currentTarget);
								await save({
									action: "issue",
									id: e.id,
									revision: e.revision,
									terms: {
										...Object.fromEntries(f),
										reviewed: f.has("reviewed"),
									},
								});
							}}
						>
							<fieldset disabled={busy}>
								<div className="manage-grid">
									<label>
										Oferta válida hasta
										<input name="valid_until" type="date" required />
									</label>
									<label>
										Inicio del servicio
										<input name="start_date" type="date" required />
									</label>
									<label>
										Fin del servicio (opcional)
										<input name="end_date" type="date" />
									</label>
									<CatalogField
										label="Frecuencia"
										category="contract_frequency"
										name="frequency"
										required
									/>
									<label>
										Visitas acordadas al mes
										<input
											name="visits_per_month"
											type="number"
											min="1"
											max="100"
											value={visits}
											onChange={(x) => setVisits(Number(x.target.value))}
											required
										/>
									</label>
									<label>
										Minutos de cuadrilla por visita
										<input
											name="estimated_minutes"
											type="number"
											min="1"
											max="1440"
											required
										/>
									</label>
									<CatalogField
										label="Momento de cobro"
										category="billing_timing"
										name="billing_timing"
										defaultValue="advance"
									/>
									<label>
										Plazo de pago (días)
										<input
											name="due_days"
											type="number"
											min="0"
											max="90"
											required
										/>
									</label>
									<label>
										Alcance incluido
										<textarea
											name="scope"
											maxLength={500}
											defaultValue={e.title}
											required
										/>
									</label>
									<label>
										Exclusiones
										<textarea name="exclusions" maxLength={3000} />
									</label>
									<label>
										Condiciones de pago
										<textarea name="payment_terms" maxLength={2000} required />
									</label>
								</div>
								<p className="notice">
									Cuota mensual propuesta:{" "}
									<strong>
										{usd((e.snapshot.calculation.price_cents ?? 0) * visits)}
									</strong>
									. Las horas-persona del presupuesto no son minutos de
									cuadrilla; revisa la duración con el equipo previsto.
								</p>
								<label className="estimate-check">
									<input type="checkbox" name="reviewed" required /> Revisé
									precio, alcance, vigencia y condiciones con capacidad
									operativa suficiente.
								</label>
								<button type="submit">Fijar versión y emitir oferta</button>
							</fieldset>
						</form>
					)}
				</section>
			) : pending ? (
				<p className="notice">
					Resuelve la oferta pendiente o vincula la aceptación antes de preparar
					una nueva revisión.
				</p>
			) : null}
			{!offers.length ? (
				<p>
					Aún no hay ofertas emitidas. Selecciona un presupuesto completo para
					preparar sus condiciones.
				</p>
			) : null}
			{offers.map((o) => {
				const c = data.contracts.find(
					(c) => c.id === (o.contract_id || o.target_contract_id),
				);
				return (
					<article key={o.id} className="panel">
						<div className="manage-actions">
							<h2>
								{o.number} · v{o.estimate_revision}
							</h2>
							<span className="pill">{states[o.status]}</span>
						</div>
						<p>
							{o.customer_name} · {o.snapshot.property.name}
							{o.target_contract_id ? " · Cambio de acuerdo" : ""}
						</p>
						<div className="estimate-metrics">
							<div>
								<span>Por visita</span>
								<strong>{usd(o.terms.per_visit_cents)}</strong>
							</div>
							<div>
								<span>Cuota mensual</span>
								<strong>{usd(o.terms.monthly_cents)}</strong>
							</div>
							<div>
								<span>Visitas / mes</span>
								<strong>{o.terms.visits_per_month}</strong>
							</div>
						</div>
						<details>
							<summary>Ver condiciones de la oferta</summary>
							<section aria-label="Condiciones comerciales">
								<h3>{o.title}</h3>
								<p>{o.terms.scope}</p>
								<p>
									Exclusiones:{" "}
									{o.terms.exclusions ||
										"Sin exclusiones adicionales registradas."}
								</p>
								<p>
									Servicio: {o.terms.start_date} —{" "}
									{o.terms.end_date || "Sin fecha final"} · Oferta válida hasta{" "}
									{o.terms.valid_until}
								</p>
								<p>
									{o.terms.frequency} · {o.terms.estimated_minutes} min por
									visita
								</p>
								<p>
									Cobro{" "}
									{o.terms.billing_timing === "advance"
										? "por adelantado"
										: "al finalizar el período"}{" "}
									· Plazo: {o.terms.due_days} días. {o.terms.payment_terms}
								</p>
							</section>
						</details>
						{o.accepted_by ? (
							<p>
								Aceptó: {o.accepted_by} · {o.acceptance_authority} ·{" "}
								{o.accepted_at
									? new Date(o.accepted_at).toLocaleString("es-US")
									: null}
								. Evidencia: {o.evidence_reference}
							</p>
						) : null}
						{o.closed_reason ? <p>Motivo: {o.closed_reason}</p> : null}
						{data.canEdit && o.status === "issued" ? (
							<>
								<details>
									<summary>Registrar aceptación recibida</summary>
									<form
										className="manage-form"
										onSubmit={async (ev) => {
											ev.preventDefault();
											const f = new FormData(ev.currentTarget);
											const at = String(f.get("accepted_at"));
											await save({
												action: "accept",
												...Object.fromEntries(f),
												offer_id: o.id,
												revision: o.revision,
												accepted_at: new Date(at).toISOString(),
												confirmed: f.has("confirmed"),
											});
										}}
									>
										<fieldset disabled={busy}>
											<div className="manage-grid">
												<label>
													Nombre de quien acepta
													<input name="accepted_by" maxLength={2000} required />
												</label>
												<label>
													Responsabilidad / autorización
													<input
														name="authority"
														placeholder="Titular, representante autorizado…"
														maxLength={2000}
														required
													/>
												</label>
												<label>
													Fecha y hora de aceptación
													<input
														name="accepted_at"
														type="datetime-local"
														required
													/>
												</label>
												<CatalogField
													label="Evidencia recibida"
													category="acceptance_evidence"
													name="evidence_method"
													defaultValue="signed_document"
												/>
												<label>
													Referencia verificable de la evidencia
													<textarea
														name="evidence_reference"
														minLength={5}
														maxLength={2000}
														required
													/>
												</label>
											</div>
											<label>
												<input type="checkbox" name="confirmed" required />{" "}
												Verifiqué la aceptación de esta versión y la
												autorización del firmante.
											</label>
											<button type="submit">Registrar aceptación</button>
										</fieldset>
									</form>
								</details>
								<div className="manage-actions">
									{(["withdraw", "decline"] as const).map((action) => (
										<button
											type="button"
											key={action}
											disabled={busy}
											onClick={() => {
												const reason = window.prompt(
													"Explica el motivo (mínimo cinco caracteres)",
												);
												if (reason)
													void save({
														action,
														offer_id: o.id,
														revision: o.revision,
														reason,
													});
											}}
										>
											{action === "withdraw"
												? "Retirar oferta"
												: "Registrar rechazo"}
										</button>
									))}
								</div>
							</>
						) : null}
						{data.canEdit && o.status === "accepted" && !o.contract_id ? (
							<form
								className="manage-form"
								onSubmit={async (ev) => {
									ev.preventDefault();
									await save({
										action: "bind",
										offer_id: o.id,
										revision: o.revision,
										contract_revision: c?.revision,
									});
								}}
							>
								<fieldset disabled={busy}>
									<label>
										<input type="checkbox" required /> Confirmo que estas
										condiciones aceptadas deben{" "}
										{o.target_contract_id
											? "actualizar el contrato existente"
											: "crear el contrato en borrador"}
										.
									</label>
									<button type="submit">
										{o.target_contract_id
											? "Aplicar cambio aceptado"
											: "Crear contrato en borrador"}
									</button>
								</fieldset>
							</form>
						) : null}
						{o.contract_id ? (
							<p className="notice">
								Vinculado al contrato · Acuerdo vigente v{c?.baseline_version} ·{" "}
								<a href="/contratos">Ver contratos</a>. Para cambiar
								condiciones, guarda una nueva revisión del presupuesto y emite
								otra oferta.
							</p>
						) : null}
						{o.contract_id ? (
							<details>
								<summary>Historial de acuerdos conservados</summary>
								{data.baselines
									.filter((b) => b.contract_id === o.contract_id)
									.map((b) => (
										<p key={b.version}>
											Acuerdo v{b.version} · Desde{" "}
											{String(b.effective_from).slice(0, 10)} ·{" "}
											{usd(b.snapshot.terms.monthly_cents)} / mes ·{" "}
											{b.snapshot.accepted_by}
										</p>
									))}
							</details>
						) : null}
					</article>
				);
			})}
		</div>
	);
}
