"use client";
import { CatalogSelect } from "./catalogs";
import { useEffect, useState } from "react";
type Row = {
	source_offer_id?: string | null;
	baseline_version?: number;
	effective_from?: string | null;
	effective_until?: string | null;
	id: string;
	revision: number;
	property_id: string;
	property_name: string;
	property_code: string;
	customer_name: string;
	customer_id: string;
	service: string;
	service_key?: string | null;
	frequency: string;
	monthly_cents: number;
	visits_per_month: number;
	estimated_minutes: number;
	status: string;
	deleted_at: string | null;
	completed: number;
	scheduled: number;
	started: number;
	cancelled: number;
	remaining: number;
	labor_cents: number;
	materials_cents: number;
	equipment_cents: number;
	travel_cents: number;
	overhead_cents: number;
	total_cost_cents: number;
	allocated_revenue_cents: number;
	contribution_cents: number;
};
type Site = {
	id: string;
	customer_name: string;
	name: string;
	code: string;
	status: string;
};
const statuses: Record<string, string> = {
	draft: "Borrador",
	active: "Activo",
	paused: "Pausado",
	ended: "Finalizado",
	cancelled: "Cancelado",
};
const money = (v: number) =>
	new Intl.NumberFormat("es-US", { style: "currency", currency: "USD" }).format(
		(v || 0) / 100,
	);
