"use client";
import { useState, useRef, useEffect } from "react";
import { DataDirectory } from "./data-directory";
import { CatalogField, CatalogSelect, useCatalogs } from "./catalogs";
import { PhoneField } from "@/shared/ui";
import { Notices, useManagement, usd } from "./management-shared";
export type Employee = {
	id: string;
	code: string;
	first_name: string;
	last_name: string;
	email: string;
	phone: string;
	role_key: string;
	skills: string;
	hourly_cents: number | null;
	status: string;
	revision: number;
};
export type CrewMember = {
	employee_id: string;
	name: string;
	duty: string;
	hourly_cents: number | null;
	status: string;
};
export type Crew = {
	id: string;
	name: string;
	workers: number;
	hourly_cents: number;
	shift_start: string;
	shift_end: string;
	break_minutes: number;
	revision: number;
	members: CrewMember[];
};
export type Workforce = { employees: Employee[]; crews: Crew[] };
export function WorkforceWorkspace({ mode }: { mode: "employees" | "crews" }) {
	const state = useManagement<Workforce>("workforce"),
		c = useCatalogs(),
		[employee, setEmployee] = useState<Employee | null>(null),
		[crew, setCrew] = useState<Crew | null>(null),
		[members, setMembers] = useState<{ employee_id: string; duty: string }[]>(
			[],
		),
		[phone, setPhone] = useState("");
	const data = state.data;
	const editor = useRef<HTMLElement>(null);
	const [detailId, setDetailId] = useState<string | null>(null),
		[showEditor, setShowEditor] = useState(false);
	const isEditing = Boolean(employee || crew);
	useEffect(() => {
		if (showEditor || isEditing)
			requestAnimationFrame(() => {
				editor.current?.scrollIntoView({ behavior: "smooth", block: "start" });
				editor.current?.focus({ preventScroll: true });
			});
	}, [showEditor, isEditing]);
	useEffect(() => {
		if (state.error)
			requestAnimationFrame(() => {
				const field = editor.current?.querySelector<HTMLElement>(
					"[aria-invalid=true],input:invalid,select:invalid",
				);
				if (field) field.focus();
				else editor.current?.focus();
			});
	}, [state.error]);
	return (
		<div className="manage-workspace">
			<Notices error={state.error} notice={state.notice} />
			<header className="manage-intro">
				<div>
					<p className="eyebrow">EQUIPO HUMANO</p>
					<h2>
						{mode === "employees"
							? "Personas identificadas, trabajo trazable."
							: "Quiénes integran cada cuadrilla."}
					</h2>
					<p>
						{mode === "employees"
							? "El empleado es la persona que trabaja. Su acceso con Google se administra por separado en Usuarios y niveles."
							: "Selecciona personas, sus funciones y el horario de la cuadrilla. El número de integrantes se calcula automáticamente."}
					</p>
				</div>
			</header>
			{!data ? (
				<p role="status">Cargando equipo...</p>
			) : (
				<>
					{mode === "employees" ? (
						<section
							ref={editor}
							tabIndex={-1}
							hidden={!showEditor && !employee}
							className="panel editor-panel"
						>
							<h2>{employee ? "Editar empleado" : "Nuevo empleado"}</h2>
							<form
								key={employee?.id ?? "new"}
								className="manage-form"
								onSubmit={async (e) => {
									e.preventDefault();
									const form = e.currentTarget,
										fd = Object.fromEntries(new FormData(form));
									if (
										await state.save({
											...fd,
											entity: "employee",
											phone,
											...(employee
												? { id: employee.id, revision: employee.revision }
												: {}),
										})
									) {
										setEmployee(null);
										setShowEditor(false);
										setPhone("");
										form.reset();
									}
								}}
							>
								<fieldset disabled={state.busy}>
									<div className="manage-grid">
										<label>
											Nombre *
											<input
												name="first_name"
												required
												maxLength={150}
												defaultValue={employee?.first_name ?? ""}
											/>
										</label>
										<label>
											Apellido *
											<input
												name="last_name"
												required
												maxLength={150}
												defaultValue={employee?.last_name ?? ""}
											/>
										</label>
										<label>
											Correo
											<input
												name="email"
												type="email"
												defaultValue={employee?.email ?? ""}
											/>
										</label>
										<PhoneField
											label="Teléfono"
											value={phone}
											onChange={setPhone}
											defaultCountry="US"
										/>
										<label htmlFor="employee-role">
											Función
											<CatalogSelect
												id="employee-role"
												category="employee_role"
												name="role_key"
												defaultValue={employee?.role_key ?? "operator"}
												required
											/>
										</label>
										<label>
											Costo laboral por hora (USD)
											<input
												name="hourly"
												type="number"
												min="0"
												max="1000000"
												step="0.01"
												defaultValue={
													employee?.hourly_cents === null
														? ""
														: employee
															? Number(employee.hourly_cents) / 100
															: ""
												}
											/>
										</label>
										<CatalogField
											label="Estado"
											category="employee_status"
											name="status"
											defaultValue={employee?.status ?? "active"}
										/>
										<label className="field-wide">
											Habilidades y observaciones
											<textarea
												name="skills"
												maxLength={2000}
												defaultValue={employee?.skills ?? ""}
											/>
										</label>
									</div>
									<p>
										Si no conoces el costo por hora, déjalo pendiente. El
										sistema no lo interpretará como costo cero.
									</p>
									<div className="manage-actions">
										<button type="submit">
											{employee ? "Guardar empleado" : "Crear empleado"}
										</button>
										{showEditor || employee ? (
											<button
												type="button"
												className="quiet-button"
												onClick={() => {
													setEmployee(null);
													setShowEditor(false);
													setPhone("");
												}}
											>
												Cancelar
											</button>
										) : null}
									</div>
								</fieldset>
							</form>
						</section>
					) : (
						<section
							ref={editor}
							tabIndex={-1}
							hidden={!showEditor && !crew}
							className="panel editor-panel"
						>
							<h2>{crew ? "Editar cuadrilla" : "Nueva cuadrilla"}</h2>
							<form
								key={crew?.id ?? "new"}
								className="manage-form"
								onSubmit={async (e) => {
									e.preventDefault();
									const form = e.currentTarget,
										fd = Object.fromEntries(new FormData(form));
									if (
										await state.save({
											...fd,
											entity: "crew",
											members,
											...(crew ? { id: crew.id, revision: crew.revision } : {}),
										})
									) {
										setCrew(null);
										setShowEditor(false);
										setMembers([]);
										form.reset();
									}
								}}
							>
								<fieldset disabled={state.busy}>
									<div className="manage-grid">
										<label className="field-wide">
											Nombre de cuadrilla *
											<input
												name="name"
												required
												maxLength={150}
												defaultValue={crew?.name ?? ""}
											/>
										</label>
										<label>
											Inicio del turno
											<input
												name="shift_start"
												type="time"
												required
												defaultValue={crew?.shift_start ?? "08:00"}
											/>
										</label>
										<label>
											Fin del turno
											<input
												name="shift_end"
												type="time"
												required
												defaultValue={crew?.shift_end ?? "17:00"}
											/>
										</label>
										<label>
											Descansos (minutos)
											<input
												name="break_minutes"
												type="number"
												min="0"
												max="180"
												required
												defaultValue={crew?.break_minutes ?? 30}
											/>
										</label>
									</div>
									<h3>Integrantes y responsabilidades</h3>
									{!data.employees.length ? (
										<p>Primero registra las personas en Empleados.</p>
									) : (
										<div className="crew-picker">
											{data.employees
												.filter(
													(e) =>
														e.status === "active" ||
														members.some((m) => m.employee_id === e.id),
												)
												.map((e) => {
													const member = members.find(
														(m) => m.employee_id === e.id,
													);
													return (
														<div className="crew-person" key={e.id}>
															<label className="check-label">
																<input
																	type="checkbox"
																	checked={!!member}
																	onChange={(event) =>
																		setMembers(
																			event.target.checked
																				? [
																						...members,
																						{
																							employee_id: e.id,
																							duty: e.role_key,
																						},
																					]
																				: members.filter(
																						(m) => m.employee_id !== e.id,
																					),
																		)
																	}
																/>
																<span>
																	<strong>
																		{e.first_name} {e.last_name}
																	</strong>
																	<small>
																		{e.code} ·{" "}
																		{e.hourly_cents === null
																			? "Costo pendiente"
																			: `${usd(e.hourly_cents)}/h`}
																	</small>
																</span>
															</label>
															{member ? (
																<label htmlFor={`duty-${e.id}`}>
																	Responsabilidad
																	<CatalogSelect
																		id={`duty-${e.id}`}
																		category="employee_role"
																		name={`duty-${e.id}`}
																		value={member.duty}
																		onChange={(duty) =>
																			setMembers(
																				members.map((m) =>
																					m.employee_id === e.id
																						? { ...m, duty }
																						: m,
																				),
																			)
																		}
																	/>
																</label>
															) : null}
														</div>
													);
												})}
										</div>
									)}
									<p>
										<strong>{members.length}</strong> integrantes seleccionados.
										Cada visita permitirá asignar tareas a una persona o a toda
										la cuadrilla.
									</p>
									<div className="manage-actions">
										<button type="submit">
											{crew ? "Guardar cuadrilla" : "Crear cuadrilla"}
										</button>
										{showEditor || crew ? (
											<button
												className="quiet-button"
												type="button"
												onClick={() => {
													setCrew(null);
													setShowEditor(false);
													setMembers([]);
												}}
											>
												Cancelar
											</button>
										) : null}
									</div>
								</fieldset>
							</form>
						</section>
					)}
					<div className="directory-heading">
						<h2>
							{mode === "employees"
								? "Directorio de empleados"
								: "Directorio de cuadrillas"}
						</h2>
						<button
							type="button"
							onClick={() => {
								setCrew(null);
								setEmployee(null);
								setMembers([]);
								setPhone("");
								setShowEditor(true);
							}}
						>
							{mode === "employees" ? "+ Nuevo empleado" : "+ Nueva cuadrilla"}
						</button>
					</div>
					{mode === "employees" ? (
						<DataDirectory
							label="Empleados"
							rows={data.employees}
							columns={[
								{
									key: "name",
									label: "Persona",
									value: (e) => `${e.first_name} ${e.last_name}`,
									render: (e) => (
										<>
											<strong>
												{e.first_name} {e.last_name}
											</strong>
											<small>{e.code}</small>
										</>
									),
								},
								{
									key: "role",
									label: "Función",
									value: (e) => c.label("employee_role", e.role_key),
								},
								{
									key: "status",
									label: "Estado",
									value: (e) => c.label("employee_status", e.status),
									secondary: true,
								},
							]}
							actions={(e) => (
								<>
									<button
										type="button"
										onClick={() => {
											setEmployee(e);
											setPhone(e.phone);
											setShowEditor(true);
										}}
									>
										Editar
									</button>
									<button
										type="button"
										className="quiet-button"
										onClick={() => setDetailId(detailId === e.id ? null : e.id)}
									>
										Detalle
									</button>
								</>
							)}
						/>
					) : (
						<DataDirectory
							label="Cuadrillas"
							rows={data.crews}
							columns={[
								{
									key: "name",
									label: "Cuadrilla",
									value: (t) => t.name,
									render: (t) => (
										<>
											<strong>{t.name}</strong>
											<small>
												{t.shift_start}–{t.shift_end}
											</small>
										</>
									),
								},
								{
									key: "members",
									label: "Integrantes",
									value: (t) =>
										t.members.map((m) => m.name).join(", ") ||
										`${t.workers} sin identificar`,
									render: (t) => (
										<>
											<strong>{t.members.length || t.workers} personas</strong>
											<small>
												{t.members.map((m) => m.name).join(", ") ||
													"Integrantes por identificar"}
											</small>
										</>
									),
								},
								{
									key: "shift",
									label: "Descanso",
									value: (t) => `${t.break_minutes} min`,
									secondary: true,
								},
							]}
							actions={(t) => (
								<>
									<button
										type="button"
										onClick={() => {
											setCrew(t);
											setMembers(
												t.members.map((m) => ({
													employee_id: m.employee_id,
													duty: m.duty,
												})),
											);
											setShowEditor(true);
										}}
									>
										Editar
									</button>
									<button
										type="button"
										className="quiet-button"
										onClick={() => setDetailId(detailId === t.id ? null : t.id)}
									>
										Detalle
									</button>
								</>
							)}
						/>
					)}
					<div className="manage-card-grid">
						{mode === "employees"
							? data.employees
									.filter((e) => e.id === detailId)
									.map((e) => (
										<article className="panel person-card" key={e.id}>
											<div className="person-avatar" aria-hidden="true">
												{e.first_name[0]}
												{e.last_name[0]}
											</div>
											<h3>
												{e.first_name} {e.last_name}
											</h3>
											<p>
												{e.code} · {c.label("employee_role", e.role_key)}
											</p>
											<span className={`status-tag ${e.status}`}>
												{e.status === "active" ? "Activo" : "Inactivo"}
											</span>
											<p>
												{e.email || "Sin correo"}{" "}
												{e.phone ? `· ${e.phone}` : ""}
											</p>
											<p>{e.skills}</p>
											<p>
												Costo por hora:{" "}
												<strong>
													{e.hourly_cents === null
														? "Pendiente"
														: usd(e.hourly_cents)}
												</strong>
											</p>
											<div className="manage-actions">
												<button
													type="button"
													onClick={() => {
														setEmployee(e);
														setShowEditor(true);
														setPhone(e.phone);
													}}
												>
													Editar
												</button>
												<button
													className="quiet-button"
													type="button"
													disabled={state.busy}
													onClick={() => {
														if (
															window.confirm(
																"¿Dar de baja a esta persona? Sus trabajos históricos se conservarán.",
															)
														)
															void state.save({
																action: "delete",
																entity: "employee",
																id: e.id,
																revision: e.revision,
															});
													}}
												>
													Eliminar
												</button>
											</div>
										</article>
									))
							: data.crews
									.filter((t) => t.id === detailId)
									.map((team) => (
										<article className="panel" key={team.id}>
											<p className="eyebrow">CUADRILLA</p>
											<h3>{team.name}</h3>
											<p>
												{team.shift_start}–{team.shift_end} ·{" "}
												{team.break_minutes} min de descanso
											</p>
											{team.members.length ? (
												<ul className="crew-roster">
													{team.members.map((member) => (
														<li key={member.employee_id}>
															<strong>{member.name}</strong>
															<span>
																{c.label("employee_role", member.duty)}
																{member.status !== "active"
																	? " · Inactivo"
																	: ""}
															</span>
														</li>
													))}
												</ul>
											) : (
												<p className="notice">
													{team.workers} trabajadores históricos sin
													identificar. Edita la cuadrilla para asignar personas
													antes de programar nuevas visitas.
												</p>
											)}
											<div className="manage-actions">
												<button
													type="button"
													onClick={() => {
														setCrew(team);
														setShowEditor(true);
														setMembers(
															team.members.map((m) => ({
																employee_id: m.employee_id,
																duty: m.duty,
															})),
														);
													}}
												>
													Editar cuadrilla
												</button>
												<button
													type="button"
													className="quiet-button"
													disabled={state.busy}
													onClick={() => {
														if (
															window.confirm(
																"¿Dar de baja la cuadrilla? Primero deben resolverse sus visitas pendientes.",
															)
														)
															void state.save({
																action: "delete",
																entity: "crew",
																id: team.id,
																revision: team.revision,
															});
													}}
												>
													Eliminar cuadrilla
												</button>
											</div>
										</article>
									))}
					</div>
				</>
			)}
		</div>
	);
}
