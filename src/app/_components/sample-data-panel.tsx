"use client";
import { useEffect, useState } from "react";
import { useCatalogs } from "./catalogs";
type Status = { loaded: boolean; customers: number; properties: number };
export function SampleDataPanel({ onLoaded }: { onLoaded?: () => void }) {
	const { data } = useCatalogs();
	const [status, setStatus] = useState<Status | null>(null),
		[busy, setBusy] = useState(false),
		[error, setError] = useState(""),
		[confirmed, setConfirmed] = useState(false);
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
	if (!allowed) return null;
	return (
		<details className="sample-data-panel">
			<summary>
				{status?.loaded
					? "Datos de prueba disponibles"
					: "Explorar con 33 clientes de prueba"}
				<span className="sample-badge">SINTÉTICOS</span>
			</summary>
			<p>
				28 personas, 5 empresas y 78 localidades. Direcciones no navegables y
				correos de ejemplo; sin mensajes, contratos ni movimientos financieros.
			</p>
			{status?.loaded ? (
				<p role="status">
					{status.customers} clientes y {status.properties} localidades
					cargados. Repetir la carga conserva los cambios y no duplica
					registros.
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
								body: JSON.stringify({ action: "load", confirmed }),
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
						Añadir el lote sintético a este entorno, conservando los registros
						existentes.
					</label>
					<button disabled={busy || !confirmed} type="submit">
						{busy ? "Cargando…" : "Cargar clientes y localidades de prueba"}
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
