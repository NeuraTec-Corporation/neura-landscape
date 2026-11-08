"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LocalSignIn } from "./local-sign-in";
import { SurveyWorkspace } from "./survey-workspace";
import { WorkspaceAccess } from "./workspace-access";
import {
	SessionContext,
	UserAccount,
	type SessionMember,
} from "./user-account";
type Access = {
	enabled: boolean;
	configured: boolean;
	googleConfigured?: boolean;
	member: SessionMember | null;
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
				<UserAccount />
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
	const path = usePathname();
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
		const reload = () => {
			fetch("/api/me", { signal: controller.signal, cache: "no-store" })
				.then(async (r) => {
					const v = await r.json();
					if (!r.ok) throw new Error(v.error);
					setAccess(v);
				})
				.catch((e) => {
					if (e.name !== "AbortError") setError(e.message);
				});
		};
		reload();
		window.addEventListener("security-changed", reload);
		window.addEventListener("focus", reload);
		return () => {
			controller.abort();
			window.removeEventListener("security-changed", reload);
			window.removeEventListener("focus", reload);
		};
	}, []);

	if (path === "/activar") return children;
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
			<LocalSignIn
				configured={access.configured}
				googleConfigured={Boolean(access.googleConfigured)}
			/>
		);
	if (
		access.enabled &&
		access.member &&
		["worker", "crew_lead"].includes(access.member.role)
	)
		return (
			<SessionContext.Provider value={access}>
				<CrewPortal name={access.member.name} />
			</SessionContext.Provider>
		);
	return (
		<SessionContext.Provider value={access}>
			<div data-app-role={access.member?.role ?? "none"}>
				<WorkspaceAccess>{children}</WorkspaceAccess>
			</div>
		</SessionContext.Provider>
	);
}
