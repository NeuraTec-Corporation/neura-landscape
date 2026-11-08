"use client";
import { useState } from "react";
export function AccessLink({ email, name }: { email: string; name: string }) {
	const [url, setUrl] = useState(""),
		[expires, setExpires] = useState(""),
		[error, setError] = useState(""),
		[busy, setBusy] = useState(false),
		[copied, setCopied] = useState(false);
	return (
		<section className="panel" aria-label={`Acceso propio de ${name}`}>
			<h3>Activar o recuperar acceso propio</h3>
			<p>
				{name} · {email}
			</p>
			<p>
				Genera un enlace para que esta persona establezca su contraseña. También
				sirve para recuperarla. No necesita Google. Al completar el cambio se
				cierran sus sesiones anteriores.
			</p>
			<button
				type="button"
				disabled={busy}
				onClick={async () => {
					if (
						!window.confirm(
							`Se generará un enlace de acceso para ${email}. Entrégalo solo a esa persona por un medio privado. Sustituye cualquier enlace pendiente. ¿Continuar?`,
						)
					)
						return;
					setBusy(true);
					setError("");
					setUrl("");
					setCopied(false);
					try {
						const r = await fetch("/api/local-access", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ action: "issue", email }),
						});
						const v = await r.json();
						if (!r.ok) throw new Error(v.error);
						setUrl(v.url);
						setExpires(v.expiresAt);
					} catch (x) {
						setError(
							x instanceof Error ? x.message : "No se pudo generar el enlace.",
						);
					} finally {
						setBusy(false);
					}
				}}
			>
				{busy ? "Generando…" : "Generar enlace de un solo uso"}
			</button>
			{url ? (
				<div>
					<p>
						Vence: {new Date(expires).toLocaleString("es")}. Guárdalo de forma
						privada; se muestra solo en esta pantalla y no se envía por correo.
					</p>
					<label>
						Enlace privado
						<input
							readOnly
							value={url}
							autoComplete="off"
							onFocus={(e) => e.currentTarget.select()}
						/>
					</label>
					<button
						type="button"
						onClick={async () => {
							try {
								await navigator.clipboard.writeText(url);
								setCopied(true);
							} catch {
								setError("Selecciona y copia el enlace manualmente.");
							}
						}}
					>
						{copied ? "Copiado" : "Copiar enlace"}
					</button>
					<button
						className="quiet-button"
						type="button"
						onClick={() => setUrl("")}
					>
						Ocultar enlace
					</button>
				</div>
			) : null}
			{error ? <p role="alert">{error}</p> : null}
		</section>
	);
}
