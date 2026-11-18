"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { authClient } from "@/modules/identity/client";
import { useCatalogs } from "./catalogs";

export type SessionMember = {
	platform_it?: boolean;
	companies?: { id: string; name: string; status: string }[];
	login_code?: string;
	account_kind?: "company" | "platform";
	name: string;
	email?: string;
	role: string;
	security?: import("@/modules/security/index.mjs").SecurityAccess;
};
export const SessionContext = createContext<{
	enabled: boolean;
	member: SessionMember | null;
}>({ enabled: false, member: null });

const roleLabels: Record<string, string> = {
	it_admin: "Administrador IT",
	owner: "Dueño",
	manager: "Manager",
	crew_lead: "Jefe de cuadrilla",
	worker: "Trabajador",
	finance: "Administración financiera",
};

export function UserAccount() {
	const { enabled, member } = useContext(SessionContext);
	const { label } = useCatalogs();
	const menu = useRef<HTMLDetailsElement>(null);
	const [busy, setBusy] = useState(false),
		[error, setError] = useState("");
	useEffect(() => {
		const outside = (event: PointerEvent) => {
			if (
				event.target instanceof Node &&
				!menu.current?.contains(event.target) &&
				menu.current
			)
				menu.current.open = false;
		};
		const onEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape" && menu.current?.open) {
				menu.current.open = false;
				menu.current.querySelector("summary")?.focus();
			}
		};
		document.addEventListener("pointerdown", outside);
		document.addEventListener("keydown", onEscape);
		return () => {
			document.removeEventListener("pointerdown", outside);
			document.removeEventListener("keydown", onEscape);
		};
	}, []);
	if (!enabled || !member) return null;
	const catalogRole = label("app_role", member.role);
	const role = member.security?.profiles.length
		? member.security.profiles.map((p) => p.name).join(" · ")
		: catalogRole === member.role
			? roleLabels[member.role] || "Perfil autorizado"
			: catalogRole;
	const initials =
		member.name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0])
			.join("")
			.toLocaleUpperCase("es") || "U";
	return (
		<details ref={menu} className="user-account">
			<summary aria-label={`Cuenta de ${member.name}, ${role}`}>
				<span className="account-avatar" aria-hidden="true">
					{initials}
				</span>
				<span className="account-summary-text">
					<strong>{member.name}</strong>
					<span>{role}</span>
				</span>
				<span className="account-chevron" aria-hidden="true">
					⌄
				</span>
			</summary>
			<div className="account-panel">
				<p className="eyebrow">SESIÓN ACTUAL</p>
				<strong className="account-name">{member.name}</strong>
				<p className="account-email">
					{member.login_code || member.email || "Usuario autorizado"}
				</p>
				<dl>
					{member.security ? (
						<div>
							<dt>Empresa</dt>
							<dd>{member.security.company_name}</dd>
						</div>
					) : null}
					<div>
						<dt>Perfiles</dt>
						<dd>{role}</dd>
					</div>
					<div>
						<dt>Ingreso</dt>
						<dd>Acceso NeuraTec</dd>
					</div>
				</dl>
				{member.platform_it ? <p>NeuraTec · IT de plataforma</p> : null}
				{member.companies &&
				member.companies.filter((c) => c.status === "active").length > 1 ? (
					<label>
						Empresa activa
						<select
							value={member.security?.company_id || ""}
							disabled={busy}
							onChange={async (e) => {
								setBusy(true);
								setError("");
								try {
									const r = await fetch("/api/companies", {
										method: "POST",
										headers: { "Content-Type": "application/json" },
										body: JSON.stringify({
											action: "select",
											company_id: e.target.value,
										}),
									});
									if (!r.ok) throw Error();
									window.location.assign("/");
								} catch {
									setError("No se pudo cambiar de empresa.");
									setBusy(false);
								}
							}}
						>
							{member.companies
								.filter((c) => c.status === "active")
								.map((c) => (
									<option key={c.id} value={c.id}>
										{c.name}
									</option>
								))}
						</select>
					</label>
				) : null}
				{error ? <p role="alert">{error}</p> : null}
				<button
					type="button"
					disabled={busy}
					onClick={async () => {
						setBusy(true);
						setError("");
						try {
							const result = await authClient.signOut();
							if (result.error)
								throw new Error(
									"No se pudo cerrar la sesión. Intenta nuevamente.",
								);
							window.location.reload();
						} catch {
							setError("No se pudo cerrar la sesión. Intenta nuevamente.");
							setBusy(false);
						}
					}}
				>
					{busy ? "Cerrando sesión…" : "Cerrar sesión"}
				</button>
			</div>
		</details>
	);
}

export function useSessionAccess() {
	const { enabled, member } = useContext(SessionContext);
	return {
		can: (key: string) =>
			!enabled || Boolean(member?.security?.grants.includes(key)),
	};
}
