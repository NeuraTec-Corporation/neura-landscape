"use client";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/modules/identity/client";
export function LocalActivation() {
	const [token, setToken] = useState(""),
		[error, setError] = useState(""),
		[busy, setBusy] = useState(false),
		[done, setDone] = useState(false);
	const captured = useRef(false);
	useEffect(() => {
		if (captured.current) return;
		captured.current = true;
		setToken(
			new URLSearchParams(window.location.hash.slice(1)).get("token") || "",
		);
		// The bearer token is never placed in a query, referrer, server access log or storage.
		window.history.replaceState(null, "", window.location.pathname);
	}, []);
	return (
		<main className="sign-in">
			<section className="survey-hero">
				<p className="eyebrow">ACCESO NEURATEC</p>
				<h1>{done ? "Tu acceso está listo." : "Establece tu contraseña"}</h1>
				{done ? (
					<>
						<p>
							Ingresa con el código de usuario que te entregó tu administrador y tu nueva
							contraseña.
						</p>
						<button
							type="button"
							onClick={async () => {
								setBusy(true);
								try {
									await authClient.signOut();
									window.location.assign("/");
								} catch {
									setError("Cierra la sesión actual y vuelve al ingreso.");
								} finally {
									setBusy(false);
								}
							}}
							disabled={busy}
						>
							Ir al ingreso
						</button>
					</>
				) : (
					<>
						<p>
							El enlace es de un solo uso y vence a los 30 minutos. No necesitas
							cuenta de Google.
						</p>
						<form
							onSubmit={async (e) => {
								e.preventDefault();
								setError("");
								const fd = new FormData(e.currentTarget);
								if (fd.get("password") !== fd.get("confirm")) {
									setError("Las contraseñas no coinciden.");
									return;
								}
								setBusy(true);
								try {
									const r = await fetch("/api/local-access", {
										method: "POST",
										headers: { "Content-Type": "application/json" },
										body: JSON.stringify({
											action: "redeem",
											token,
											password: fd.get("password"),
										}),
									});
									const v = await r.json();
									if (!r.ok) throw new Error(v.error);
									setDone(true);
									setToken("");
								} catch (x) {
									setError(
										x instanceof Error
											? x.message
											: "No se pudo establecer la contraseña.",
									);
								} finally {
									setBusy(false);
								}
							}}
						>
							<fieldset disabled={busy || !token}>
								<label>
									Nueva contraseña
									<input
										name="password"
										type="password"
										autoComplete="new-password"
										required
										minLength={12}
										maxLength={128}
									/>
								</label>
								<label>
									Confirmar contraseña
									<input
										name="confirm"
										type="password"
										autoComplete="new-password"
										required
										minLength={12}
										maxLength={128}
									/>
								</label>
								<p>Entre 12 y 128 caracteres. Puedes usar una frase larga.</p>
								<button type="submit">
									{busy ? "Guardando…" : "Establecer contraseña"}
								</button>
							</fieldset>
						</form>
						{!token ? (
							<p role="alert">
								Abre el enlace completo que te entregó tu administrador. Si
								recargaste esta página, vuelve a abrirlo.
							</p>
						) : null}
						<a href="/">Volver al ingreso</a>
					</>
				)}
				{error ? <p role="alert">{error}</p> : null}
			</section>
		</main>
	);
}
