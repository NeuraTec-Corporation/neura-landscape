"use client";
import { useEffect, useState, useId } from "react";
type Row = {
	id: string;
	[key: string]:
		| string
		| number
		| null
		| {
				cost_cents: number;
				revenue_cents: number;
				contribution_cents: number;
				margin: number | null;
		  };
};
type Data = {
	customers: Row[];
	properties: Row[];
	contracts: Row[];
	crews: Row[];
	visits: Row[];
};
type Field = {
	name: string;
	label: string;
	type?: string;
	min?: number;
	step?: string;
	options?: { value: string; label: string }[];
};
const empty: Data = {
	customers: [],
	properties: [],
	contracts: [],
	crews: [],
	visits: [],
};
const money = (cents: unknown) =>
	new Intl.NumberFormat("es-US", { style: "currency", currency: "USD" }).format(
		Number(cents) / 100,
	);
const statusName = (s: unknown) =>
	s === "completed"
		? "Completada"
		: s === "started"
			? "En ejecución"
			: "Programada";
function EntryForm({
	title,
	action,
	fields,
	submit,
}: {
	title: string;
	action: string;
	fields: Field[];
	submit: (input: Record<string, unknown>) => Promise<boolean>;
}) {
	const [busy, setBusy] = useState(false);
	const formId = useId();
	return (
		<form
			className="panel entry-form"
			onSubmit={async (event) => {
				event.preventDefault();
				const form = event.currentTarget;
				const values = Object.fromEntries(new FormData(form));
				if (typeof values.scheduled_at === "string")
					values.scheduled_at = new Date(values.scheduled_at).toISOString();
				setBusy(true);
				try {
					if (await submit({ ...values, action })) form.reset();
				} finally {
					setBusy(false);
				}
			}}
		>
			<h2>{title}</h2>
			{fields.map((field) => (
				<label key={field.name} htmlFor={`${formId}-${field.name}`}>
					{field.label}
					{field.options ? (
						<select
							id={`${formId}-${field.name}`}
							name={field.name}
							required
							defaultValue=""
						>
							<option value="" disabled>
								Selecciona…
							</option>
							{field.options.map((o) => (
								<option key={o.value} value={o.value}>
									{o.label}
								</option>
							))}
						</select>
					) : (
						<input
							id={`${formId}-${field.name}`}
							name={field.name}
							type={field.type ?? "text"}
							min={field.min}
							step={field.step}
							maxLength={500}
							required
						/>
					)}
				</label>
			))}
			<button disabled={busy} type="submit">
				{busy ? "Guardando…" : "Guardar"}
			</button>
		</form>
	);
}
export function OperationsPanel({ section }: { section: string }) {
	const [data, setData] = useState<Data>(empty);
	const [loading, setLoading] = useState(true);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	async function refresh() {
		const response = await fetch("/api/operations", { cache: "no-store" });
		const value = await response.json();
		if (!response.ok) throw new Error(value.error);
		setData(value);
	}
	useEffect(() => {
		let active = true;
		fetch("/api/operations", { cache: "no-store" })
			.then(async (r) => {
				const value = await r.json();
				if (!r.ok) throw new Error(value.error);
				if (active) setData(value);
			})
			.catch((e) => {
				if (active) setError(e.message);
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, []);
	async function submit(input: Record<string, unknown>) {
		setError("");
		setMessage("");
		try {
			const response = await fetch("/api/operations", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			});
			const value = await response.json();
			if (!response.ok) throw new Error(value.error);
			await refresh();
			setMessage("Guardado en la base local.");
			return true;
		} catch (e) {
			setError(e instanceof Error ? e.message : "No se pudo guardar.");
			return false;
		}
	}
	const options = (rows: Row[], label: string) =>
		rows.map((r) => ({ value: r.id, label: String(r[label]) }));
	const number = (name: string, label: string, min = 0, step = "1"): Field => ({
		name,
		label,
		type: "number",
		min,
		step,
	});
	const completed = data.visits.filter((v) => v.status === "completed");
	const totals = completed.reduce(
		(sum, v) => {
			const p = v.profitability;
			if (p && typeof p === "object") {
				sum.revenue += p.revenue_cents;
				sum.cost += p.cost_cents;
			}
			return sum;
		},
		{ revenue: 0, cost: 0 },
	);
	if (loading) return <p role="status">Abriendo base de datos local…</p>;
	return (
		<>
			<p role="status" className="success">
				{message}
			</p>
			{error ? (
				<p role="alert" className="error">
					{error}
				</p>
			) : null}
			{section === "resumen" ? (
				<>
					<section className="stats">
						{[
							[data.customers.length, "Clientes"],
							[data.properties.length, "Propiedades"],
							[data.visits.length, "Visitas"],
						].map(([value, label]) => (
							<article key={label}>
								<span>{label}</span>
								<strong>{value}</strong>
								<small>Registros guardados localmente</small>
							</article>
						))}
					</section>
					<section className="panel">
						<h2>Resultado de visitas completadas</h2>
						<div className="stats">
							<article>
								<span>Ingreso asignado</span>
								<strong>{money(totals.revenue)}</strong>
							</article>
							<article>
								<span>Costo registrado</span>
								<strong>{money(totals.cost)}</strong>
							</article>
							<article>
								<span>Contribución</span>
								<strong>{money(totals.revenue - totals.cost)}</strong>
							</article>
						</div>
						<p>
							Ingreso por visita = precio mensual ÷ visitas previstas.
							Contribución operativa simplificada, no utilidad neta ni
							facturación.
						</p>
					</section>
					<section className="panel guide">
						<h2>Empieza el recorrido</h2>
						{data.customers.length === 0 ? (
							<button
								type="button"
								onClick={async (e) => {
									const button = e.currentTarget;
									button.disabled = true;
									await submit({ action: "example" });
									button.disabled = false;
								}}
							>
								Cargar ejemplo ficticio
							</button>
						) : null}
						<p>
							1. Crea un cliente → 2. Añade su propiedad → 3. Define el contrato
							→ 4. Crea una cuadrilla → 5. Programa, inicia y completa una
							visita.
						</p>
						<p>
							Utiliza únicamente datos ficticios. La base empieza vacía y
							conserva lo que guardes al reiniciar.
						</p>
					</section>
				</>
			) : null}
			{section === "clientes" ? (
				<div className="form-grid">
					<EntryForm
						title="Nuevo cliente"
						action="customer"
						fields={[{ name: "name", label: "Nombre ficticio" }]}
						submit={submit}
					/>
					<section className="panel">
						<h2>Clientes</h2>
						{data.customers.length ? (
							data.customers.map((r) => (
								<article className="job" key={r.id}>
									<h3>{String(r.name)}</h3>
								</article>
							))
						) : (
							<p>Aún no hay clientes. Crea el primero.</p>
						)}
					</section>
				</div>
			) : null}
			{section === "contratos" ? (
				<div className="form-grid">
					<EntryForm
						title="Nuevo contrato"
						action="contract"
						fields={[
							{
								name: "property_id",
								label: "Propiedad",
								options: data.properties.map((r) => ({
									value: r.id,
									label: `${String(r.customer_name)} · ${String(r.name)}${r.code ? ` [${String(r.code)}]` : ""}`,
								})),
							},
							{ name: "service", label: "Servicio incluido" },
							{ name: "frequency", label: "Frecuencia (p. ej. semanal)" },
							number("monthly", "Precio mensual (USD)", 0, "0.01"),
							number("visits_per_month", "Visitas previstas al mes", 1),
							number("estimated_minutes", "Minutos previstos por visita", 1),
						]}
						submit={submit}
					/>
					<section className="panel">
						<h2>Contratos</h2>
						{data.contracts.length ? (
							data.contracts.map((r) => (
								<article className="job" key={r.id}>
									<div>
										<h3>{String(r.property_name)}</h3>
										<p>
											{String(r.service)} · {String(r.frequency)}
										</p>
										<p>
											{money(r.monthly_cents)}/mes ·{" "}
											{String(r.visits_per_month)} visitas ·{" "}
											{String(r.estimated_minutes)} min previstos
										</p>
									</div>
								</article>
							))
						) : (
							<p>Crea una propiedad para registrar su contrato.</p>
						)}
					</section>
				</div>
			) : null}
			{section === "cuadrillas" ? (
				<div className="form-grid">
					<EntryForm
						title="Nueva cuadrilla"
						action="crew"
						fields={[
							{ name: "name", label: "Nombre de cuadrilla" },
							number("workers", "Número de trabajadores", 1),
							number("hourly", "Costo por trabajador/hora (USD)", 0, "0.01"),
						]}
						submit={submit}
					/>
					<section className="panel">
						<h2>Cuadrillas</h2>
						{data.crews.length ? (
							data.crews.map((r) => (
								<article className="job" key={r.id}>
									<div>
										<h3>{String(r.name)}</h3>
										<p>
											{String(r.workers)} trabajadores · {money(r.hourly_cents)}{" "}
											por trabajador/hora
										</p>
									</div>
								</article>
							))
						) : (
							<p>Añade una cuadrilla para asignarle visitas.</p>
						)}
					</section>
				</div>
			) : null}
			{section === "agenda" ? (
				<>
					<EntryForm
						title="Programar visita"
						action="visit"
						fields={[
							{
								name: "contract_id",
								label: "Contrato",
								options: data.contracts.map((r) => ({
									value: r.id,
									label: `${String(r.property_name)} · ${String(r.service)}`,
								})),
							},
							{
								name: "crew_id",
								label: "Cuadrilla",
								options: options(data.crews, "name"),
							},
							{
								name: "scheduled_at",
								label: "Fecha y hora local",
								type: "datetime-local",
							},
							number("route_order", "Orden manual de ruta", 1),
						]}
						submit={submit}
					/>
					<section className="visits">
						<h2>Visitas y ejecución</h2>
						{data.visits.length ? (
							data.visits.map((v) => (
								<article className="panel" key={v.id}>
									<div className="panel-title">
										<h3>{String(v.property_name)}</h3>
										<span className="pill">{statusName(v.status)}</span>
									</div>
									<p>
										{new Date(String(v.scheduled_at)).toLocaleString("es")} ·
										Ruta #{String(v.route_order)} · {String(v.crew_name)}
									</p>
									<p>
										{String(v.service)} · {String(v.estimated_minutes)} min
										previstos
										{v.actual_minutes
											? ` / ${v.actual_minutes} min reales`
											: ""}
									</p>
									{v.status === "scheduled" ? (
										<button
											type="button"
											onClick={async (e) => {
												const button = e.currentTarget;
												button.disabled = true;
												await submit({ action: "start", id: v.id });
												button.disabled = false;
											}}
										>
											Iniciar visita
										</button>
									) : null}
									{v.status === "started" ? (
										<EntryForm
											title="Completar y calcular costos"
											action="complete"
											fields={[
												number(
													"actual_minutes",
													"Minutos reales de la cuadrilla",
													1,
												),
												number("materials", "Materiales (USD)", 0, "0.01"),
												number("equipment", "Maquinaria (USD)", 0, "0.01"),
												number("travel", "Traslado (USD)", 0, "0.01"),
												number("overhead", "Indirectos (USD)", 0, "0.01"),
												{ name: "notes", label: "Observaciones de ejecución" },
											]}
											submit={(input) => submit({ ...input, id: v.id })}
										/>
									) : null}
									{v.profitability && typeof v.profitability === "object" ? (
										<div className="result">
											<p>
												Ingreso asignado:{" "}
												<b>{money(v.profitability.revenue_cents)}</b> · Costo:{" "}
												<b>{money(v.profitability.cost_cents)}</b>
											</p>
											<p>
												Contribución:{" "}
												<b>{money(v.profitability.contribution_cents)}</b> ·
												Margen:{" "}
												<b>
													{v.profitability.margin === null
														? "Sin ingreso"
														: `${v.profitability.margin.toFixed(1)}%`}
												</b>
											</p>
											<p>
												Mano de obra: {money(v.labor_cents)} · Materiales:{" "}
												{money(v.materials_cents)} · Maquinaria:{" "}
												{money(v.equipment_cents)} · Traslado:{" "}
												{money(v.travel_cents)} · Indirectos:{" "}
												{money(v.overhead_cents)}
											</p>
											<p>{String(v.notes)}</p>
										</div>
									) : null}
								</article>
							))
						) : (
							<p>Programa la primera visita con un contrato y una cuadrilla.</p>
						)}
					</section>
				</>
			) : null}
			{section === "integraciones" ? (
				<section className="panel">
					<h2>Base local conectada</h2>
					<p>
						PostgreSQL embebido (PGlite). Clientes, propiedades, contratos,
						cuadrillas y visitas se guardan en este equipo.
					</p>
					<h3>Servicios externos: 0 conexiones</h3>
					<p>
						Core, mapas, GPS y facturación no están conectados. La ruta se
						ordena manualmente.
					</p>
				</section>
			) : null}
		</>
	);
}