export function ContractWorkspace({ control = false }: { control?: boolean }) {
	const [rows, setRows] = useState<Row[]>([]),
		[sites, setSites] = useState<Site[]>([]),
		[edit, setEdit] = useState<Row | null>(null),
		[error, setError] = useState(""),
		[notice, setNotice] = useState(""),
		[busy, setBusy] = useState(false),
		[loaded, setLoaded] = useState(false),
		[month, setMonth] = useState(() =>
			new Date()
				.toLocaleDateString("sv-SE", { timeZone: "America/New_York" })
				.slice(0, 7),
		),
		[customer, setCustomer] = useState("");
	useEffect(() => {
		const controller = new AbortController();
		setLoaded(false);
		setError("");
		Promise.all([
			fetch(`/api/contracts${control ? `?month=${month}` : ""}`, {
				signal: controller.signal,
				cache: "no-store",
			}),
			...(control
				? []
				: [
						fetch("/api/properties", {
							signal: controller.signal,
							cache: "no-store",
						}),
					]),
		])
			.then(async (responses) => {
				const data = await Promise.all(
					responses.map(async (r) => {
						const v = await r.json();
						if (!r.ok) throw new Error(v.error);
						return v;
					}),
				);
				setRows(data[0]);
				setSites(data[1] ?? []);
				setLoaded(true);
			})
			.catch((e) => {
				if (e.name !== "AbortError") setError(e.message);
			});
		return () => controller.abort();
	}, [month, control]);
	async function submit(input: unknown) {
		let saved = false;
		setBusy(true);
		setError("");
		setNotice("");
		try {
			const response = await fetch("/api/contracts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error);
			saved = true;
			setEdit(null);
			setNotice("Cambios guardados.");
			const r = await fetch("/api/contracts", { cache: "no-store" });
			const updated = await r.json();
			if (!r.ok) throw new Error(updated.error);
			setRows(updated);
			return true;
		} catch (e) {
			setError(e instanceof Error ? e.message : "No se pudo guardar.");
			return saved;
		} finally {
			setBusy(false);
		}
	}
	const customers = Array.from(
		new Map(rows.map((r) => [r.customer_id, r.customer_name])).entries(),
	);
	const visible = rows.filter(
		(r) =>
			(!r.deleted_at || control) && (!customer || r.customer_id === customer),
	);
	return (
		<div className="service-workspace">
			{error ? (
				<p role="alert" className="notice error">
					{error}
				</p>
			) : null}
			{notice ? (
				<p role="status" className="notice">
					{notice}
				</p>
			) : null}
			{control ? (
				<section className="panel">
					<h2>Control mensual de servicio</h2>
					<p>
						Visitas según el mes programado · zona horaria America/New_York. La
						meta mensual es la acordada actualmente en el contrato; no
						reconstruye metas históricas ni prorratea meses parciales.
					</p>
					<div className="crm-grid">
						<label>
							Mes
							<input
								type="month"
								value={month}
								onChange={(e) => setMonth(e.target.value)}
							/>
						</label>
						<label>
							Cliente
							<select
								value={customer}
								onChange={(e) => setCustomer(e.target.value)}
							>
								<option value="">Todos</option>
								{customers.map(([id, name]) => (
									<option key={id} value={id}>
										{name}
									</option>
								))}
							</select>
						</label>
					</div>
					<p>
						El ingreso asignado se reconoce al completar la visita. Los costos
						son los registrados; no representan facturación, cobros ni
						contabilidad completa.
					</p>
				</section>
			) : (
				<section className="panel">
					<h2>{edit ? "Editar contrato" : "Nuevo contrato"}</h2>
					<form
						key={edit?.id ?? "new"}
						onSubmit={async (e) => {
							e.preventDefault();
							const form = e.currentTarget;
							const input = Object.fromEntries(new FormData(form));
							if (
								await submit({
									...input,
									...(edit?.source_offer_id
										? {
												service: edit.service,
												service_key: edit.service_key,
												frequency: edit.frequency,
												monthly: edit.monthly_cents / 100,
												visits_per_month: edit.visits_per_month,
												estimated_minutes: edit.estimated_minutes,
											}
										: {}),
									...(edit
										? {
												id: edit.id,
												revision: edit.revision,
												property_id: edit.property_id,
											}
										: {}),
								})
							)
								form.reset();
						}}
					>
						{edit?.source_offer_id ? (
							<p className="notice">
								Acuerdo aceptado v{edit.baseline_version}. Aquí puedes cambiar
								el estado. Para modificar precio o alcance, prepara un cambio en{" "}
								<a href="/presupuestos">Presupuestos → Ofertas y acuerdos</a>.
							</p>
						) : null}
						<fieldset disabled={busy || !loaded}>
							<div className="crm-grid">
								<label>
									Localidad y cliente
									<select
										name="property_id"
										required
										defaultValue={edit?.property_id ?? ""}
										disabled={!!edit}
									>
										<option value="">Selecciona una localidad...</option>
										{sites
											.filter(
												(p) =>
													p.status === "active" || p.id === edit?.property_id,
											)
											.map((p) => (
												<option key={p.id} value={p.id}>
													{p.customer_name} · {p.name} [{p.code}]
												</option>
											))}
									</select>
								</label>
								<label htmlFor="contract-service">
									Servicio principal
									<CatalogSelect
										id="contract-service"
										category="service"
										name="service_key"
										disabled={!!edit?.source_offer_id}
										defaultValue={edit?.service_key ?? ""}
										required
									/>
								</label>
								<label>
									Alcance del servicio
									<input
										name="service"
										disabled={!!edit?.source_offer_id}
										required
										maxLength={500}
										defaultValue={edit?.service ?? ""}
										placeholder="Ej. corte de césped, bordes y limpieza"
									/>
								</label>
								<label htmlFor="contract-frequency">
									Frecuencia
									<CatalogSelect
										id="contract-frequency"
										category="contract_frequency"
										name="frequency"
										disabled={!!edit?.source_offer_id}
										defaultValue={edit?.frequency ?? "Semanal"}
										required
									/>
								</label>
								<label>
									Estado
									<select name="status" defaultValue={edit?.status ?? "active"}>
										{Object.entries(statuses).map(([key, label]) => (
											<option key={key} value={key}>
												{label}
											</option>
										))}
									</select>
								</label>
								<label>
									Precio mensual (USD)
									<input
										name="monthly"
										disabled={!!edit?.source_offer_id}
										required
										type="number"
										min="0"
										max="1000000"
										step="0.01"
										defaultValue={edit ? edit.monthly_cents / 100 : ""}
									/>
								</label>
								<label>
									Visitas acordadas al mes
									<input
										name="visits_per_month"
										disabled={!!edit?.source_offer_id}
										required
										type="number"
										min="1"
										max="100"
										defaultValue={edit?.visits_per_month ?? ""}
									/>
								</label>
								<label>
									Minutos previstos por visita
									<input
										name="estimated_minutes"
										disabled={!!edit?.source_offer_id}
										required
										type="number"
										min="1"
										max="1440"
										defaultValue={edit?.estimated_minutes ?? ""}
									/>
								</label>
							</div>
							<p>
								La frecuencia orienta la planificación. La cuota mensual se
								acuerda por separado: semanal no significa siempre cuatro
								visitas. Los cambios de precio aplican a nuevas visitas
								programadas.
							</p>
							<button type="submit">
								{busy
									? "Guardando..."
									: edit
										? "Guardar cambios"
										: "Crear contrato"}
							</button>
							{edit ? (
								<button type="button" onClick={() => setEdit(null)}>
									Cancelar edición
								</button>
							) : null}
						</fieldset>
					</form>
				</section>
			)}
			{!loaded ? (
				<p role="status">Cargando contratos...</p>
			) : !visible.length ? (
				<p>No hay contratos para mostrar.</p>
			) : null}
			<div className="location-grid">
				{visible.map((r) => (
					<article key={r.id} className="panel">
						<p className="eyebrow">{r.customer_name}</p>
						<h2>{r.property_name}</h2>
						{r.source_offer_id ? (
							<p className="pill">
								Acuerdo aceptado v{r.baseline_version} · Vigencia{" "}
								{String(r.effective_from).slice(0, 10)} —{" "}
								{r.effective_until
									? String(r.effective_until).slice(0, 10)
									: "Abierta"}
							</p>
						) : null}
						<p>
							{r.property_code} ·{" "}
							<strong>
								{r.deleted_at
									? "Eliminado · historial conservado"
									: (statuses[r.status] ?? r.status)}
							</strong>
						</p>
						<p>
							{r.service} · {r.frequency}
						</p>
						<p>
							{money(r.monthly_cents)}/mes · {r.visits_per_month} visitas
							acordadas · {r.estimated_minutes} min/visita
						</p>
						{control ? (
							<dl>
								<dt>Realizadas</dt>
								<dd>{r.completed}</dd>
								<dt>Programadas pendientes</dt>
								<dd>{r.scheduled}</dd>
								<dt>En ejecución</dt>
								<dd>{r.started}</dd>
								<dt>Canceladas</dt>
								<dd>{r.cancelled}</dd>
								<dt>Faltan para la meta actual</dt>
								<dd>{r.remaining}</dd>
								<dt>Mano de obra</dt>
								<dd>{money(r.labor_cents)}</dd>
								<dt>Materiales</dt>
								<dd>{money(r.materials_cents)}</dd>
								<dt>Maquinaria</dt>
								<dd>{money(r.equipment_cents)}</dd>
								<dt>Traslados</dt>
								<dd>{money(r.travel_cents)}</dd>
								<dt>Indirectos</dt>
								<dd>{money(r.overhead_cents)}</dd>
								<dt>Costo registrado total</dt>
								<dd>{money(r.total_cost_cents)}</dd>
								<dt>Ingreso asignado a visitas realizadas</dt>
								<dd>{money(r.allocated_revenue_cents)}</dd>
								<dt>Contribución sobre costos registrados</dt>
								<dd>{money(r.contribution_cents)}</dd>
							</dl>
						) : (
							<div>
								<button
									type="button"
									disabled={busy}
									onClick={() => {
										setEdit(r);
										window.scrollTo({ top: 0, behavior: "smooth" });
									}}
								>
									Editar contrato
								</button>
								<button
									type="button"
									disabled={busy}
									onClick={() => {
										if (
											window.confirm(
												`¿Eliminar el contrato de ${r.customer_name} · ${r.property_name}? Se cancelarán sus visitas pendientes. Las completadas y sus costos se conservarán. Esta baja no borra el historial.`,
											)
										)
											void submit({
												action: "delete",
												id: r.id,
												revision: r.revision,
											});
									}}
								>
									Eliminar contrato
								</button>
							</div>
						)}
					</article>
				))}
			</div>
		</div>
	);
}
