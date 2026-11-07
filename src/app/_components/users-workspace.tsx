"use client";
import { CatalogField } from "./catalogs";
import { useEffect, useState, useCallback } from "react";
const roles = {
	it_admin: "Administrador de TI",
	owner: "Dueño",
	manager: "Manager",
	crew_lead: "Jefe de cuadrilla",
	worker: "Trabajador",
	finance: "Administración financiera",
};
type Member = {
	email: string;
	name: string;
	role: string;
	status: string;
	revision: number;
	crew_ids: string[];
};
export function UsersWorkspace() {
	const [users, setUsers] = useState<Member[]>([]),
		[crews, setCrews] = useState<{ id: string; name: string }[]>([]),
		[enabled, setEnabled] = useState(false),
		[edit, setEdit] = useState<Member | null>(null),
		[busy, setBusy] = useState(false),
		[error, setError] = useState(""),
		[notice, setNotice] = useState("");
	const refresh = useCallback(async () => {
		const r = await fetch("/api/users", { cache: "no-store" }),
			v = await r.json();
		if (!r.ok) throw new Error(v.error);
		setUsers(v.users);
		setCrews(v.crews);
		setEnabled(v.enabled);
	}, []);
	useEffect(() => {
		refresh().catch((e) => setError(e.message));
	}, [refresh]);
	return (
		<section className="survey-workspace">
			<header className="survey-hero">
				<p className="eyebrow">IDENTIDAD Y RESPONSABILIDADES</p>
				<h2>Personas con acceso</h2>
				<p>Ingreso con Google, rol operativo y cuadrillas asignadas.</p>
			</header>
			{!enabled ? (
				<p className="notice">
					El acceso individual aún no está activado: falta configurar Google
					OAuth. La protección actual sigue siendo la del despliegue Vercel;
					estos roles solo se aplican al activar el acceso individual.
				</p>
			) : null}
			{error ? (
				<p role="alert" className="notice error">
					{error}
				</p>
			) : null}
			{notice ? <p role="status">{notice}</p> : null}
			<form
				className="panel survey-form"
				key={edit?.email ?? "new"}
				onSubmit={async (e) => {
					e.preventDefault();
					const form = e.currentTarget,
						fd = new FormData(form);
					setBusy(true);
					setError("");
					try {
						const response = await fetch("/api/users", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								email: edit?.email ?? fd.get("email"),
								name: fd.get("name"),
								role: fd.get("role"),
								status: fd.get("status"),
								crew_ids: fd.getAll("crew_ids"),
								...(edit ? { revision: edit.revision } : {}),
							}),
						});
						const v = await response.json();
						if (!response.ok) throw new Error(v.error);
						setEdit(null);
						form.reset();
						setNotice(
							"Usuario autorizado guardado. No se ha enviado un correo de invitación.",
						);
						await refresh();
					} catch (e) {
						setError(e instanceof Error ? e.message : "No se pudo guardar.");
					} finally {
						setBusy(false);
					}
				}}
			>
				<fieldset disabled={busy}>
					<legend>{edit ? "Editar acceso" : "Autorizar usuario"}</legend>
					<div className="survey-fields">
						<label>
							Nombre
							<input
								name="name"
								required
								maxLength={150}
								defaultValue={edit?.name ?? ""}
							/>
						</label>
						<label>
							Correo de Google
							<input
								name="email"
								type="email"
								required
								maxLength={254}
								defaultValue={edit?.email ?? ""}
								disabled={!!edit}
							/>
						</label>
						<CatalogField
							label="Rol"
							category="app_role"
							name="role"
							defaultValue={edit?.role ?? "worker"}
						/>
						<CatalogField
							label="Estado"
							category="member_status"
							name="status"
							defaultValue={edit?.status ?? "active"}
						/>
					</div>
					<fieldset className="survey-assignments">
						<legend>Cuadrillas asignadas</legend>
						{crews.map((crew) => (
							<label key={crew.id}>
								<input
									type="checkbox"
									name="crew_ids"
									value={crew.id}
									defaultChecked={edit?.crew_ids.includes(crew.id) ?? false}
								/>
								{crew.name}
							</label>
						))}
					</fieldset>
					<p>
						Trabajadores y jefes de cuadrilla solo consultarán visitas
						pendientes o en ejecución de sus cuadrillas, sin tarifas ni reportes
						financieros.
					</p>
					<button type="submit">Guardar acceso</button>
					{edit ? (
						<button type="button" onClick={() => setEdit(null)}>
							Cancelar
						</button>
					) : null}
				</fieldset>
			</form>
			<div className="survey-zone-grid">
				{users.map((user) => (
					<article className="panel" key={user.email}>
						<h3>{user.name}</h3>
						<p>{user.email}</p>
						<span className="pill">
							{roles[user.role as keyof typeof roles]} ·{" "}
							{user.status === "active" ? "Activo" : "Deshabilitado"}
						</span>
						<p>
							{user.crew_ids
								.map((id) => crews.find((c) => c.id === id)?.name)
								.filter(Boolean)
								.join(" · ") || "Sin cuadrillas asignadas"}
						</p>
						<button type="button" onClick={() => setEdit(user)}>
							Editar acceso
						</button>
					</article>
				))}
			</div>
		</section>
	);
}
