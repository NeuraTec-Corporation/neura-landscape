"use client";
import { useEffect, useState } from "react";
export function OperatorSettings() {
	const [code, setCode] = useState(""),
		[message, setMessage] = useState(""),
		[busy, setBusy] = useState(false);
	useEffect(() => {
		const controller = new AbortController();
		fetch("/api/operator", { signal: controller.signal })
			.then(async (r) => {
				const v = await r.json();
				if (!r.ok) throw new Error(v.error);
				setCode(v.code);
			})
			.catch((e) => {
				if (e.name !== "AbortError") setMessage(e.message);
			});
		return () => controller.abort();
	}, []);
	return (
		<section className="panel service-workspace">
			<h2>Empresa operadora</h2>
			<p>
				Identificador de la empresa de paisajismo para nuevos códigos LOC.
				Ejemplo de formato: LOC-EMPRESA-2026-0001. Los códigos ya asignados se
				conservan.
			</p>
			<form
				onSubmit={async (e) => {
					e.preventDefault();
					setBusy(true);
					try {
						const r = await fetch("/api/operator", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ code }),
						});
						const v = await r.json();
						setMessage(
							r.ok
								? "Identificador guardado. Se usará en las nuevas localidades."
								: v.error,
						);
					} catch {
						setMessage("No se pudo guardar.");
					} finally {
						setBusy(false);
					}
				}}
			>
				<label>
					Identificador de la empresa
					<input
						value={code}
						required
						maxLength={40}
						pattern="[A-Z0-9]+(-[A-Z0-9]+)*"
						onChange={(e) => setCode(e.target.value.toUpperCase())}
						disabled={busy}
					/>
				</label>
				<button disabled={busy} type="submit">
					Guardar empresa operadora
				</button>
			</form>
			{message ? <p role="status">{message}</p> : null}
		</section>
	);
}
