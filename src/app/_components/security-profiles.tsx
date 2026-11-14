"use client";
import { useRef, useState } from "react";
import type {
	SecurityProfile,
	SecuritySnapshot,
} from "@/modules/security/index.mjs";
import { PagedTable } from "./paged-collection";
import { Notices } from "./management-shared";

export function SecurityProfiles({
	data,
	onChange,
	canEdit,
}: {
	data: SecuritySnapshot;
	onChange: () => Promise<void>;
	canEdit: boolean;
}) {
	const [editing, setEditing] = useState<SecurityProfile | null | undefined>(
			undefined,
		),
		[grants, setGrants] = useState<string[]>([]),
		[scope, setScope] = useState("company"),
		[query, setQuery] = useState(""),
		[error, setError] = useState(""),
		[notice, setNotice] = useState(""),
		[busy, setBusy] = useState(false);
	const editor = useRef<HTMLElement>(null);
	const open = (profile?: SecurityProfile) => {
		setEditing(profile || null);
		setGrants(profile?.grants || []);
		setScope(profile?.scope || "company");
		setError("");
		requestAnimationFrame(() => {
			editor.current?.scrollIntoView({ behavior: "smooth", block: "start" });
			editor.current?.focus();
		});
	};
	const groups = [
		...new Map(
			data.registry
				.filter((c) =>
					c.label
						.toLocaleLowerCase("es")
						.includes(query.toLocaleLowerCase("es")),
				)
				.map((c) => [c.resource, c.label]),
		).entries(),
	];
	const actions = [
		...new Map(data.registry.map((c) => [c.action, c.actionLabel])).entries(),
	];
	const change = (key: string, checked: boolean) => {
		const resource = key.split(".")[0];
		setGrants((old) =>
			checked
				? [
						...new Set([
							...old,
							key,
							`${resource}.read`,
							...(data.registry.find((c) => c.key === key)?.requires || []),
						]),
					]
				: key.endsWith(".read")
					? old.filter((g) => !g.startsWith(`${resource}.`))
					: old.filter((g) => g !== key),
		);
	};
	return (
		<div className="manage-workspace">
			<Notices error={editing === undefined ? error : ""} notice={notice} />
			<div className="manage-actions">
				<h2>Perfiles y permisos</h2>
				{canEdit ? (
					<button type="button" onClick={() => open()}>
						＋ Crear perfil
					</button>
				) : null}
			</div>
			<p>
				Cada casilla concede una acción. Los perfiles de cuadrilla conservan el
				alcance de sus asignaciones. El panel gerencial incluye indicadores
				financieros; Personal incluye datos laborales y tarifas.
			</p>
			{editing !== undefined ? (
				<section ref={editor} tabIndex={-1} className="panel security-editor">
					<h3>
						{editing ? `Editar perfil · ${editing.name}` : "Nuevo perfil"}
					</h3>
					<Notices error={error} />
					{editing?.protected ? (
						<p className="notice">
							Perfil protegido de continuidad IT. Sus permisos no se
							modifican; sus asignaciones se administran desde Usuarios.
						</p>
					) : null}
					<form
						key={editing?.id || "new"}
						onSubmit={async (event) => {
							event.preventDefault();
							const fd = new FormData(event.currentTarget);
							setBusy(true);
							setError("");
							setNotice("");
							try {
								const added = grants.filter(
									(g) => !editing?.grants.includes(g),
								);
								const removed = (editing?.grants || []).filter(
									(g) => !grants.includes(g),
								);
								if (
									!window.confirm(
										`Guardar perfil: ${String(fd.get("name"))}\nPermisos añadidos: ${added.length}\nPermisos retirados: ${removed.length}\nEstado: ${String(fd.get("status"))}\nLos cambios afectan a todos sus usuarios.`,
									)
								)
									return;
								const response = await fetch("/api/security", {
									method: "POST",
									headers: { "Content-Type": "application/json" },
									body: JSON.stringify({
										action: "profile",
										id: editing?.id,
										name: fd.get("name"),
										description: fd.get("description"),
										status: fd.get("status"),
										scope,
										grants,
										version: data.company.version,
									}),
								});
								const result = await response.json();
								if (!response.ok) throw new Error(result.error);
								setEditing(undefined);
								await onChange();
								setNotice(
									"Perfil guardado. Los permisos efectivos se vuelven a comprobar en cada solicitud.",
								);
							} catch (e) {
								setError(
									e instanceof Error ? e.message : "No se pudo guardar.",
								);
							} finally {
								setBusy(false);
							}
						}}
					>
						<fieldset disabled={busy || !canEdit || editing?.protected}>
							<div className="manage-grid">
								<label>
									Nombre del perfil *
									<input
										name="name"
										required
										minLength={2}
										maxLength={100}
										defaultValue={editing?.name || ""}
									/>
								</label>
								<label>
									Estado
									<select
										name="status"
										defaultValue={editing?.status || "active"}
									>
										<option value="active">Activo</option>
										<option value="retired">Retirado</option>
									</select>
								</label>
								<label>
									Alcance
									<select
										value={scope}
										disabled={!!editing}
										onChange={(e) => {
											setScope(e.target.value);
											setGrants([]);
										}}
									>
										<option value="company">Empresa actual</option>
										<option value="assigned">
											Solo asignaciones de cuadrilla
										</option>
									</select>
								</label>
								<label>
									Descripción
									<textarea
										name="description"
										maxLength={1000}
										defaultValue={editing?.description || ""}
									/>
								</label>
							</div>
							<label>
								Buscar módulo
								<input
									type="search"
									value={query}
									onChange={(e) => setQuery(e.target.value)}
								/>
							</label>
							<div className="manage-actions">
								<button
									type="button"
									className="quiet-button"
									onClick={() =>
										setGrants((old) => [
											...new Set([
												...old,
												...data.registry
													.filter(
														(c) =>
															groups.some(([r]) => r === c.resource) &&
															c.action === "read" &&
															c.scopes.includes(scope),
													)
													.map((c) => c.key),
											]),
										])
									}
								>
									Permitir consulta de módulos visibles
								</button>
								<button
									type="button"
									className="quiet-button"
									onClick={() =>
										setGrants((old) =>
											old.filter(
												(g) => !groups.some(([r]) => g.startsWith(`${r}.`)),
											),
										)
									}
								>
									Limpiar módulos visibles
								</button>
							</div>
							<section
								className="permission-matrix"
								aria-label="Matriz de permisos"
							>
								{groups.map(([resource, label]) => (
									<fieldset className="permission-module" key={resource}>
										<legend>{label}</legend>
										<div className="permission-actions">
											{actions.map(([action, actionLabel]) => {
												const c = data.registry.find(
														(p) =>
															p.resource === resource && p.action === action,
													),
													available = c?.scopes.includes(scope);
												return (
													<label
														key={action}
														className={available ? "" : "unavailable"}
													>
														<input
															type="checkbox"
															checked={!!c && grants.includes(c.key)}
															disabled={!available}
															onChange={(e) =>
																c && change(c.key, e.target.checked)
															}
														/>
														{actionLabel}
														{!available ? (
															<span className="muted"> · No disponible</span>
														) : null}
													</label>
												);
											})}
										</div>
									</fieldset>
								))}
							</section>
							<p>
								{grants.length} permisos seleccionados. Los módulos ocultos por
								la búsqueda conservan su selección.
							</p>
							<button type="submit">Guardar perfil</button>
						</fieldset>
						<button
							type="button"
							className="quiet-button"
							onClick={() => setEditing(undefined)}
						>
							Cerrar editor
						</button>
					</form>
				</section>
			) : null}
			<PagedTable label="Perfiles de la empresa">
				<table className="data-directory">
					<thead>
						<tr>
							<th>Perfil</th>
							<th>Alcance</th>
							<th>Usuarios</th>
							<th>Estado</th>
							<th>Acciones</th>
						</tr>
					</thead>
					<tbody>
						{data.profiles.map((p) => (
							<tr key={p.id}>
								<td>
									<strong>{p.name}</strong>
									<span className="table-subline">
										{p.description || `${p.grants.length} permisos`}
										{p.protected ? " · Protegido" : ""}
									</span>
								</td>
								<td>{p.scope === "assigned" ? "Asignaciones" : "Empresa"}</td>
								<td>
									{
										data.memberships.filter((m) => m.profile_ids.includes(p.id))
											.length
									}
								</td>
								<td>{p.status === "active" ? "Activo" : "Retirado"}</td>
								<td>
									<button
										type="button"
										className="quiet-button"
										onClick={() => open(p)}
									>
										{canEdit && !p.protected
											? "Editar permisos"
											: "Ver permisos"}
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</PagedTable>
		</div>
	);
}
