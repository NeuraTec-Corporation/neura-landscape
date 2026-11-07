"use client";
import { useEffect, useState } from "react";
import { useCatalogs } from "./catalogs";
type Status = {
	loaded: boolean;
	customers: number;
	properties: number;
	operations?: {
		visits: number;
		contracts: number;
		invoices: number;
		employees: number;
		crews: number;
		from: string;
		to: string;
	} | null;
};
export function SampleDataPanel({
	onLoaded,
	operational = false,
}: {
	onLoaded?: () => void;
	operational?: boolean;
}) {
	const { data } = useCatalogs();
	const [status, setStatus] = useState<Status | null>(null),
		[busy, setBusy] = useState(false),
		[error, setError] = useState(""),
		[confirmed, setConfirmed] = useState(false);
	const loaded = operational
		? Boolean(status?.operations)
		: Boolean(status?.loaded);
	const allowed = ["it_admin", "owner"].includes(data.role || "");
	useEffect(() => {
		if (!allowed) return;
		const c = new AbortController();
		fetch("/api/sample-data", { signal: c.signal, cache: "no-store" })
			.then(async (r) => {
				if (!r.ok) throw Error("No se pudo consultar el lote de prueba.");
				setStatus(await r.json());
			})
			.catch((e) => {
				if (e.name !== "AbortError") setError(e.message);
			});
		return () => c.abort();
	}, [allowed]);
	if (!allowed || (operational && status?.operations)) return null;
	return (
		<details className="sample-data-panel">
			<summary>
				{loaded
					? operational
						? "Escenario operativo de prueba disponible"
						: "Datos de prueba disponibles"
					: operational
						? "Completar el escenario operativo de los 33 clientes"
						: "Explorar con 33 clientes de prueba"}
				<span className="sample-badge">SINTÉTICOS</span>
			</summary>
			<p>
				28 personas, 5 empresas y 78 localidades. Direcciones no navegables y
				correos de ejemplo. El escenario operativo añade contratos, agenda,
				tareas, consumos, facturas y pagos simulados; no envía mensajes ni
				realiza cobros.
			</p>
			{loaded && status ? (
				<p role="status">
					{status.customers} clientes y {status.properties} localidades
					cargados.{" "}
					{operational && status.operations
						? `${status.operations.visits} visitas, ${status.operations.contracts} contratos y ${status.operations.invoices} facturas simuladas. `
						: ""}{" "}
					Repetir la carga conserva los cambios y no duplica registros.
				</p>
			) : (
				<form
					onSubmit={async (e) => {
						e.preventDefault();
						setBusy(true);
						setError("");
						try {
							const r = await fetch("/api/sample-data", {
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({
									action: operational ? "load_operations" : "load",
									confirmed,
								}),
							});
							const j = await r.json();
							if (!r.ok) throw Error(j.error);
							setStatus(j);
							onLoaded?.();
						} catch (e) {
							setError(e instanceof Error ? e.message : "No se pudo cargar.");
						} finally {
							setBusy(false);
						}
					}}
				>
					<label className="check-label">
						<input
							type="checkbox"
							required
							checked={confirmed}
							onChange={(e) => setConfirmed(e.target.checked)}
						/>{" "}
						{operational
							? "Añadir operaciones y documentos financieros SINTÉTICOS de evaluación"
							: "Añadir el lote sintético"}{" "}
						a este entorno, conservando los registros existentes.
					</label>
					<button disabled={busy || !confirmed} type="submit">
						{busy
							? "Cargando…"
							: operational
								? "Cargar escenario operativo de prueba"
								: "Cargar clientes y localidades de prueba"}
					</button>
				</form>
			)}
			{error ? (
				<p role="alert" className="notice error">
					{error}
				</p>
			) : null}
		</details>
	);
}
