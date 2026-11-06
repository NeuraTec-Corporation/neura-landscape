"use client";
import { EstimateLifecycle } from "./estimate-lifecycle";
import { useEffect, useRef, useState } from "react";
import {
	calculate,
	type DraftInput,
	type Rate,
	type EstimateRecord,
	type Snapshot,
	type Workspace,
} from "@/modules/estimates/contract";
import { Notices, usd } from "./management-shared";
import { useCatalogs } from "./catalogs";
const fresh = (): DraftInput => ({
	property_id: "",
	title: "",
	rate_id: null,
	zone_ids: [],
	areas_independent: false,
	resources_reviewed: false,
	labor_hourly: null,
	overhead_percent: null,
	margin_percent: null,
	lines: [],
	reason: "Presupuesto inicial",
	notes: "",
});
const freshRate = () => ({
	name: "",
	unit: "sqft" as "sqft" | "sqm",
	quantity_per_person_hour: 0,
	setup_person_minutes: 0,
	source: "",
	confidence: "estimated" as "estimated" | "field_validated",
	active: true,
});
const money = (n: number | null) => (n === null ? "Pendiente" : usd(n));
const number = (s: string) => (s === "" ? null : Number(s));
async function request(input?: unknown): Promise<Workspace> {
	const r = await fetch(
		"/api/estimates",
		input
			? {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(input),
				}
			: { cache: "no-store" },
	);
	const v = await r.json();
	if (!r.ok)
		throw new Error([v.error, ...Object.values(v.fields || {})].join(" · "));
	return v;
}
function Breakdown({
	snapshot,
}: {
	snapshot: Pick<Snapshot, "calculation" | "warnings">;
}) {
	const c = snapshot.calculation;
	return (
		<section className="estimate-breakdown">
			<div className="manage-actions">
				<h3>Desglose del presupuesto</h3>
				<span className="pill">
					{c.status === "complete" ? "Cálculo completo" : "Datos pendientes"}
				</span>
			</div>
			<div className="estimate-metrics">
				<div>
					<span>Esfuerzo estimado</span>
					<strong>
						{c.person_hours === null
							? "Pendiente"
							: `${c.person_hours.toFixed(2)} h-persona`}
					</strong>
				</div>
				<div>
					<span>Costo previsto</span>
					<strong>{money(c.cost_cents)}</strong>
				</div>
				<div>
					<span>Precio sugerido</span>
					<strong>{money(c.price_cents)}</strong>
				</div>
				<div>
					<span>Contribución prevista</span>
					<strong>{money(c.margin_cents)}</strong>
				</div>
			</div>
			<dl className="estimate-components">
				<dt>Mano de obra</dt>
				<dd>{money(c.labor_cents)}</dd>
				<dt>Materiales, equipos y otros</dt>
				<dd>{money(c.resource_cents)}</dd>
				<dt>Margen objetivo sobre venta</dt>
				<dd>
					{c.margin_percent === null ? "Pendiente" : `${c.margin_percent}%`}
				</dd>
				<dt>Indirectos</dt>
				<dd>{money(c.overhead_cents)}</dd>
			</dl>
			{c.missing.length ? (
				<p className="estimate-warning" role="status">
					Para completar: {c.missing.join(" · ")}.
				</p>
			) : null}
			<p>
				Precio = costo / (1 − margen sobre venta). Las horas-persona son
				esfuerzo, no duración automática de una cuadrilla.
			</p>
			{snapshot.warnings.map((w) => (
				<p key={w} className="estimate-caption">
					{w}
				</p>
			))}
		</section>
	);
}
export function EstimateWorkspace() {
	const catalogs = useCatalogs();
	const detailRef = useRef<HTMLElement>(null);
	const editRef = useRef<HTMLElement>(null);

	const [data, setData] = useState<Workspace | null>(null),
		[error, setError] = useState(""),
		[notice, setNotice] = useState(""),
		[busy, setBusy] = useState(false),
		[tab, setTab] = useState("drafts"),
		[draft, setDraft] = useState<DraftInput>(fresh),
		[detail, setDetail] = useState<EstimateRecord | null>(null),
		[historyRevision, setHistoryRevision] = useState<number | null>(null),
		[rateEdit, setRateEdit] = useState<Rate | null>(null),
		[rateForm, setRateForm] = useState(freshRate);
	const refresh = async () => setData(await request());
	useEffect(() => {
		if (detail) detailRef.current?.focus();
	}, [detail]);
	useEffect(() => {
		const controller = new AbortController();
		fetch("/api/estimates", { cache: "no-store", signal: controller.signal })
			.then(async (r) => {
				const v = await r.json();
				if (!r.ok) throw new Error(v.error);
				setData(v);
			})
			.catch((e) => {
				if (e.name !== "AbortError") setError(e.message);
			});
		return () => controller.abort();
	}, []);
	const save = async (input: unknown) => {
		setBusy(true);
		setError("");
		setNotice("");
		try {
			await request(input);
			await refresh();
			setNotice("Guardado. Se conserva el historial de versiones.");
			return true;
		} catch (e) {
			setError(e instanceof Error ? e.message : "No se pudo guardar.");
			return false;
		} finally {
			setBusy(false);
		}
	};
	const zones =
		data?.zones.filter((z) => z.property_id === draft.property_id) || [];
	const selected = zones.filter((z) => draft.zone_ids.includes(z.id));
	const rate =
		data?.rates.find((r) => r.id === draft.rate_id && r.active) || null;
	let preview: ReturnType<typeof calculate> | null = null,
		previewError = "";
	try {
		preview = calculate(draft, selected, rate);
	} catch (e) {
		previewError = e instanceof Error ? e.message : "Revisa el cálculo.";
	}
	const update = <K extends keyof DraftInput>(key: K, value: DraftInput[K]) =>
		setDraft((v) => ({ ...v, [key]: value }));
	const recorded = detail
		? historyRevision === null
			? detail.snapshot
			: data?.history.find(
					(h) => h.estimate_id === detail.id && h.revision === historyRevision,
				)?.snapshot
		: null;
	return (
		<div className="manage-workspace estimate-workspace">
			<Notices error={error} notice={notice} />
			<header className="survey-hero">
				<p className="eyebrow">PLANIFICAR CON FUNDAMENTO</p>
				<h1>Presupuestos con fundamento.</h1>
				<p>
					Corte de césped · Rendimiento, recursos y margen con un desglose que
					puedes revisar.
				</p>
			</header>
			<div className="detail-tabs">
				<button
					type="button"
					aria-pressed={tab === "agreements"}
					onClick={() => setTab("agreements")}
				>
					Ofertas y acuerdos
				</button>
				<button
					type="button"
					aria-pressed={tab === "drafts"}
					onClick={() => setTab("drafts")}
				>
					Presupuestos
				</button>
				<button
					type="button"
					aria-pressed={tab === "rates"}
					onClick={() => setTab("rates")}
				>
					Rendimientos
				</button>
			</div>
			{!data ? (
				<p role="status">
					{error ? "Presupuestos no disponibles." : "Cargando presupuestos..."}
				</p>
			) : tab === "agreements" ? (
				<EstimateLifecycle data={data} busy={busy} save={save} />
			) : tab === "rates" ? (
				<>
					<section className="panel">
						<h2>{rateEdit ? "Editar rendimiento" : "Nuevo rendimiento"}</h2>
						<p>
							Define una tasa por hora-persona y documenta de dónde proviene. No
							se incluyen tasas predeterminadas.
						</p>
						<form
							className="manage-form"
							onSubmit={async (e) => {
								e.preventDefault();
								if (
									await save({
										action: "rate",
										...rateForm,
										...(rateEdit
											? { id: rateEdit.id, revision: rateEdit.revision }
											: {}),
									})
								) {
									setRateEdit(null);
									setRateForm(freshRate());
								}
							}}
						>
							<fieldset disabled={busy || !data.canEdit}>
								<div className="manage-grid">
									<label>
										Nombre *
										<input
											required
											value={rateForm.name}
											onChange={(e) =>
												setRateForm((v) => ({ ...v, name: e.target.value }))
											}
										/>
									</label>
									<label>
										Unidad de superficie
										<select
											value={rateForm.unit}
											onChange={(e) =>
												setRateForm((v) => ({
													...v,
													unit: e.target.value as "sqft" | "sqm",
												}))
											}
										>
											<option value="sqft">Pies cuadrados (ft²)</option>
											<option value="sqm">Metros cuadrados (m²)</option>
										</select>
									</label>
									<label>
										Superficie por hora-persona *
										<input
											type="number"
											min="0.0001"
											step="any"
											required
											value={rateForm.quantity_per_person_hour || ""}
											onChange={(e) =>
												setRateForm((v) => ({
													...v,
													quantity_per_person_hour: Number(e.target.value),
												}))
											}
										/>
									</label>
									<label>
										Preparación (minutos-persona)
										<input
											type="number"
											min="0"
											max="1440"
											step="any"
											value={rateForm.setup_person_minutes}
											onChange={(e) =>
												setRateForm((v) => ({
													...v,
													setup_person_minutes: Number(e.target.value),
												}))
											}
										/>
									</label>
									<label>
										Fuente o método de medición *
										<input
											required
											value={rateForm.source}
											onChange={(e) =>
												setRateForm((v) => ({ ...v, source: e.target.value }))
											}
										/>
									</label>
									<label>
										Calidad de la referencia
										<select
											value={rateForm.confidence}
											onChange={(e) =>
												setRateForm((v) => ({
													...v,
													confidence: e.target.value as
														| "estimated"
														| "field_validated",
												}))
											}
										>
											<option value="estimated">Estimación declarada</option>
											<option value="field_validated">
												Validación de campo declarada
											</option>
										</select>
									</label>
								</div>
								<label className="estimate-check">
									<input
										type="checkbox"
										checked={rateForm.active}
										onChange={(e) =>
											setRateForm((v) => ({ ...v, active: e.target.checked }))
										}
									/>
									Disponible en nuevos presupuestos
								</label>
								<div className="manage-actions">
									<button type="submit" disabled={busy}>
										{rateEdit ? "Guardar rendimiento" : "Crear rendimiento"}
									</button>
									<button
										type="button"
										onClick={() => {
											setRateEdit(null);
											setRateForm(freshRate());
										}}
									>
										Limpiar
									</button>
								</div>
							</fieldset>
						</form>
					</section>
					<div className="manage-card-grid">
						{data.rates.map((r) => (
							<article className="panel" key={r.id}>
								<span className="pill">
									{r.active ? "Disponible" : "Retirado"}
								</span>
								<h3>{r.name}</h3>
								<p>
									{r.quantity_per_person_hour}{" "}
									{r.unit === "sqft" ? "ft²" : "m²"} / hora-persona · revisión{" "}
									{r.revision}
								</p>
								<p>Preparación: {r.setup_person_minutes} minutos-persona</p>
								<p>{r.source}</p>
								<p>
									{r.confidence === "estimated"
										? "Estimación declarada"
										: "Validación de campo declarada"}
								</p>
								{data.canEdit ? (
									<button
										type="button"
										onClick={() => {
											setRateEdit(r);
											setRateForm({
												...r,
												quantity_per_person_hour: Number(
													r.quantity_per_person_hour,
												),
												setup_person_minutes: Number(r.setup_person_minutes),
											});
										}}
									>
										Editar / retirar
									</button>
								) : null}
							</article>
						))}
					</div>
				</>
			) : (
				<>
					{detail && recorded ? (
						<section className="panel" tabIndex={-1} ref={detailRef}>
							<div className="manage-actions">
								<div>
									<p className="eyebrow">{detail.number}</p>
									<h2>{detail.title}</h2>
									<p>
										{recorded.property.name} · {detail.customer_name}
									</p>
								</div>
								<button
									type="button"
									onClick={() => {
										setDetail(null);
										setHistoryRevision(null);
									}}
								>
									Cerrar detalle
								</button>
							</div>
							<label>
								Versión guardada
								<select
									value={historyRevision ?? detail.revision}
									onChange={(e) => setHistoryRevision(Number(e.target.value))}
								>
									{data.history
										.filter((h) => h.estimate_id === detail.id)
										.map((h) => (
											<option key={h.revision} value={h.revision}>
												Revisión {h.revision} · {h.reason}
											</option>
										))}
								</select>
							</label>
							<p>
								Rendimiento guardado: {recorded.rate?.name || "Pendiente"}
								{recorded.rate ? ` · revisión ${recorded.rate.revision}` : ""}
							</p>
							<ul>
								{recorded.zones.map((z) => (
									<li key={z.id}>
										{z.name}: {z.area ?? "Sin medir"}{" "}
										{z.unit === "sqft" ? "ft²" : "m²"} ·{" "}
										{catalogs.label(
											"measurement_quality",
											z.measurement_status,
										)}
									</li>
								))}
							</ul>
							<Breakdown snapshot={recorded} />
							<p>{recorded.input.notes}</p>
						</section>
					) : null}
					<section className="panel" tabIndex={-1} ref={editRef}>
						<div className="manage-actions">
							<div>
								<p className="eyebrow">BORRADOR DE CORTE DE CÉSPED</p>
								<h2>
									{draft.id ? "Revisar presupuesto" : "Nuevo presupuesto"}
								</h2>
							</div>
							<button
								type="button"
								onClick={() => {
									if (
										!draft.title ||
										window.confirm("¿Descartar la edición no guardada?")
									) {
										setDraft(fresh());
										setError("");
									}
								}}
							>
								Nuevo / limpiar
							</button>
						</div>
						<p>
							Guarda también con costos pendientes. Este borrador no aprueba
							trabajos ni cambia contratos o facturas.
						</p>
						<form
							className="manage-form"
							onSubmit={async (e) => {
								e.preventDefault();
								setBusy(true);
								setError("");
								setNotice("");
								try {
									const r = await fetch("/api/estimates", {
										method: "POST",
										headers: { "Content-Type": "application/json" },
										body: JSON.stringify({
											...draft,
											action: "save",
											rate_revision: rate?.revision ?? null,
											zone_revisions: Object.fromEntries(
												selected.map((z) => [z.id, z.revision]),
											),
										}),
									});
									const v = await r.json();
									if (!r.ok)
										throw new Error(
											[v.error, ...Object.values(v.fields || {})].join(" · "),
										);
									setDraft((d) => ({ ...d, id: v.id, revision: v.revision }));
									await refresh();
									setNotice(
										`Presupuesto ${v.number} guardado · revisión ${v.revision}.`,
									);
								} catch (e) {
									setError(
										e instanceof Error ? e.message : "No se pudo guardar.",
									);
								} finally {
									setBusy(false);
								}
							}}
						>
							<fieldset disabled={busy || !data.canEdit}>
								<h3>01 · Localidad y superficies</h3>
								<div className="manage-grid">
									<label>
										Título *
										<input
											required
											value={draft.title}
											onChange={(e) => update("title", e.target.value)}
											placeholder="Servicio y alcance del presupuesto"
										/>
									</label>
									<label>
										Cliente / localidad *
										<select
											required
											value={draft.property_id}
											disabled={Boolean(draft.id)}
											onChange={(e) =>
												setDraft((v) => ({
													...v,
													property_id: e.target.value,
													zone_ids: [],
												}))
											}
										>
											<option value="">Selecciona una localidad...</option>
											{data.properties.map((p) => (
												<option key={p.id} value={p.id}>
													{p.customer_name} · {p.name}{" "}
													{p.code ? `[${p.code}]` : ""}
												</option>
											))}
										</select>
									</label>
								</div>
								<div className="estimate-zones">
									{zones.map((z) => (
										<label className="estimate-zone" key={z.id}>
											<input
												type="checkbox"
												checked={draft.zone_ids.includes(z.id)}
												onChange={(e) =>
													update(
														"zone_ids",
														e.target.checked
															? [...draft.zone_ids, z.id]
															: draft.zone_ids.filter((id) => id !== z.id),
													)
												}
											/>
											<span>
												<strong>{z.name}</strong>
												<small>
													{z.area ?? "Sin medir"}{" "}
													{z.unit === "sqft"
														? "ft²"
														: z.unit === "sqm"
															? "m²"
															: z.unit}{" "}
													·{" "}
													{catalogs.label(
														"measurement_quality",
														z.measurement_status,
													)}
												</small>
											</span>
										</label>
									))}
								</div>
								{!zones.length ? (
									<p>
										Registra primero las zonas de césped en Propiedades y
										localidades → Zonas y medidas.
									</p>
								) : null}
								<label className="estimate-check">
									<input
										type="checkbox"
										checked={draft.areas_independent}
										onChange={(e) =>
											update("areas_independent", e.target.checked)
										}
									/>
									Confirmo que las zonas seleccionadas no se superponen. El
									sistema no verifica límites en el mapa.
								</label>
								<h3>02 · Rendimiento y costo de mano de obra</h3>
								<div className="manage-grid">
									<label>
										Rendimiento de referencia
										<select
											value={draft.rate_id ?? ""}
											onChange={(e) =>
												update("rate_id", e.target.value || null)
											}
										>
											<option value="">Pendiente de definir</option>
											{data.rates
												.filter((r) => r.active)
												.map((r) => (
													<option key={r.id} value={r.id}>
														{r.name} · {r.quantity_per_person_hour} {r.unit}
														/h-persona
													</option>
												))}
										</select>
									</label>
									<label>
										Costo laboral (USD / hora-persona)
										<input
											type="number"
											min="0"
											step=".01"
											value={draft.labor_hourly ?? ""}
											onChange={(e) =>
												update("labor_hourly", number(e.target.value))
											}
											placeholder="Deja vacío si aún no lo conoces"
										/>
									</label>
								</div>
								<button
									type="button"
									className="secondary"
									onClick={() => setTab("rates")}
								>
									Crear o mantener rendimientos
								</button>
								<h3>03 · Materiales, equipos y otros recursos</h3>
								<p>
									Registra cantidades y precios conocidos. Una tarifa vacía deja
									el costo pendiente; no reserva inventario.
								</p>
								{draft.lines.map((line, i) => (
									<div className="estimate-resource" key={line.client_key}>
										<label>
											Recurso *
											<input
												required
												value={line.description}
												onChange={(e) =>
													update(
														"lines",
														draft.lines.map((l, n) =>
															n === i
																? { ...l, description: e.target.value }
																: l,
														),
													)
												}
											/>
										</label>
										<label>
											Categoría
											<select
												value={line.category}
												onChange={(e) =>
													update(
														"lines",
														draft.lines.map((l, n) =>
															n === i
																? {
																		...l,
																		category: e.target
																			.value as typeof l.category,
																	}
																: l,
														),
													)
												}
											>
												<option value="materials">Material</option>
												<option value="equipment">Equipo</option>
												<option value="other">Otro</option>
											</select>
										</label>
										<label>
											Cantidad
											<input
												type="number"
												min=".0001"
												step="any"
												required
												value={line.quantity}
												onChange={(e) =>
													update(
														"lines",
														draft.lines.map((l, n) =>
															n === i
																? { ...l, quantity: Number(e.target.value) }
																: l,
														),
													)
												}
											/>
										</label>
										<label>
											Unidad *
											<input
												required
												value={line.unit}
												onChange={(e) =>
													update(
														"lines",
														draft.lines.map((l, n) =>
															n === i ? { ...l, unit: e.target.value } : l,
														),
													)
												}
												placeholder="bolsa, hora, unidad..."
											/>
										</label>
										<label>
											Precio por unidad (USD)
											<input
												type="number"
												min="0"
												step=".01"
												value={line.unit_price ?? ""}
												onChange={(e) =>
													update(
														"lines",
														draft.lines.map((l, n) =>
															n === i
																? { ...l, unit_price: number(e.target.value) }
																: l,
														),
													)
												}
											/>
										</label>
										<button
											type="button"
											onClick={() =>
												update(
													"lines",
													draft.lines.filter((_, n) => n !== i),
												)
											}
										>
											Quitar recurso {i + 1}
										</button>
									</div>
								))}
								<button
									type="button"
									onClick={() =>
										update("lines", [
											...draft.lines,
											{
												client_key: crypto.randomUUID(),
												description: "",
												category: "materials",
												quantity: 1,
												unit: "",
												unit_price: null,
											},
										])
									}
								>
									＋ Añadir recurso
								</button>
								<label className="estimate-check">
									<input
										type="checkbox"
										checked={draft.resources_reviewed}
										onChange={(e) =>
											update("resources_reviewed", e.target.checked)
										}
									/>
									Revisé los recursos. Si no agregué líneas, declaro que no
									requieren costo adicional en este presupuesto.
								</label>
								<h3>04 · Indirectos, margen y revisión</h3>
								<div className="manage-grid">
									<label>
										Indirectos sobre costo directo (%)
										<input
											type="number"
											min="0"
											max="1000"
											step=".01"
											value={draft.overhead_percent ?? ""}
											onChange={(e) =>
												update("overhead_percent", number(e.target.value))
											}
											placeholder="0 si no aplica"
										/>
									</label>
									<label>
										Margen objetivo sobre venta (%)
										<input
											type="number"
											min="0"
											max="99.99"
											step=".01"
											value={draft.margin_percent ?? ""}
											onChange={(e) =>
												update("margin_percent", number(e.target.value))
											}
											placeholder="0 si no aplica"
										/>
									</label>
									<label>
										Motivo de esta versión *
										<input
											required
											minLength={5}
											value={draft.reason}
											onChange={(e) => update("reason", e.target.value)}
										/>
									</label>
									<label>
										Observaciones
										<textarea
											value={draft.notes}
											onChange={(e) => update("notes", e.target.value)}
										/>
									</label>
								</div>
								{preview ? (
									<Breakdown
										snapshot={{
											calculation: preview,
											warnings: [
												"Vista previa. Al guardar se validan las medidas y el rendimiento vigentes en el servidor.",
											],
										}}
									/>
								) : (
									<Notices error={previewError} />
								)}
								<div className="manage-actions">
									<button type="submit" disabled={busy}>
										{busy ? "Guardando..." : "Guardar borrador"}
									</button>
									<span>No se envía al cliente ni se factura.</span>
								</div>
							</fieldset>
						</form>
					</section>
					<section>
						<h2>Presupuestos guardados</h2>
						<div className="manage-card-grid">
							{data.estimates.map((e) => (
								<article className="panel" key={e.id}>
									<p className="eyebrow">
										{e.number} · revisión {e.revision}
									</p>
									<h3>{e.title}</h3>
									<p>
										{e.customer_name} · {e.property_name}
									</p>
									<span className="pill">
										{e.snapshot.calculation.status === "complete"
											? "Borrador calculado"
											: "Borrador con pendientes"}
									</span>
									<strong className="invoice-amount">
										{money(e.snapshot.calculation.price_cents)}
									</strong>
									<div className="manage-actions"><button type="button" onClick={()=>setTab("agreements")}>Ofertas y acuerdos</button>
										<button
											type="button"
											onClick={() => {
												setDetail(e);

												setHistoryRevision(null);
											}}
										>
											Ver detalle
										</button>
										{data.canEdit ? (
											<>
												<button
													type="button"
													onClick={() => {
														setDraft({
															...e.snapshot.input,
															id: e.id,
															revision: e.revision,
															reason: "Revisión del presupuesto",
														});
														setDetail(null);
														setError("");
														requestAnimationFrame(() =>
															editRef.current?.focus(),
														);
													}}
												>
													{data.offers.some(o=>o.estimate_id===e.id&&o.contract_id)?"Preparar cambio":"Editar borrador"}
												</button>
												<button
													type="button"
													disabled={busy}
													onClick={async () => {
														const reason = window.prompt(
															"Motivo para retirar el borrador (se conserva su historial):",
														);
														if (reason)
															await save({
																action: "archive",
																id: e.id,
																revision: e.revision,
																reason,
															});
													}}
												>
													Retirar
												</button>
											</>
										) : null}
									</div>
								</article>
							))}
						</div>
						{!data.estimates.length ? (
							<p>Aún no hay presupuestos guardados.</p>
						) : null}
					</section>
				</>
			)}
		</div>
	);
}
