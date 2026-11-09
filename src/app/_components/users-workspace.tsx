"use client";
import type { SecuritySnapshot } from "@/modules/security/index.mjs";
import type { IdentityReadiness } from "@/modules/identity/configuration.mjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCatalogs } from "./catalogs";
import { SecurityProfiles } from "./security-profiles";
import { AccessLink } from "./access-link";
import { PagedTable } from "./paged-collection";
import { Notices } from "./management-shared";
type User = {
	login_code: string;
	account_kind: "company" | "platform";
	evaluation_only: boolean;
	has_password: boolean;
	email: string;
	name: string;
	role: string;
	status: string;
	revision: number;
	crew_ids: string[];
	profile_ids: string[];
};
type Data = SecuritySnapshot & {
	users: User[];
	crews: { id: string; name: string }[];
	canEdit: boolean;
	enabled: boolean;
	readiness: IdentityReadiness;
};
export function UsersWorkspace() {
	const [data, setData] = useState<Data | null>(null),
		[tab, setTab] = useState("users"),
		[edit, setEdit] = useState<User | null | undefined>(undefined),
		[error, setError] = useState(""),
		[notice, setNotice] = useState(""),
		[busy, setBusy] = useState(false),
		[profileIds, setProfileIds] = useState<string[]>([]);
	const formRef = useRef<HTMLElement>(null),
		catalogs = useCatalogs();
	const refresh = useCallback(async () => {
		const r = await fetch("/api/users", { cache: "no-store" }),
			v = await r.json();
		if (!r.ok) throw new Error(v.error);
		setData(v);
	}, []);
	useEffect(() => {
		refresh().catch((e) => setError(e.message));
	}, [refresh]);
	const changed = async () => {
		await refresh();
		await catalogs.reload();
		window.dispatchEvent(new Event("security-changed"));
	};
	const open = (user?: User) => {
		setEdit(user || null);
		setProfileIds(user?.profile_ids || []);
		setError("");
		requestAnimationFrame(() => {
			formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
			formRef.current?.focus();
		});
	};
	if (!data)
		return (
			<section className="panel">
				<Notices error={error} />
				<p role="status">Consultando seguridad…</p>
			</section>
		);
	return (
		<section className="survey-workspace">
			<header className="survey-hero">
				<p className="eyebrow">SEGURIDAD DE LA EMPRESA</p>
				<h2>Personas, perfiles y permisos</h2>
				<p>
					{data.company.name} · Los usuarios reciben permisos mediante perfiles.
				</p>
			</header>
			<Notices
				error={edit !== undefined && tab === "users" ? "" : error}
				notice={notice}
			/>
			<section className="survey-tabs" aria-label="Opciones de seguridad">
				{[
					["users", "Usuarios y accesos"],
					["profiles", "Perfiles y permisos"],
					["company", "Empresa y auditoría"],
				].map(([id, label]) => (
					<button
						type="button"
						key={id}
						aria-pressed={tab === id}
						onClick={() => {
							setTab(id);
							setError("");
							setNotice("");
						}}
					>
						{label}
					</button>
				))}
			</section>
			{tab === "profiles" ? (
				<SecurityProfiles
					data={data}
					canEdit={data.canEdit}
					onChange={changed}
				/>
			) : tab === "company" ? (
				<section className="panel">
					<h3>{data.company.name}</h3>
					<p>
						Empresa operativa actual. El modelo de seguridad separa las
						membresías y los perfiles por empresa. La creación de otra empresa
						operativa no está habilitada mientras se verifica el aislamiento de
						los módulos de negocio.
					</p>
					<h3>Ingreso</h3>
					<p>
						{data.enabled && data.readiness.ready
							? "Correo y contraseña configurados y activos"
							: "Configuración de ingreso pendiente"}{" "}
						· Google es una alternativa si está configurado. La activación y
						recuperación se realizan mediante enlaces privados de un solo uso
						generados por un administrador. No hay registro público ni envío
						automático de correo.
					</p>
					<h3>Últimos cambios de seguridad</h3>
					{data.history.length ? (
						<ul>
							{data.history.map((h) => (
								<li key={h.id}>
									{new Date(h.created_at).toLocaleString("es")} · {h.actor} ·{" "}
									{h.entity}: {h.entity_id}
								</li>
							))}
						</ul>
					) : (
						<p>No hay cambios registrados todavía.</p>
					)}
				</section>
			) : (
				<div className="manage-workspace">
					<div className="manage-actions">
						<h3>Usuarios de la empresa</h3>
						{data.canEdit ? (
							<button type="button" onClick={() => open()}>
								＋ Autorizar usuario
							</button>
						) : null}
					</div>
					{edit !== undefined ? (
						<section
							ref={formRef}
							tabIndex={-1}
							className="panel security-editor"
						>
							<h3>
								{edit ? `Editar acceso · ${edit.name}` : "Autorizar usuario"}
							</h3>
							<form
								key={edit?.email || "new"}
								onSubmit={async (e) => {
									e.preventDefault();
									const fd = new FormData(e.currentTarget);
									setBusy(true);
									setError("");
									setNotice("");
									try {
										if (
											!window.confirm(
												"Se guardarán " +
													profileIds.length +
													" perfiles para este usuario en " +
													data.company.name +
													". ¿Continuar?",
											)
										)
											return;
										const r = await fetch("/api/users", {
											method: "POST",
											headers: { "Content-Type": "application/json" },
											body: JSON.stringify({
												email: edit?.email || fd.get("email"),
												name: fd.get("name"),
												...(String(fd.get("login_code") || "").trim()
													? { login_code: String(fd.get("login_code")).trim() }
													: {}),
												status: fd.get("status"),
												profile_ids: profileIds,
												crew_ids: fd.getAll("crew_ids"),
												version: data.company.version,
												...(edit ? { revision: edit.revision } : {}),
											}),
										});
										const v = await r.json();
										if (!r.ok) throw new Error(v.error);
										setEdit(undefined);
										await changed();
										setNotice(
											"Usuario y perfiles guardados. Abre Editar acceso para generar su enlace de activación; no necesita Google.",
										);
									} catch (x) {
										setError(
											x instanceof Error ? x.message : "No se pudo guardar.",
										);
									} finally {
										setBusy(false);
									}
								}}
							>
								<fieldset disabled={busy || !data.canEdit}>
									<div className="manage-grid">
										<label>
											Nombre *
											<input
												name="name"
												required
												maxLength={150}
												defaultValue={edit?.name || ""}
											/>
										</label>
										<label>
											Código de usuario
											<input
												name="login_code"
												defaultValue={edit?.login_code || ""}
												placeholder="Automático al guardar"
												required={!!edit}
												maxLength={13}
												pattern="[A-Za-z]{3}[0-9]{3,10}"
												autoCapitalize="characters"
												spellCheck={false}
											/>
										</label>
										<label>
											Correo para Google (opcional)
											<input
												name="email"
												type="email"
												maxLength={254}
												disabled={!!edit}
												defaultValue={
													edit?.email.endsWith("@access.neuratec.invalid")
														? ""
														: edit?.email || ""
												}
											/>
										</label>
										<label>
											Estado
											<select
												name="status"
												defaultValue={edit?.status || "active"}
											>
												<option value="active">Activo</option>
												<option value="disabled">Deshabilitado</option>
											</select>
										</label>
									</div>
									<fieldset className="security-choices">
										<legend>
											Perfiles asignados · {profileIds.length} seleccionados
										</legend>
										{data.profiles
											.filter(
												(p) =>
													p.status === "active" || profileIds.includes(p.id),
											)
											.map((p) => (
												<label key={p.id}>
													<input
														type="checkbox"
														checked={profileIds.includes(p.id)}
														disabled={
															p.status !== "active" &&
															!profileIds.includes(p.id)
														}
														onChange={(e) =>
															setProfileIds((old) =>
																e.target.checked
																	? [...old, p.id]
																	: old.filter((id) => id !== p.id),
															)
														}
													/>
													<span>
														<strong>{p.name}</strong>
														<small>
															{p.scope === "assigned"
																? "Solo sus asignaciones"
																: "Empresa actual"}
															{p.status !== "active" ? " · Retirado" : ""}
														</small>
													</span>
												</label>
											))}
									</fieldset>
									<p>
										Los permisos de los perfiles activos se combinan. No mezcles
										perfiles de empresa y de asignaciones en el mismo acceso.
									</p>
									<fieldset className="security-choices">
										<legend>Cuadrillas asignadas</legend>
										{data.crews.map((c) => (
											<label key={c.id}>
												<input
													type="checkbox"
													name="crew_ids"
													value={c.id}
													defaultChecked={
														edit?.crew_ids.includes(c.id) || false
													}
												/>
												{c.name}
											</label>
										))}
									</fieldset>
									<p>
										Los perfiles de cuadrilla solo acceden a localidades con
										trabajos vigentes asignados. El empleado y su cuenta de
										acceso son registros distintos.
									</p>
									<button type="submit">Guardar acceso</button>
								</fieldset>
								<button
									type="button"
									className="quiet-button"
									onClick={() => setEdit(undefined)}
								>
									Cancelar
								</button>
							</form>
							{edit && data.canEdit && edit.status === "active" ? (
								<AccessLink
									key={edit.email}
									email={edit.email}
									name={edit.name}
									code={edit.login_code}
								/>
							) : null}
						</section>
					) : null}
					<PagedTable label="Usuarios y accesos">
						<table className="data-directory">
							<thead>
								<tr>
									<th>Usuario</th>
									<th>Perfiles</th>
									<th>Estado</th>
									<th>Acceso propio</th>
									<th>Cuadrillas</th>
									<th>Acciones</th>
								</tr>
							</thead>
							<tbody>
								{data.users.map((u) => (
									<tr key={u.email}>
										<td>
											<strong>
												{u.login_code || "Pendiente"} · {u.name}
											</strong>
											{u.account_kind === "platform" ? (
												<span className="table-subline">
													NeuraTec · Administración del sistema
												</span>
											) : null}
											{!u.email.endsWith("@access.neuratec.invalid") ? (
												<span className="table-subline">{u.email}</span>
											) : null}
										</td>
										<td>
											{u.profile_ids
												.map(
													(id) =>
														data.profiles.find((p) => p.id === id)?.name || id,
												)
												.join(" · ") || "Sin perfil"}
										</td>
										<td>
											{u.status === "active" ? "Activo" : "Deshabilitado"}
										</td>
										<td>
											{u.has_password
												? "Contraseña establecida"
												: "Pendiente de activación"}
										</td>
										<td>
											{u.crew_ids
												.map((id) => data.crews.find((c) => c.id === id)?.name)
												.filter(Boolean)
												.join(" · ") || "Sin asignación"}
										</td>
										<td>
											{data.canEdit ? (
												<button
													type="button"
													className="quiet-button"
													onClick={() => open(u)}
												>
													Editar acceso
												</button>
											) : null}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</PagedTable>
				</div>
			)}
		</section>
	);
}
