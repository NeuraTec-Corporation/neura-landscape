"use client";
import { useEffect, useState } from "react";
import { authClient } from "@/modules/identity/client";
import { SurveyWorkspace } from "./survey-workspace";
type Access = {
	enabled: boolean;
	configured: boolean;
	member: { name: string; role: string } | null;
};
type Work = {
	id: string;
	status: string;
	scheduled_at: string;
	service: string;
	property_id: string;
	property_name: string;
	address: string;
	access_instructions: string;
	service_hours: string;
	crew_name: string;
};
function CrewPortal({ name }: { name: string }) {
	const [work, setWork] = useState<Work[]>([]),
		[error, setError] = useState(""),
		[site, setSite] = useState<string | null>(null);
	useEffect(() => {
		const controller = new AbortController();
		fetch("/api/my-work", { signal: controller.signal, cache: "no-store" })
			.then(async (r) => {
				const v = await r.json();
				if (!r.ok) throw new Error(v.error);
				setWork(v);
			})
			.catch((e) => {
				if (e.name !== "AbortError") setError(e.message);
			});
		return () => controller.abort();
	}, []);
	return (
		<main className="crew-portal">
			<header className="survey-hero">
				<p className="eyebrow">NEURA CREW</p>
				<h1>Tu trabajo, en un lugar.</h1>
				<p>{name} · asignaciones de tus cuadrillas</p>
				<button
					type="button"
					onClick={async () => {
						await authClient.signOut();
						window.location.reload();
					}}
				>
					Cerrar sesión
				</button>
			</header>
			{error ? <p role="alert">{error}</p> : null}
			{site ? (
				<SurveyWorkspace
					propertyId={site}
					readOnly
					onClose={() => setSite(null)}
				/>
			) : (
				<div className="survey-zone-grid">
					{work.map((visit) => (
						<article className="panel" key={visit.id}>
							<span className="pill">
								{visit.status === "started" ? "En ejecución" : "Programada"}
							</span>
							<h2>{visit.property_name}</h2>
							<p>{new Date(visit.scheduled_at).toLocaleString("es")}</p>
							<p>{visit.crew_name}</p>
							<p>{visit.service}</p>
							<p>{visit.address}</p>
							{visit.access_instructions ? (
								<p>
									<strong>Acceso:</strong> {visit.access_instructions}
								</p>
							) : null}
							{visit.service_hours ? (
								<p>Horario permitido: {visit.service_hours}</p>
							) : null}
							<button type="button" onClick={() => setSite(visit.property_id)}>
								Ver lugar, fotos y cuidados
							</button>
						</article>
					))}
					{!work.length && !error ? (
						<p>No tienes visitas pendientes asignadas.</p>
					) : null}
				</div>
			)}
		</main>
	);
}
export function IdentityGate({
	children,
	initialEnabled,
}: {
	children: React.ReactNode;
	initialEnabled: boolean;
}) {
	const [access, setAccess] = useState<Access | null>(
			initialEnabled
				? null
				: {
						enabled: false,
						configured: false,
						member: { name: "Evaluación protegida", role: "it_admin" },
					},
		),
		[error, setError] = useState("");
	useEffect(() => {
		const controller = new AbortController();
		fetch("/api/me", { signal: controller.signal, cache: "no-store" })
			.then(async (r) => {
				const v = await r.json();
				if (!r.ok) throw new Error(v.error);
				setAccess(v);
			})
			.catch((e) => {
				if (e.name !== "AbortError") setError(e.message);
			});
		return () => controller.abort();
	}, []);
	if (!access)
		return (
			<div>
				{error ? (
					<p role="alert">{error}</p>
				) : (
					<p className="identity-loading" role="status">
						Comprobando acceso...
					</p>
				)}
			</div>
		);
	if (access.enabled && !access.member)
		return (
			<main className="sign-in">
				<div className="survey-hero">
					<p className="eyebrow">NEURA LANDSCAPE</p>
					<h1>Tu equipo. Tu operación.</h1>
					<p>
						Ingresa con la cuenta de Google autorizada por tu administrador.
					</p>
					<button
						type="button"
						disabled={!access.configured}
						onClick={async () => {
							try {
								const r = await authClient.signIn.social({
									provider: "google",
									callbackURL: "/",
								});
								if (r.error)
									setError(r.error.message || "No se pudo iniciar sesión.");
							} catch {
								setError("No se pudo conectar con Google.");
							}
						}}
					>
						Continuar con Google
					</button>
					{!access.configured ? (
						<p>
							El administrador debe completar la configuración de Google OAuth.
						</p>
					) : null}
					{error ? <p role="alert">{error}</p> : null}
				</div>
			</main>
		);
	if (
		access.enabled &&
		access.member &&
		["worker", "crew_lead"].includes(access.member.role)
	)
		return <CrewPortal name={access.member.name} />;
	return (
		<div data-app-role={access.member?.role ?? "none"}>
			{children}
			{access.enabled ? (
				<button
					className="session-signout"
					type="button"
					onClick={async () => {
						await authClient.signOut();
						window.location.reload();
					}}
				>
					Cerrar sesión
				</button>
			) : null}
		</div>
	);
}
