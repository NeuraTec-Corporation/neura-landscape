"use client";
import { useEffect, useState } from "react";
import {
	Notices,
	useManagement,
	usd,
	AmountLines,
	type AmountLine,
} from "./management-shared";
import type { Visit } from "./visits-workspace";
import { VisitResourcePanel } from "./resource-workspace";
export function CostsWorkspace() {
	const state = useManagement<Visit[]>("costs"),
		[selected, setSelected] = useState(""),
		[lines, setLines] = useState<AmountLine[]>([]);
	useEffect(() => {
		const value = new URLSearchParams(window.location.search).get("visit_id");
		if (value) setSelected(value);
	}, []);
	const visit = state.data?.find((v) => v.id === selected);
	useEffect(() => {
		setLines(
			(visit?.cost_lines ?? []).map((line) => ({
				clientKey: line.id,
				category: line.category,
				description: line.description,
				quantity: Number(line.quantity),
				unit_price: line.unit_price_cents / 100,
			})),
		);
	}, [visit]);
	return (
		<div className="manage-workspace">
			<Notices error={state.error} notice={state.notice} />
			<section className="panel">
				<h2>Costos con detalle y motivo</h2>
				<p>
					Registra cantidades y costos unitarios a partir de consumos,
					comprobantes o tarifas. Los importes no se solicitan al personal para
					finalizar una visita.
				</p>
				<label>
					Visita
					<select
						value={selected}
						onChange={(e) => setSelected(e.target.value)}
					>
						<option value="">Selecciona una visita...</option>
						{state.data?.map((v) => (
							<option key={v.id} value={v.id}>
								{v.customer_name} · {v.property_name} ·{" "}
								{new Date(v.scheduled_at).toLocaleDateString("es", {
									timeZone: "America/New_York",
								})}{" "}
								· {v.title}
							</option>
						))}
					</select>
				</label>
			</section>
			{visit ? (
				<section className="panel">
					<h2>{visit.title || visit.property_name}</h2>
					<p>
						{visit.customer_name} · {visit.crew_name}
					</p>
					<div className="manage-kpis">
						<article>
							<span>Ingreso asignado</span>
							<strong>
								{usd(visit.revenue_cents ?? visit.planned_revenue_cents ?? 0)}
							</strong>
						</article>
						<article>
							<span>Mano de obra registrada</span>
							<strong>
								{visit.labor_cents === null
									? "Pendiente"
									: usd(visit.labor_cents)}
							</strong>
						</article>
						<article>
							<span>Otros costos registrados</span>
							<strong>
								{usd(
									visit.materials_cents +
										visit.equipment_cents +
										visit.travel_cents +
										visit.overhead_cents,
								)}
							</strong>
						</article>
					</div>
					<form
						className="manage-form"
						key={`${visit.id}-${visit.revision}`}
						onSubmit={async (e) => {
							e.preventDefault();
							const fd = Object.fromEntries(new FormData(e.currentTarget));
							await state.save({
								...fd,
								id: visit.id,
								revision: visit.revision,
								lines,
							});
						}}
					>
						<fieldset disabled={state.busy}>
							<p>Estas líneas son costos adicionales. Los consumos del plan de materiales y equipos se suman automáticamente; no los registres otra vez aquí.</p>
							<AmountLines lines={lines} onChange={setLines} categories />
							<div className="manage-grid">
								<label>
									Ajuste de mano de obra (USD, opcional)
									<input
										name="labor"
										type="number"
										min="0"
										max="1000000"
										step="0.01"
										placeholder="Conservar el cálculo registrado"
									/>
								</label>
								<label className="field-wide">
									Motivo / comprobante de la corrección *
									<textarea
										name="reason"
										required
										minLength={5}
										maxLength={500}
									/>
								</label>
							</div>
							<p>
								La mano de obra se calcula con minutos reales y tarifas de las
								personas asignadas. Un ajuste manual debe justificarse y queda
								en el historial. El ingreso asignado no equivale a una factura
								ni a un cobro.
							</p>
							<button type="submit">Guardar costos detallados</button>
						</fieldset>
					</form>
					<VisitResourcePanel visitId={visit.id} onChanged={state.refresh}/>
				</section>
			) : null}
		</div>
	);
}
