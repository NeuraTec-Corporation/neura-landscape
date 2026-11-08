"use client";
import { PagedTable, PagedCollection } from "./paged-collection";
import { DataDirectory } from "./data-directory";
import { SampleDataPanel } from "./sample-data-panel";
import { useEffect, useState, useRef } from "react";
import { useCatalogs } from "./catalogs";
import { Notices, today, usd } from "./management-shared";
import type { Visit } from "./visits-workspace";
type Dashboard = {
	costBreakdown: Record<string, number>;
	portfolio: {
		customers: number;
		properties: number;
		active_contracts: number;
		crews: number;
		sample_customers: number;
	};
	scenario: { from: string; to: string; anchor_day: string } | null;
	customers: {
		id: string;
		name: string;
		properties: number;
		completed: number;
		pending: number;
		cancelled: number;
		services: string[];
		billed_cents: number;
		collected_cents: number;
		balance_cents: number;
	}[];
	obligationsAvailable: boolean;
	obligationsMonth: string;
	obligations: {
		id: string;
		customer_name: string;
		property_name: string;
		visits_per_month: number;
		completed: number;
		planned: number;
		remaining: number;
		unplanned: number;
	}[];
	summary: Record<string, number>;
	filters: Record<string, string>;
	trend: {
		date: string;
		completed: number;
		scheduled: number;
		cancelled: number;
	}[];
	production: {
		service_key: string;
		service: string;
		unit: string;
		unit_label: string;
		quantity: number;
	}[];
	productivity: {
		employee_id: string;
		name: string;
		minutes: number;
		visits: number;
		tasks: number;
	}[];
	visits: (Visit & { deleted_at?: string | null })[];
	invoices: {
		id: string;
		number: string;
		customer_name: string;
		total_cents: number;
		paid_cents: number;
		due_date: string;
	}[];
	receivables: {
		id: string;
		number: string;
		customer_name: string;
		total_cents: number;
		paid_cents: number;
		due_date: string;
	}[];
	options: {
		customers: { id: string; name: string }[];
		cities: string[];
		regions: string[];
		crews: { id: string; name: string }[];
	};
};
const statuses = {
	scheduled: "Programadas",
	started: "En ejecución",
	completed: "Completadas",
	cancelled: "Canceladas",
};
const monthEnd = (day: string) => {
	const [y, m] = day.split("-").map(Number);
	return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
export function ManagementDashboard() {
	const detailRef = useRef<HTMLElement>(null);
	const [refreshKey, setRefreshKey] = useState(0);
	const c = useCatalogs(),
		[filters, setFilters] = useState({
			from: `${today().slice(0, 7)}-01`,
			to: monthEnd(today()),
			customer_id: "",
			city: "",
			region: "",
			status: "",
			service: "",
			crew_id: "",
			date_basis: "scheduled",
			origin: "all",
		}),
		[data, setData] = useState<Dashboard | null>(null),
		[error, setError] = useState(""),
		[loading, setLoading] = useState(false),
		[details, setDetails] = useState<
			"visits" | "production" | "people" | "invoices" | "debt" | null
		>(null),
		[updated, setUpdated] = useState("");
	useEffect(() => {
		if (details && !loading)
			requestAnimationFrame(() => {
				detailRef.current?.scrollIntoView({
					behavior: "smooth",
					block: "start",
				});
				detailRef.current?.focus({ preventScroll: true });
			});
	}, [details, loading]);
	const query = new URLSearchParams({
		...filters,
		_refresh: String(refreshKey),
	}).toString();
	useEffect(() => {
		const controller = new AbortController();
		setLoading(true);
		setError("");
		fetch(`/api/management?area=dashboard&${query}`, {
			signal: controller.signal,
			cache: "no-store",
		})
			.then(async (r) => {
				const v = await r.json();
				if (!r.ok) throw new Error(v.error);
				setData(v);
				setUpdated(
					new Date().toLocaleTimeString("es", {
						hour: "2-digit",
						minute: "2-digit",
					}),
				);
			})
			.catch((e) => {
				if (e.name !== "AbortError") setError(e.message);
			})
			.finally(() => {
				if (!controller.signal.aborted) setLoading(false);
			});
		return () => controller.abort();
	}, [query]);
	const update = (key: keyof typeof filters, value: string) =>
		setFilters((f) => ({ ...f, [key]: value }));
	const quick = (period: "today" | "week" | "month") => {
		const t = today();
		if (period === "today") setFilters((f) => ({ ...f, from: t, to: t }));
		else if (period === "month")
			setFilters((f) => ({
				...f,
				from: `${t.slice(0, 7)}-01`,
				to: monthEnd(t),
			}));
		else {
			const d = new Date(`${t}T12:00:00Z`),
				n = (d.getUTCDay() + 6) % 7;
			d.setUTCDate(d.getUTCDate() - n);
			const from = d.toISOString().slice(0, 10);
			d.setUTCDate(d.getUTCDate() + 6);
			setFilters((f) => ({ ...f, from, to: d.toISOString().slice(0, 10) }));
		}
	};
	const s = data?.summary,
		total = s?.visits || 0;
	const a = total ? (Number(s?.completed || 0) / total) * 100 : 0,
		b = total ? (Number(s?.started || 0) / total) * 100 : 0,
		d = total ? (Number(s?.scheduled || 0) / total) * 100 : 0;
	const maxTrend = Math.max(
		1,
		...(data?.trend.map((t) => t.completed + t.scheduled + t.cancelled) ?? []),
	);
	return (
		<div className="manager-dashboard">
			<header className="dashboard-hero">
				<div>
					<p className="eyebrow">CENTRO GERENCIAL</p>
					<h1>Tu empresa, de un vistazo.</h1>
					<p>Servicio, personas y dinero registrado en un mismo lugar.</p>
				</div>
				<div className="dashboard-live">
					<span className="live-dot" />
					Datos consultados{updated ? ` a las ${updated}` : ""}
				</div>
			</header>
			<Notices error={error} />
			<SampleDataPanel
				operational
				onLoaded={() => setRefreshKey((v) => v + 1)}
			/>

			<section className="panel dashboard-filters">
				<div className="manage-actions">
					<h3>Período y alcance</h3>
					<div className="dashboard-origin">
						<label htmlFor="dashboard-origin">Origen de los datos</label>
						<select
							id="dashboard-origin"
							value={filters.origin}
							onChange={(e) => update("origin", e.target.value)}
						>
							<option value="all">Todos los registros</option>
							<option value="sample">Solo escenario de evaluación</option>
							<option value="existing">Otros registros</option>
						</select>
					</div>
					<div className="range-shortcuts">
						<button type="button" onClick={() => quick("today")}>
							Hoy
						</button>
						<button type="button" onClick={() => quick("week")}>
							Esta semana
						</button>
						<button type="button" onClick={() => quick("month")}>
							Este mes
						</button>
					</div>
				</div>
				<details className="dashboard-filter-details">
					<summary>
						Fechas · {filters.from} → {filters.to}
						{Object.entries(filters).some(
							([key, value]) =>
								(!["from", "to", "date_basis", "origin"].includes(key) &&
									value) ||
								(key === "origin" && value !== "all"),
						)
							? " · Filtros activos"
							: ""}
					</summary>
					<div className="dashboard-filter-grid">
						<label>
							Desde
							<input
								type="date"
								value={filters.from}
								onChange={(e) => update("from", e.target.value)}
							/>
						</label>
						<label>
							Hasta
							<input
								type="date"
								value={filters.to}
								onChange={(e) => update("to", e.target.value)}
							/>
						</label>
						<label>
							Cliente
							<select
								value={filters.customer_id}
								onChange={(e) => update("customer_id", e.target.value)}
							>
								<option value="">Todos</option>
								{data?.options.customers.map((v) => (
									<option key={v.id} value={v.id}>
										{v.name}
									</option>
								))}
							</select>
						</label>
						<label>
							Ciudad
							<select
								value={filters.city}
								onChange={(e) => update("city", e.target.value)}
							>
								<option value="">Todas</option>
								{data?.options.cities.map((v) => (
									<option key={v}>{v}</option>
								))}
							</select>
						</label>
						<label>
							Estado / provincia
							<select
								value={filters.region}
								onChange={(e) => update("region", e.target.value)}
							>
								<option value="">Todos</option>
								{data?.options.regions.map((v) => (
									<option key={v}>{v}</option>
								))}
							</select>
						</label>
						<label>
							Estado del trabajo
							<select
								value={filters.status}
								onChange={(e) => update("status", e.target.value)}
							>
								<option value="">Todos</option>
								{Object.entries(statuses).map(([key, label]) => (
									<option key={key} value={key}>
										{label}
									</option>
								))}
							</select>
						</label>
						<label>
							Servicio
							<select
								value={filters.service}
								onChange={(e) => update("service", e.target.value)}
							>
								<option value="">Todos</option>
								{Object.entries(c.options("service", filters.service)).map(
									([key, label]) => (
										<option key={key} value={key}>
											{label}
										</option>
									),
								)}
							</select>
						</label>
						<label>
							Cuadrilla
							<select
								value={filters.crew_id}
								onChange={(e) => update("crew_id", e.target.value)}
							>
								<option value="">Todas</option>
								{data?.options.crews.map((v) => (
									<option key={v.id} value={v.id}>
										{v.name}
									</option>
								))}
							</select>
						</label>
						<label>
							Fechas del trabajo
							<select
								value={filters.date_basis}
								onChange={(e) => update("date_basis", e.target.value)}
							>
								<option value="scheduled">Según programación</option>
								<option value="completed">Según finalización real</option>
							</select>
						</label>
					</div>
					<p className="filter-hint">
						Para saber dónde se cortó césped esta semana: elige Esta semana,
						Completadas, Corte de césped y Según finalización real.
					</p>
				</details>
			</section>
			{loading ? (
				<p role="status" className="dashboard-refresh">
					Actualizando indicadores...
				</p>
			) : null}
			{data && s && !loading && !error ? (
				<div
					aria-busy={loading}
					className={loading ? "dashboard-data refreshing" : "dashboard-data"}
				>
					<aside
						className="scenario-banner"
						hidden={!data.portfolio.sample_customers}
					>
						<div>
							<strong>DATOS SINTÉTICOS DE EVALUACIÓN</strong>
							<p>
								{data.portfolio.sample_customers} clientes de evaluación.
								Servicios, importes y pagos simulados; sin cobros reales.
							</p>
						</div>
						{data.scenario && filters.origin !== "sample" ? (
							<button
								type="button"
								className="quiet-button"
								onClick={() =>
									setFilters((f) => ({
										...f,
										from: data.scenario?.from || f.from,
										to: data.scenario?.to || f.to,
										origin: "sample",
									}))
								}
							>
								Solo escenario de evaluación
							</button>
						) : null}
					</aside>
					<section className="portfolio-kpis" aria-label="Cartera del alcance">
						<a href="/clientes">
							<span>Clientes</span>
							<strong>{data.portfolio.customers}</strong>
							<small>en la cartera seleccionada</small>
						</a>
						<a href="/propiedades">
							<span>Localidades</span>
							<strong>{data.portfolio.properties}</strong>
							<small>fichas de servicio</small>
						</a>
						<a href="/contratos">
							<span>Contratos activos</span>
							<strong>{data.portfolio.active_contracts}</strong>
							<small>compromisos vigentes</small>
						</a>
						<a href="/cuadrillas">
							<span>Cuadrillas asignadas</span>
							<strong>{data.portfolio.crews}</strong>
							<small>con visitas del período</small>
						</a>
					</section>
					<section
						className="dashboard-kpis"
						aria-label="Indicadores operativos"
					>
						<button
							type="button"
							className="kpi-card green"
							onClick={() => setDetails("visits")}
						>
							<span>Visitas completadas</span>
							<strong>{s.completed}</strong>
							<small>de {s.visits} registros del filtro</small>
						</button>
						<button
							type="button"
							className="kpi-card blue"
							onClick={() => setDetails("visits")}
						>
							<span>Pendientes / en ejecución</span>
							<strong>{s.scheduled + s.started}</strong>
							<small>{s.late} pendientes con fecha vencida</small>
						</button>
						<button
							type="button"
							className="kpi-card amber"
							onClick={() => setDetails("production")}
						>
							<span>Árboles podados registrados</span>
							<strong>{s.trees_pruned}</strong>
							<small>cantidades vinculadas a árboles del inventario</small>
						</button>
						<button
							type="button"
							className="kpi-card coral"
							onClick={() => setDetails("production")}
						>
							<span>Tareas bloqueadas</span>
							<strong>{s.blocked_tasks}</strong>
							<small>{s.cancelled} visitas canceladas</small>
						</button>
					</section>
					<section className="dashboard-finance">
						<div className="manage-actions">
							<div>
								<p className="eyebrow">FACTURACIÓN Y CARTERA</p>
								<h3>Dinero documentado, sin mezclarlo con estimaciones.</h3>
							</div>
							<a className="button-link" href="/facturacion">
								Registrar documentos y pagos
							</a>
						</div>
						<details className="kpi-help">
							<summary>Cómo se calculan estos importes</summary>
							<p>
								Este bloque usa cliente, ciudad y región. Facturado y cobrado
								corresponden a sus propias fechas del período; los saldos
								incluyen todas las facturas emitidas de ese alcance. Servicio,
								cuadrilla y estado del trabajo filtran la operación.
							</p>
						</details>
						<div className="dashboard-kpis">
							<button
								type="button"
								className="kpi-card"
								onClick={() => setDetails("invoices")}
							>
								<span>Facturado en el período</span>
								<strong>{usd(s.billed_cents)}</strong>
								<small>{s.invoice_count} documentos emitidos registrados</small>
							</button>
							<button
								type="button"
								className="kpi-card"
								onClick={() => setDetails("invoices")}
							>
								<span>Cobrado en el período</span>
								<strong>{usd(s.collected_cents)}</strong>
								<small>pagos recibidos registrados</small>
							</button>
							<button
								type="button"
								className="kpi-card amber"
								onClick={() => setDetails("debt")}
							>
								<span>Saldo pendiente registrado</span>
								<strong>{usd(s.receivable_cents)}</strong>
								<small>saldo abierto, incluso de períodos anteriores</small>
							</button>
							<button
								type="button"
								className="kpi-card coral"
								onClick={() => setDetails("debt")}
							>
								<span>Saldo vencido registrado</span>
								<strong>{usd(s.overdue_cents)}</strong>
								<small>vencimiento anterior a hoy</small>
							</button>
						</div>
					</section>
					<section className="dashboard-chart-grid">
						<article className="panel">
							<div className="manage-actions">
								<h3>Estado del servicio</h3>
								<button
									className="quiet-button"
									type="button"
									onClick={() => setDetails("visits")}
								>
									Ver detalle
								</button>
							</div>
							<div className="status-chart">
								<div
									className="status-donut"
									role="img"
									aria-label={`${s.completed} completadas, ${s.started} en ejecución, ${s.scheduled} programadas, ${s.cancelled} canceladas`}
									style={{
										background: total
											? `conic-gradient(#38654b 0 ${a}%,#c99c38 ${a}% ${a + b}%,#6b95ad ${a + b}% ${a + b + d}%,#bb7862 ${a + b + d}% 100%)`
											: "#e5eadf",
									}}
								>
									<div>
										<strong>{s.visits}</strong>
										<span>visitas</span>
									</div>
								</div>
								<ul className="chart-legend">
									{Object.entries(statuses).map(([key, label]) => (
										<li key={key}>
											<i className={`legend-dot ${key}`} />
											<span>{label}</span>
											<strong>{s[key]}</strong>
										</li>
									))}
								</ul>
							</div>
						</article>
						<article className="panel">
							<div className="manage-actions">
								<h3>Actividad del período</h3>
								<button
									className="quiet-button"
									type="button"
									onClick={() => setDetails("visits")}
								>
									Ver registros
								</button>
							</div>
							<div
								className="trend-chart"
								role="img"
								aria-label="Visitas por día con actividad registrada"
							>
								{data.trend.map((day) => (
									<div
										className="trend-day"
										key={day.date}
										title={`${day.date}: ${day.completed} realizadas, ${day.scheduled} programadas, ${day.cancelled} canceladas`}
									>
										<span>{day.completed + day.scheduled + day.cancelled}</span>
										<div
											className="trend-stack"
											style={{
												height: `${Math.max(3, ((day.completed + day.scheduled + day.cancelled) / maxTrend) * 140)}px`,
											}}
										>
											<i
												className="completed"
												style={{ flex: day.completed }}
											/>
											<i
												className="scheduled"
												style={{ flex: day.scheduled }}
											/>
											<i
												className="cancelled"
												style={{ flex: day.cancelled }}
											/>
										</div>
										<small>{day.date.slice(5)}</small>
									</div>
								))}
							</div>
							{!data.trend.length ? (
								<p>Sin actividad registrada en este período.</p>
							) : null}
						</article>
					</section>

					<section className="panel">
						<div className="manage-actions">
							<div>
								<p className="eyebrow">CASAS Y LOCALIDADES POR ATENDER</p>
								<h3>Compromisos mensuales · {data.obligationsMonth}</h3>
							</div>
							<a className="button-link" href="/agenda">
								Programar trabajo pendiente
							</a>
						</div>
						{data.obligationsAvailable ? (
							<>
								<p>
									Cuota vigente de contratos activos:{" "}
									<strong>{s.remaining_monthly}</strong> visitas por completar,
									de las cuales <strong>{s.unplanned_visits}</strong> aún no
									están programadas. Este bloque es mensual y no prorratea la
									cuota semanal.
								</p>
								<DataDirectory
									label="Compromisos por localidad"
									rows={data.obligations.filter((o) => o.remaining > 0)}
									columns={[
										{
											key: "client",
											label: "Cliente y localidad",
											value: (o) => `${o.customer_name} ${o.property_name}`,
											render: (o) => (
												<>
													<strong>{o.customer_name}</strong>
													<small>{o.property_name}</small>
												</>
											),
										},
										{
											key: "done",
											label: "Realizadas",
											value: (o) =>
												`${String(o.completed)} / ${o.visits_per_month}`,
										},
										{
											key: "planned",
											label: "Programadas",
											value: (o) => String(o.planned),
											secondary: true,
										},
										{
											key: "missing",
											label: "Sin programar",
											value: (o) => String(o.unplanned),
											secondary: true,
										},
									]}
									actions={() => (
										<a className="button-link" href="/agenda">
											Agenda
										</a>
									)}
								/>
								{!data.obligations.some((o) => o.remaining > 0) ? (
									<p>
										No hay visitas por cubrir en los contratos clasificados de
										este alcance.
									</p>
								) : null}
							</>
						) : (
							<p>
								Las cuotas vigentes se muestran al consultar el mes actual. No
								se reconstruyen cuotas históricas que no fueron versionadas.
							</p>
						)}
					</section>
					<section className="dashboard-chart-grid">
						<article className="panel">
							<div className="manage-actions">
								<h3>Producción por servicio</h3>
								<button
									type="button"
									className="quiet-button"
									onClick={() => setDetails("production")}
								>
									Ver detalle
								</button>
							</div>
							<PagedCollection label="Producción por servicio">
								{data.production.map((p) => (
									<div
										className="production-line"
										key={`${p.service_key}-${p.unit}`}
									>
										<div>
											<span>{p.service}</span>
											<div className="production-track">
												<i
													style={{
														width: `${Math.max(2, (p.quantity / Math.max(1, ...data.production.filter((x) => x.unit === p.unit).map((x) => x.quantity))) * 100)}%`,
													}}
												/>
											</div>
										</div>
										<strong>
											{p.quantity} <small>{p.unit_label}</small>
										</strong>
									</div>
								))}
							</PagedCollection>
							{!data.production.length ? (
								<p>
									Aún no hay cantidades ejecutadas registradas para el filtro.
								</p>
							) : null}
							{s.unstructured_completed > 0 ? (
								<p className="notice">
									{s.unstructured_completed} visitas históricas no tienen tareas
									cuantificadas. No se deducen árboles ni superficies a partir
									de su descripción.
								</p>
							) : null}
						</article>
						<article className="panel">
							<div className="manage-actions">
								<h3>Costos de ejecución</h3>
								<a className="button-link" href="/costos">
									Revisar costos
								</a>
							</div>
							<div className="cost-summary">
								<p>
									<span>Ingreso asignado a visitas realizadas</span>
									<strong>{usd(s.allocated_revenue_cents)}</strong>
								</p>
								<p>
									<span>Costos completos registrados</span>
									<strong>{usd(s.known_cost_cents)}</strong>
								</p>
								<p>
									<span>Contribución de visitas con costo completo</span>
									<strong>
										{s.known_cost_visits
											? usd(s.known_contribution_cents)
											: "Sin costos completos"}
									</strong>
								</p>
							</div>
							<div className="cost-breakdown">
								{Object.entries({
									labor: "Mano de obra",
									materials: "Materiales",
									equipment: "Equipos",
									travel: "Traslados",
									overhead: "Indirectos",
								}).map(([key, label]) => (
									<div key={key}>
										<span>{label}</span>
										<strong>{usd(data.costBreakdown[key] || 0)}</strong>
										<div className="production-track">
											<i
												style={{
													width: `${String(s.known_cost_cents ? Math.max(1, ((data.costBreakdown[key] || 0) / s.known_cost_cents) * 100) : 0)}%`,
												}}
											/>
										</div>
									</div>
								))}
							</div>
							<p>
								{s.known_cost_visits} visitas con costo completo ·{" "}
								{s.cost_pending} pendientes de completar costos. Esta
								contribución no representa utilidad neta ni dinero cobrado.
							</p>
						</article>
					</section>
					<section className="panel customer-results">
						<div className="manage-actions">
							<div>
								<p className="eyebrow">RESULTADOS POR CLIENTE</p>
								<h3>Cartera, servicio y saldo</h3>
							</div>
						</div>
						<DataDirectory
							label="Resultados por cliente"
							rows={data.customers}
							columns={[
								{
									key: "name",
									label: "Cliente",
									value: (r) => r.name,
									render: (r) => (
										<>
											<strong>{r.name}</strong>
											<small>
												{r.properties} localidades · {r.services.length}{" "}
												servicios en el período
											</small>
										</>
									),
								},
								{
									key: "work",
									label: "Visitas",
									value: (r) => String(r.completed),
									render: (r) => (
										<>
											<strong>{r.completed} realizadas</strong>
											<small>
												{r.pending} pendientes · {r.cancelled} canceladas
											</small>
										</>
									),
								},
								{
									key: "billed",
									label: "Facturado",
									value: (r) => String(r.billed_cents),
									render: (r) => usd(r.billed_cents),
									secondary: true,
								},
								{
									key: "paid",
									label: "Cobrado",
									value: (r) => String(r.collected_cents),
									render: (r) => usd(r.collected_cents),
									secondary: true,
								},
								{
									key: "balance",
									label: "Saldo",
									value: (r) => String(r.balance_cents),
									render: (r) => usd(r.balance_cents),
									secondary: true,
								},
							]}
							actions={(r) => (
								<button
									type="button"
									className="quiet-button"
									onClick={() => {
										update("customer_id", r.id);
										setDetails("visits");
									}}
								>
									Ver detalle
								</button>
							)}
						/>
					</section>
					<section className="panel">
						<div className="manage-actions">
							<h3>Personas y trabajo registrado</h3>
							<button
								type="button"
								className="quiet-button"
								onClick={() => setDetails("people")}
							>
								Ver detalle por persona
							</button>
						</div>
						<PagedCollection label="Personas y trabajo" className="people-bars">
							{data.productivity
								.filter((p) => p.minutes > 0)
								.map((p) => (
									<div key={p.employee_id}>
										<span>{p.name}</span>
										<strong>{(p.minutes / 60).toFixed(1)} h</strong>
										<span>
											{p.visits} participaciones · {p.tasks} tareas individuales
											realizadas
										</span>
									</div>
								))}
						</PagedCollection>
						<p>
							Compara tareas, dificultad, recursos y calidad equivalentes.
							Participar en más visitas no demuestra por sí solo mayor
							productividad.
						</p>
					</section>
					{details ? (
						<section
							ref={detailRef}
							tabIndex={-1}
							className="panel dashboard-detail"
						>
							<div className="manage-actions">
								<h2>Detalle del filtro</h2>
								<button
									className="quiet-button"
									type="button"
									onClick={() => setDetails(null)}
								>
									Cerrar detalle
								</button>
							</div>
							<div className="detail-tabs">
								{Object.entries({
									visits: "Visitas",
									production: "Tareas y cantidades",
									people: "Personas",
									invoices: "Facturación del período",
									debt: "Saldos abiertos",
								}).map(([key, label]) => (
									<button
										key={key}
										type="button"
										aria-pressed={details === key}
										onClick={() => setDetails(key as typeof details)}
									>
										{label}
									</button>
								))}
							</div>
							<div className="table-scroll">
								<PagedTable key={details} label="Detalle del panel">
									<table className="management-table">
										{details === "visits" ? (
											<>
												<thead>
													<tr>
														<th>Cliente / localidad</th>
														<th>Fecha programada</th>
														<th>Trabajo</th>
														<th>Cuadrilla</th>
														<th>Estado</th>
													</tr>
												</thead>
												<tbody>
													{data.visits.map((v) => (
														<tr key={v.id}>
															<td>
																<strong>{v.customer_name}</strong>
																<span>
																	{v.property_name} · {v.city}
																</span>
															</td>
															<td>
																{new Date(v.scheduled_at).toLocaleString("es", {
																	timeZone: "America/New_York",
																})}
															</td>
															<td>
																{v.title ||
																	v.service_key ||
																	"Histórico sin detalle"}
															</td>
															<td>{v.crew_name}</td>
															<td>
																{statuses[v.status as keyof typeof statuses]}
																{v.deleted_at ? " · Archivada" : ""}
															</td>
														</tr>
													))}
												</tbody>
											</>
										) : details === "production" ? (
											<>
												<thead>
													<tr>
														<th>Cliente / localidad</th>
														<th>Tarea</th>
														<th>Servicio</th>
														<th>Responsable</th>
														<th>Realizado</th>
														<th>Resultado</th>
													</tr>
												</thead>
												<tbody>
													{data.visits.flatMap((v) =>
														v.tasks
															.filter(
																(t) =>
																	!filters.service ||
																	t.service_key === filters.service,
															)
															.map((t) => (
																<tr key={`${v.id}-${t.id}`}>
																	<td>
																		{v.customer_name}
																		<span>{v.property_name}</span>
																	</td>
																	<td>{t.description}</td>
																	<td>{c.label("service", t.service_key)}</td>
																	<td>
																		{t.employee_id
																			? v.personnel.find(
																					(p) =>
																						p.employee_id === t.employee_id,
																				)?.name_snapshot
																			: "Cuadrilla"}
																	</td>
																	<td>
																		{t.completed_quantity ?? "Pendiente"}{" "}
																		{c.label("element_unit", t.unit)}
																	</td>
																	<td>
																		{t.status === "done"
																			? "Realizada"
																			: t.status === "blocked"
																				? "Bloqueada"
																				: "Pendiente"}
																	</td>
																</tr>
															)),
													)}
												</tbody>
											</>
										) : details === "people" ? (
											<>
												<thead>
													<tr>
														<th>Persona</th>
														<th>Horas registradas</th>
														<th>Participaciones</th>
														<th>Tareas individuales realizadas</th>
													</tr>
												</thead>
												<tbody>
													{data.productivity.map((p) => (
														<tr key={p.employee_id}>
															<td>{p.name}</td>
															<td>{(p.minutes / 60).toFixed(2)}</td>
															<td>{p.visits}</td>
															<td>{p.tasks}</td>
														</tr>
													))}
												</tbody>
											</>
										) : (
											<>
												<thead>
													<tr>
														<th>Documento</th>
														<th>Cliente</th>
														<th>Total</th>
														<th>Pagado</th>
														<th>Saldo</th>
														<th>Vencimiento</th>
													</tr>
												</thead>
												<tbody>
													{(details === "debt"
														? data.receivables
														: data.invoices
													).map((i) => (
														<tr key={i.id}>
															<td>{i.number}</td>
															<td>{i.customer_name}</td>
															<td>{usd(i.total_cents)}</td>
															<td>{usd(i.paid_cents)}</td>
															<td>{usd(i.total_cents - i.paid_cents)}</td>
															<td>{String(i.due_date).slice(0, 10)}</td>
														</tr>
													))}
												</tbody>
											</>
										)}
									</table>
								</PagedTable>
							</div>
						</section>
					) : null}
				</div>
			) : null}
		</div>
	);
}
