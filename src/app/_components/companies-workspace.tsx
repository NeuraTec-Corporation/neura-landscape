"use client";
import { useCallback, useEffect, useState } from "react";
import { PagedTable } from "./paged-collection";
import { Notices } from "./management-shared";
type Company = {
	kind?: "platform" | "operator";
	id: string;
	name: string;
	status: string;
	version: number;
	prefix: string | null;
};
type Totals = {
	customers: number;
	properties: number;
	crews: number;
	employees: number;
};
type Data = {
	scenario?: {
		distribution: { source: Totals; destination: Totals };
		operators: { id: string; name: string }[];
		users: {
			code: string;
			name: string;
			company_id: string;
			profile: string;
		}[];
	};
	setupStatus?: { status: string; message: string };
	companies: Company[];
	platformIT: boolean;
	activeCompany: string;
	users: { email: string; name: string; login_code: string }[];
	profiles: { company_id: string; id: string; name: string }[];
	memberships: {
		company_id: string;
		subject_id: string;
		profile_name: string;
		profile_id: string;
		status: string;
	}[];
};
export function CompaniesWorkspace() {
	const [data, setData] = useState<Data | null>(null),
		[edit, setEdit] = useState<Company | null>(null),
		[error, setError] = useState(""),
		[notice, setNotice] = useState(""),
		[busy, setBusy] = useState(false),
		[target, setTarget] = useState(""),
		[selectedUser, setSelectedUser] = useState(""),
		[formRevision, setFormRevision] = useState(0);
	const refresh = useCallback(async () => {
		const r = await fetch("/api/companies", { cache: "no-store" }),
			v = await r.json();
		if (!r.ok) throw Error(v.error);
		setData(v);
		setSelectedUser(
			(old) =>
				old ||
				v.users.find(
					(u: { email: string; login_code: string }) =>
						u.login_code ===
						new URLSearchParams(window.location.search).get("usuario"),
				)?.email ||
				"",
		);
		setTarget(
			(old) =>
				old ||
				v.companies.find(
					(c: Company) => c.id === v.activeCompany && c.kind !== "platform",
				)?.id ||
				v.companies.find((c: Company) => c.kind !== "platform")?.id ||
				"",
		);
	}, []);
	useEffect(() => {
		refresh().catch((e) => setError(e.message));
	}, [refresh]);
	async function post(input: Record<string, unknown>) {
		setError("");
		setNotice("");
		setBusy(true);
		try {
			const r = await fetch("/api/companies", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(input),
				}),
				v = await r.json();
			if (!r.ok) throw Error(v.error);
			await refresh();
			setNotice("Cambios guardados.");
			return true;
		} catch (e) {
			setError(e instanceof Error ? e.message : "No se pudo guardar.");
			return false;
		} finally {
			setBusy(false);
		}
	}
	if (!data)
		return (
			<section className="panel">
				<Notices error={error} />
				<p role="status">Consultando empresas…</p>
			</section>
		);
	return (
		<div className="manage-workspace">
			<Notices
				error={
					error ||
					(data.setupStatus?.status === "blocked"
						? data.setupStatus.message
						: "")
				}
				notice={notice}
			/>
			{data.platformIT && data.scenario ? (
				<section className="panel">
					<h3>Resultado del reparto inicial</h3>
					<p>
						Recursos existentes distribuidos entre las operadoras. Las
						referencias históricas archivadas no cuentan como empleados ni
						cuadrillas adicionales.
					</p>
					<PagedTable label="Distribución inicial por empresa">
						<table className="data-directory">
							<thead>
								<tr>
									<th>Empresa</th>
									<th>Clientes</th>
									<th>Localidades</th>
									<th>Empleados</th>
									<th>Cuadrillas</th>
								</tr>
							</thead>
							<tbody>
								{[
									data.scenario.distribution.source,
									data.scenario.distribution.destination,
								].map((totals, index) => (
									<tr key={data.scenario?.operators[index].id}>
										<td>{data.scenario?.operators[index].name}</td>
										<td>{totals.customers}</td>
										<td>{totals.properties}</td>
										<td>{totals.employees}</td>
										<td>{totals.crews}</td>
									</tr>
								))}
							</tbody>
						</table>
					</PagedTable>
				</section>
			) : null}
			<section className="panel">
				<h2>Empresas y acceso</h2>
				<p>
					IT administra la plataforma. Cada dueño y administrador trabaja
					únicamente en las empresas que tiene asignadas.
				</p>
				<PagedTable label="Empresas">
					<table className="data-directory">
						<thead>
							<tr>
								<th>Empresa</th>
								<th>Prefijo</th>
								<th>Estado</th>
								<th>Acciones</th>
							</tr>
						</thead>
						<tbody>
							{data.companies.map((c) => (
								<tr key={c.id}>
									<td>
										<strong>{c.name}</strong>
										{c.kind === "platform" ? (
											<span className="table-subline">
												Administración de plataforma · IT
											</span>
										) : null}
										{c.id === data.activeCompany ? (
											<span className="table-subline">Empresa activa</span>
										) : null}
									</td>
									<td>{c.prefix || "Por configurar"}</td>
									<td>{c.status === "active" ? "Activa" : "Deshabilitada"}</td>
									<td>
										{c.status === "active" ? (
											<button
												type="button"
												disabled={busy}
												onClick={async () => {
													if (
														await post({ action: "select", company_id: c.id })
													)
														window.location.assign("/");
												}}
											>
												Abrir empresa
											</button>
										) : null}
										{data.platformIT ? (
											<button
												type="button"
												className="quiet-button"
												onClick={() => setEdit(c)}
											>
												Editar empresa
											</button>
										) : null}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</PagedTable>
			</section>
			{data.platformIT ? (
				<>
					<section className="panel">
						<h3>{edit ? "Editar empresa" : "Crear empresa"}</h3>
						<p>
							Después de crearla, pulsa Abrir empresa y entra en Usuarios y
							permisos para crear su dueño y administrador general. Para una
							persona ya registrada, usa Asignar usuario a una empresa.
						</p>
						<form
							key={edit?.id || `new-${formRevision}`}
							onSubmit={async (e) => {
								e.preventDefault();
								const f = new FormData(e.currentTarget);
								if (
									await post({
										action: "save",
										...(edit ? { id: edit.id, version: edit.version } : {}),
										name: f.get("name"),
										prefix: f.get("prefix"),
										status: f.get("status"),
									})
								) {
									setEdit(null);
									setFormRevision((v) => v + 1);
								}
							}}
						>
							<fieldset disabled={busy}>
								<div className="manage-grid">
									<label>
										Nombre de la empresa *
										<input
											name="name"
											required
											minLength={2}
											maxLength={150}
											defaultValue={edit?.name || ""}
										/>
									</label>
									<label>
										Prefijo de usuarios *
										<input
											name="prefix"
											required
											readOnly={!!edit}
											pattern="[A-Za-z]{3}"
											maxLength={3}
											defaultValue={edit?.prefix || ""}
											placeholder="Ej. ROJ"
										/>
									</label>
									<label>
										Estado
										<select
											name="status"
											defaultValue={edit?.status || "active"}
										>
											<option value="active">Activa</option>
											<option value="disabled">Deshabilitada</option>
										</select>
									</label>
								</div>
								<p>
									La empresa nueva empieza sin clientes ni operaciones. Su
									prefijo es único y se conserva para evitar cambiar códigos ya
									emitidos.
								</p>
								<button type="submit">
									{edit ? "Guardar empresa" : "Crear empresa"}
								</button>
								{edit ? (
									<button type="button" onClick={() => setEdit(null)}>
										Cancelar edición
									</button>
								) : null}
							</fieldset>
						</form>
					</section>
					<section className="panel">
						<h3>Asignar usuario a una empresa</h3>
						<p>
							Crea primero el usuario en Usuarios y permisos. Aquí puedes
							añadirle otra empresa; sus accesos anteriores se conservan. El
							perfil elegido reemplaza sus perfiles en la empresa seleccionada.
						</p>
						<form
							onSubmit={async (e) => {
								e.preventDefault();
								const f = new FormData(e.currentTarget);
								await post({
									action: "assign",
									company_id: target,
									subject_id: f.get("subject_id"),
									profile_id: f.get("profile_id"),
								});
							}}
						>
							<fieldset disabled={busy}>
								<div className="manage-grid">
									<label>
										Empresa *
										<select
											value={target}
											onChange={(e) => setTarget(e.target.value)}
											required
										>
											{data.companies
												.filter(
													(c) => c.status === "active" && c.kind !== "platform",
												)
												.map((c) => (
													<option key={c.id} value={c.id}>
														{c.name}
													</option>
												))}
										</select>
									</label>
									<label>
										Usuario *
										<select
											name="subject_id"
											required
											value={selectedUser}
											onChange={(e) => setSelectedUser(e.target.value)}
										>
											<option value="" disabled>
												Selecciona un usuario
											</option>
											{data.users.map((u) => (
												<option key={u.email} value={u.email}>
													{u.login_code} · {u.name}
												</option>
											))}
										</select>
									</label>
									<label>
										Perfil en esta empresa *
										<select
											key={target}
											name="profile_id"
											required
											defaultValue=""
										>
											<option value="" disabled>
												Selecciona un perfil
											</option>
											{data.profiles
												.filter((p) => p.company_id === target)
												.map((p) => (
													<option key={p.id} value={p.id}>
														{p.name}
													</option>
												))}
										</select>
									</label>
								</div>
								<button type="submit">Asignar empresa y perfil</button>
							</fieldset>
						</form>
						<h3>Accesos empresariales</h3>
						<PagedTable label="Asignaciones por empresa">
							<table className="data-directory">
								<thead>
									<tr>
										<th>Usuario</th>
										<th>Empresa</th>
										<th>Perfil</th>
										<th>Estado</th>
									</tr>
								</thead>
								<tbody>
									{data.memberships.map((m) => (
										<tr key={`${m.company_id}-${m.subject_id}-${m.profile_id}`}>
											<td>
												{data.users.find((u) => u.email === m.subject_id)
													?.name || m.subject_id}
											</td>
											<td>
												{
													data.companies.find((c) => c.id === m.company_id)
														?.name
												}
											</td>
											<td>{m.profile_name}</td>
											<td>
												{m.status === "active" ? "Activo" : "Deshabilitado"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</PagedTable>
					</section>
				</>
			) : null}
		</div>
	);
}
