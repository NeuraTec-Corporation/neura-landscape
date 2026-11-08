"use client";
import { useState } from "react";
import { authClient } from "@/modules/identity/client";
export function LocalSignIn({
	configured,
	googleConfigured,
}: {
	configured: boolean;
	googleConfigured: boolean;
}) {
	const [error, setError] = useState(""),
		[busy, setBusy] = useState(false),
		[help, setHelp] = useState(false);
	return (
		<main className="sign-in">
			<section className="survey-hero">
				<p className="eyebrow">NEURA LANDSCAPE</p>
				<h1>Tu equipo. Tu operación.</h1>
				<p>Ingresa con el correo y la contraseña de tu acceso NeuraTec.</p>
				<form
					onSubmit={async (e) => {
						e.preventDefault();
						setBusy(true);
						setError("");
						const fd = new FormData(e.currentTarget);
						try {
							const r = await authClient.signIn.email({
								email: String(fd.get("email")).trim().toLowerCase(),
								password: String(fd.get("password")),
								rememberMe: false,
							});
							if (r.error) {
								setError(
									"No se pudo ingresar. Revisa tus credenciales o solicita ayuda al administrador.",
								);
								return;
							}
							window.location.assign("/");
						} catch {
							setError("No se pudo conectar. Inténtalo de nuevo.");
						} finally {
							setBusy(false);
						}
					}}
				>
					<fieldset disabled={!configured || busy}>
						<label>
							Correo de ingreso
							<input
								name="email"
								type="email"
								autoComplete="username"
								required
								maxLength={254}
							/>
						</label>
						<label>
							Contraseña
							<input
								name="password"
								type="password"
								autoComplete="current-password"
								required
								maxLength={128}
							/>
						</label>
						<button type="submit">{busy ? "Ingresando…" : "Ingresar"}</button>
					</fieldset>
				</form>
				<button
					type="button"
					className="quiet-button"
					onClick={() => setHelp(!help)}
				>
					Activar acceso o recuperar contraseña
				</button>
				{help ? (
					<p>
						Solicita al administrador un enlace de activación o recuperación
						desde Sistema → Usuarios y permisos. No necesitas Gmail ni una
						cuenta de Google. El enlace vence a los 30 minutos y se usa una sola
						vez.
					</p>
				) : null}
				{googleConfigured ? (
					<>
						<p>O usa tu cuenta vinculada:</p>
						<button
							type="button"
							disabled={!configured || busy}
							onClick={async () => {
								setError("");
								setBusy(true);
								try {
									const r = await authClient.signIn.social({
										provider: "google",
										callbackURL: "/",
									});
									if (r.error) setError("No se pudo conectar con Google.");
								} catch {
									setError("No se pudo conectar con Google.");
								} finally {
									setBusy(false);
								}
							}}
						>
							Continuar con Google
						</button>
					</>
				) : null}
				{!configured ? (
					<p>
						El administrador debe completar la configuración de sesión y
						PostgreSQL.
					</p>
				) : null}
				{error ? <p role="alert">{error}</p> : null}
			</section>
		</main>
	);
}
