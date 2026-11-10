"use client";
import { useSessionAccess } from "./user-account";
import { PagedCollection } from "./paged-collection";
import { useEffect, useState, useRef } from "react";
import { CapacityBoard, CapacitySummary } from "./capacity-board";
import { dailyCapacity, planningDay } from "@/modules/operations/daily-capacity.mjs";
import { CatalogSelect, useCatalogs } from "./catalogs";
import {
	Notices,
	useManagement,
	readManagement,
	usd,
} from "./management-shared";
import type { Workforce } from "./workforce-workspace";
export type Task = {
	clientKey?: string;
	id?: string;
	service_key: string;
	description: string;
	element_id: string | null;
	employee_id: string | null;
	quantity: number;
	unit: string;
	completed_quantity?: number | null;
	status?: string;
	notes?: string;
};
export type Personnel = {
	employee_id: string;
	name_snapshot: string;
	duty: string;
	hourly_cents: number | null;
	actual_minutes: number | null;
};
export type Visit = {
	assignment_review_required?: boolean;
	assignment_review_reason?: string;
	id: string;
	revision: number;
	contract_id: string;
	crew_id: string;
	scheduled_at: string;
	route_order: number;
	status: string;
	service_key?: string | null;
	title: string;
	planned_minutes: number;
	travel_minutes: number;
	property_id: string;
	property_name: string;
	property_code: string;
	customer_name: string;
	customer_id: string;
	crew_name: string;
	city: string;
	region: string;
	notes: string;
	cancellation_reason: string;
	tasks: Task[];
	personnel: Personnel[];
	cost_lines: {
		id: string;
		category: "materials" | "equipment" | "travel" | "overhead";
		description: string;
		quantity: number;
		unit_price_cents: number;
		total_cents: number;
	}[];
	labor_cents: number | null;
	materials_cents: number;
	equipment_cents: number;
	travel_cents: number;
	overhead_cents: number;
	cost_complete: boolean;
	planned_revenue_cents: number | null;
	planned_labor_hourly_cents: number | null;
	revenue_cents: number | null;
};
type Contract = {
	id: string;
	property_id: string;
	customer_name: string;
	property_name: string;
	property_code: string;
	service: string;
	estimated_minutes: number;
	monthly_cents: number;
	visits_per_month: number;
	status: string;
	deleted_at: string | null;
};
const statusLabels: Record<string, string> = {
	scheduled: "Programada",
	started: "En ejecución",
	completed: "Completada",
	cancelled: "Cancelada",
};
const freshTask = (): Task => ({
	clientKey: crypto.randomUUID(),
	service_key: "maintenance",
	description: "",
	element_id: null,
	employee_id: null,
	quantity: 1,
	unit: "each",
});
const localInput = (value: string) => {
	const d = new Date(value);
	return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
		.toISOString()
		.slice(0, 16);
};
function ExecutionForm({
	visit,
	cancel,
	busy,
	onSubmit,
	onClose,
}: {
	visit: Visit;
	cancel: boolean;
	busy: boolean;
	onSubmit: (input: unknown) => Promise<boolean>;
	onClose: () => void;
}) {
	const c = useCatalogs();
	return (
		<section className="panel execution-editor">
			<h2>
				{cancel
					? "Cancelar con registro de lo realizado"
					: "Finalizar ejecución"}
			</h2>
			<p>
				{visit.customer_name} · {visit.property_name} · {visit.title}
			</p>
			<form
				className="manage-form"
				onSubmit={async (e) => {
					e.preventDefault();
					const fd = new FormData(e.currentTarget);
					const personnel = visit.personnel.map((p) => ({
							employee_id: p.employee_id,
							actual_minutes: Number(fd.get(`minutes-${p.employee_id}`)),
						})),
						tasks = visit.tasks.map((t) => ({
							id: t.id,
							completed_quantity: Number(fd.get(`quantity-${t.id}`)),
							status: String(fd.get(`status-${t.id}`) || "blocked"),
							notes: String(fd.get(`notes-${t.id}`) || ""),
						}));
					if (
						await onSubmit({
							action: cancel ? "cancel" : "complete",
							id: visit.id,
							revision: visit.revision,
							personnel,
							tasks,
							legacy_minutes: fd.has("legacy_minutes")
								? Number(fd.get("legacy_minutes"))
								: undefined,
							reason: String(fd.get("reason") || ""),
							notes: String(fd.get("notes") || ""),
						})
					)
						onClose();
				}}
			>
				<fieldset disabled={busy}>
					<h3>Tiempo real por persona</h3>
					<div className="manage-grid">
						{visit.personnel.map((p) => (
							<label key={p.employee_id}>
								{p.name_snapshot} · minutos
								<input
									name={`minutes-${p.employee_id}`}
									type="number"
									required
									min="0"
									max="1440"
									defaultValue={p.actual_minutes ?? 0}
								/>
							</label>
						))}
						{!visit.personnel.length ? (
							<label>
								Minutos de la cuadrilla histórica sin identificar
								<input
									name="legacy_minutes"
									type="number"
									required
									min={cancel ? 0 : 1}
									max="1440"
								/>
							</label>
						) : null}
					</div>
					<h3>Cantidades realmente ejecutadas</h3>
					{visit.tasks.map((t) => (
						<div className="task-execution" key={t.id}>
							<div>
								<strong>{t.description}</strong>
								<p>
									{c.label("service", t.service_key)} · previsto: {t.quantity}{" "}
									{c.label("element_unit", t.unit)}
								</p>
							</div>
							<label>
								Cantidad realizada
								<input
									name={`quantity-${t.id}`}
									type="number"
									min="0"
									max="1000000"
									step={t.unit === "each" ? "1" : "0.001"}
									required
									defaultValue={t.completed_quantity ?? 0}
								/>
							</label>
							{!cancel ? (
								<>
									<label>
										Resultado
										<select
											name={`status-${t.id}`}
											defaultValue={t.status === "blocked" ? "blocked" : "done"}
										>
											<option value="done">Realizada</option>
											<option value="blocked">Bloqueada / incompleta</option>
										</select>
									</label>
									<label>
										Incidencia u observación
										<input
											name={`notes-${t.id}`}
											maxLength={1000}
											defaultValue={t.notes ?? ""}
										/>
									</label>
								</>
							) : null}
						</div>
					))}
					{cancel ? (
						<label>
							Motivo de cancelación *
							<textarea name="reason" required minLength={5} maxLength={2000} />
						</label>
					) : (
						<label>
							Observaciones de ejecución
							<textarea
								name="notes"
								maxLength={3000}
								defaultValue={visit.notes}
							/>
						</label>
					)}
					<p>
						{cancel
							? "Si se inició por error y no se trabajó, registra cero. Si hubo trabajo o consumos, se conservarán sus costos y cantidades."
							: "Los costos de materiales, equipos y traslados se detallan en Costos. Aquí se registra lo realizado."}
					</p>
					<div className="manage-actions">
						<button type="submit">
							{cancel ? "Confirmar cancelación" : "Guardar ejecución"}
						</button>
						<button className="quiet-button" type="button" onClick={onClose}>
							Volver
						</button>
					</div>
				</fieldset>
			</form>
		</section>
	);
}
export function VisitsWorkspace() {
	const access = useSessionAccess();
	const canCreate = access.can("visits.create"),
		canUpdate = access.can("visits.update"),
		canExecute = access.can("visits.execute"),
		canDelete = access.can("visits.delete"),
		canCosts = access.can("costs.read"),
		canPlan = canCreate || canUpdate;
	const state = useManagement<Visit[]>("visits"),
		c = useCatalogs(),
		[workforce, setWorkforce] = useState<Workforce | null>(null),
		[contracts, setContracts] = useState<Contract[]>([]),
		[editing, setEditing] = useState<Visit | null>(null),
		[contractId, setContractId] = useState(""),
		[crewId, setCrewId] = useState(""),
		[tasks, setTasks] = useState<Task[]>([freshTask()]),
		[inventory, setInventory] = useState<
			{
				id: string;
				name: string;
				quantity: number;
				unit: string;
				service: string;
			}[]
		>([]),
		[execution, setExecution] = useState<{
			visit: Visit;
			cancel: boolean;
		} | null>(null),
		[filter, setFilter] = useState(""),
		[title, setTitle] = useState("");
	const editorRef = useRef<HTMLElement>(null);
	const [scheduled, setScheduled] = useState(""),
		[plannedMinutes, setPlannedMinutes] = useState("60"),
		[travelMinutes, setTravelMinutes] = useState("0");
	useEffect(() => {
		if (editing) {
			editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
			editorRef.current?.focus({ preventScroll: true });
		}
	}, [editing]);
	useEffect(() => {
		if (!canPlan) return;
		Promise.all([
			readManagement<Workforce>("workforce"),
			fetch("/api/contracts").then(async (r) => {
				const v = await r.json();
				if (!r.ok) throw new Error(v.error);
				return v;
			}),
		])
			.then(([w, ct]) => {
				setWorkforce(w);
				setContracts(ct);
			})
			.catch((e) => state.setError(e.message));
	}, [state.setError, canPlan]);
	const contract = contracts.find((ct) => ct.id === contractId),
		crew = workforce?.crews.find((ct) => ct.id === crewId);
	useEffect(() => {
		if (!contract) {
			setInventory([]);
			return;
		}
		const controller = new AbortController();
		fetch(`/api/survey?property_id=${contract.property_id}`, {
			signal: controller.signal,
			cache: "no-store",
		})
			.then(async (r) => {
				const v = await r.json();
				if (!r.ok) throw new Error(v.error);
				setInventory(v.elements);
			})
			.catch((e) => {
				if (e.name !== "AbortError") state.setError(e.message);
			});
		return () => controller.abort();
	}, [contract, state.setError]);
	const updateTask = (index: number, change: Partial<Task>) =>
		setTasks(
			tasks.map((task, i) => (i === index ? { ...task, ...change } : task)),
		);
	const reset = () => {
		setEditing(null);
		setContractId("");
		setCrewId("");
		setTitle("");
		setTasks([freshTask()]);
		setScheduled("");
		setPlannedMinutes("60");
		setTravelMinutes("0");
	};
	const editVisit = (v: Visit) => {
		setExecution(null);
		setEditing(v);
		setContractId(v.contract_id);
		setCrewId(v.crew_id);
		setTitle(v.title || "Trabajo del contrato");
		setScheduled(localInput(v.scheduled_at));
		setPlannedMinutes(String(v.planned_minutes ?? 60));
		setTravelMinutes(String(v.travel_minutes ?? 0));
		setTasks(v.tasks.length ? v.tasks.map((t) => ({ ...t, clientKey: t.id ?? crypto.randomUUID() })) : [freshTask()]);
	};
	const people = crew?.members ?? [];
	const previewDate = new Date(scheduled);
	const preview = crew && !Number.isNaN(previewDate.getTime()) && Number(plannedMinutes) > 0 && Number(travelMinutes) >= 0
		? dailyCapacity(workforce?.crews ?? [], state.data ?? [], planningDay(previewDate), {
			id: editing?.id ?? "unsaved-capacity-preview", crew_id: crew.id, scheduled_at: previewDate.toISOString(), status: "scheduled", planned_minutes: Number(plannedMinutes), travel_minutes: Number(travelMinutes), personnel: people.map((p) => ({ employee_id: p.employee_id })),
		}).find((row) => row.id === crew.id) : null;
	const known =
			people.length > 0 && people.every((p) => p.hourly_cents !== null),
		hourly = people.reduce((sum, p) => sum + Number(p.hourly_cents || 0), 0);
	return (
		<div className="manage-workspace">
			<Notices error={state.error} notice={state.notice} />
			{canPlan && workforce && state.data ? <CapacityBoard workforce={workforce} visits={state.data} busy={state.busy} canEdit={canUpdate} onEdit={editVisit} /> : null}
			{execution ? (
				<ExecutionForm
					visit={execution.visit}
					cancel={execution.cancel}
					busy={state.busy}
					onSubmit={state.save}
					onClose={() => setExecution(null)}
				/>
			) : (editing ? canUpdate : canCreate) ? (
				<section className="panel" ref={editorRef} tabIndex={-1} aria-label="Editor de visita">
					<h2>
						{editing ? "Editar y reprogramar visita" : "Programar visita"}
					</h2>
					{editing?.assignment_review_required ? <p className="notice">Reasignación pendiente. Selecciona una cuadrilla operativa y revisa los responsables de las tareas; el servidor confirmará la asignación al guardar.</p> : null}
					<form
						key={editing?.id ?? "new"}
						className="manage-form"
						onSubmit={async (e) => {
							e.preventDefault();
							const form = e.currentTarget,
								fd = Object.fromEntries(new FormData(form));
							if (
								await state.save({
									...fd,
									action: "save",
									...(editing
										? { id: editing.id, revision: editing.revision }
										: {}),
									contract_id: contractId,
									crew_id: crewId,
									title,
									tasks,
									scheduled_at: new Date(String(fd.scheduled_at)).toISOString(),
								})
							) {
								reset();
								form.reset();
							}
						}}
					>
						<fieldset disabled={state.busy}>
							<div className="manage-grid">
								<label>
									Cliente, localidad y contrato *
									<select
										required
										value={contractId}
										onChange={(e) => {
											setContractId(e.target.value);
											const ct = contracts.find((c) => c.id === e.target.value);
											setTitle(ct?.service ?? "");
											setPlannedMinutes(String(ct?.estimated_minutes ?? 60));
											setTasks([freshTask()]);
										}}
									>
										<option value="">Selecciona...</option>
										{contracts
											.filter((ct) => !ct.deleted_at && ct.status === "active")
											.map((ct) => (
												<option key={ct.id} value={ct.id}>
													{ct.customer_name} · {ct.property_name} [
													{ct.property_code}] · {ct.service}
												</option>
											))}
									</select>
								</label>
								<label>
									Cuadrilla *
									<select
										required
										value={crewId}
										onChange={(e) => {
											setCrewId(e.target.value);
											setTasks(tasks.map((t) => ({ ...t, employee_id: null })));
										}}
									>
										<option value="">Selecciona...</option>
										{workforce?.crews.map((ct) => (
											<option key={ct.id} value={ct.id}>
												{ct.name} ·{" "}
												{ct.members.length
													? `${ct.members.length} personas`
													: "personal por identificar"}
											</option>
										))}
									</select>
								</label>
								<label className="field-wide">
									Trabajo a realizar *
									<input
										required
										maxLength={500}
										value={title}
										onChange={(e) => setTitle(e.target.value)}
									/>
								</label>
								<label>
									Fecha y hora del dispositivo *
									<input
										name="scheduled_at"
										type="datetime-local"
										required
										value={scheduled}
										onChange={(e) => setScheduled(e.target.value)}
									/>
								</label>
								<label>
									Duración prevista en el lugar (min)
									<input
										name="planned_minutes"
										key={editing?.id ?? contractId}
										type="number"
										required
										min="1"
										max="1440"
										value={plannedMinutes}
										onChange={(e) => setPlannedMinutes(e.target.value)}
									/>
								</label>
								<label>
									Traslado previo previsto (min)
									<input
										name="travel_minutes"
										type="number"
										required
										min="0"
										max="1440"
										value={travelMinutes}
										onChange={(e) => setTravelMinutes(e.target.value)}
									/>
								</label>
								<label>
									Posición en las paradas (opcional)
									<input
										name="route_order"
										type="number"
										min="1"
										max="1000"
										defaultValue={editing?.route_order ?? ""}
									/>
								</label>
							</div>
							<p>
								La posición se asigna al final de las paradas del día si se deja
								vacía. La ruta aún no se optimiza por carreteras. Turnos y
								reportes usan America/New_York.
							</p>
							{crew ? (
								<div className="assignment-preview">
									<h3>
										{crew.name} · {crew.shift_start}–{crew.shift_end}
									</h3>
									<div className="crew-chips">
										{people.map((p) => (
											<span key={p.employee_id}>
												{p.name} · {c.label("employee_role", p.duty)}
											</span>
										))}
									</div>
									{preview ? <div aria-live="polite"><h4>Jornada prevista al guardar · {planningDay(previewDate)}</h4><CapacitySummary value={preview} /><p>Vista previa orientativa. Al guardar se comprueban otra vez el turno, las personas y los cruces con las asignaciones vigentes.</p></div> : <p>Selecciona fecha y hora para ver la carga de esta cuadrilla antes de guardar.</p>}
									{!people.length ? (
										<p>
											Esta cuadrilla necesita empleados identificados antes de
											programar.
										</p>
									) : null}
									<p>
										Costo laboral de referencia por hora de cuadrilla:{" "}
										<strong>
											{known ? usd(hourly) : "Pendiente de tarifas"}
										</strong>
										. Otros recursos y sus consumos se detallan en Costos.
									</p>
								</div>
							) : null}
							<div className="manage-actions">
								<h3>Tareas y responsables</h3>
								<button
									type="button"
									onClick={() => setTasks([...tasks, freshTask()])}
								>
									＋ Añadir tarea
								</button>
							</div>
							{tasks.map((task, index) => (
								<div className="task-planner" key={task.id ?? task.clientKey}>
									<span className="task-number">{index + 1}</span>
									<div className="manage-grid">
										<label htmlFor={`service-${task.clientKey ?? task.id}`}>
											Servicio *
											<CatalogSelect
												id={`service-${task.clientKey ?? task.id}`}
												category="service"
												name={`service-${index}`}
												value={task.service_key}
												onChange={(service_key) =>
													updateTask(index, { service_key })
												}
												required
											/>
										</label>
										<label>
											Elemento del inventario
											<select
												value={task.element_id ?? ""}
												onChange={(e) => {
													const item = inventory.find(
														(x) => x.id === e.target.value,
													);
													updateTask(index, {
														element_id: item?.id ?? null,
														...(item
															? {
																	quantity: Number(item.quantity),
																	unit: item.unit,
																	service_key: item.service,
																	description: item.name,
																}
															: {}),
													});
												}}
											>
												<option value="">
													Trabajo general en la localidad
												</option>
												{inventory.map((element) => (
													<option key={element.id} value={element.id}>
														{element.name}
													</option>
												))}
											</select>
										</label>
										<label className="field-wide">
											Instrucción concreta *
											<input
												required
												value={task.description}
												maxLength={500}
												onChange={(e) =>
													updateTask(index, { description: e.target.value })
												}
											/>
										</label>
										<label>
											Cantidad prevista
											<input
												type="number"
												min="0.001"
												max="1000000"
												step={task.unit === "each" ? "1" : "0.001"}
												required
												value={task.quantity}
												onChange={(e) =>
													updateTask(index, {
														quantity: Number(e.target.value),
													})
												}
											/>
										</label>
										<label htmlFor={`unit-${task.clientKey ?? task.id}`}>
											Unidad
											<CatalogSelect
												id={`unit-${task.clientKey ?? task.id}`}
												category="element_unit"
												name={`unit-${index}`}
												value={task.unit}
												onChange={(unit) => updateTask(index, { unit })}
												required
											/>
										</label>
										<label>
											Responsable
											<select
												value={task.employee_id ?? ""}
												onChange={(e) =>
													updateTask(index, {
														employee_id: e.target.value || null,
													})
												}
											>
												<option value="">Toda la cuadrilla</option>
												{people.map((person) => (
													<option
														key={person.employee_id}
														value={person.employee_id}
													>
														{person.name}
													</option>
												))}
											</select>
										</label>
									</div>
									{tasks.length > 1 ? (
										<button
											type="button"
											className="quiet-button"
											onClick={() =>
												setTasks(tasks.filter((_, i) => i !== index))
											}
										>
											Retirar tarea
										</button>
									) : null}
								</div>
							))}
							<div className="manage-actions">
								<button type="submit">
									{editing ? "Guardar reprogramación" : "Programar visita"}
								</button>
								{editing ? (
									<button
										className="quiet-button"
										type="button"
										onClick={reset}
									>
										Cancelar edición
									</button>
								) : null}
							</div>
						</fieldset>
					</form>
				</section>
			) : null}
			<div className="manage-actions">
				<h2>Visitas y ejecución</h2>
				<label>
					Estado
					<select value={filter} onChange={(e) => setFilter(e.target.value)}>
						<option value="">Todos</option>
						{Object.entries(statusLabels).map(([key, label]) => (
							<option key={key} value={key}>
								{label}
							</option>
						))}
					</select>
				</label>
			</div>
			<PagedCollection
				label="Visitas y ejecución"
				defaultSize={2}
				className="visit-grid"
			>
				{state.data
					?.filter((v) => !filter || v.status === filter)
					.map((v) => (
						<article className="panel visit-card" key={v.id}>
							<div className="manage-actions">
								<span className={`status-tag ${v.status}`}>
									{statusLabels[v.status]}
								</span>
								<span className="visit-code">Parada {v.route_order}</span>
							</div>
							<p className="eyebrow">{v.customer_name}</p>
							<h3>{v.property_name}</h3>
							<p>
								{v.property_code} · {v.city}
							</p>
							<h4>{v.title || "Trabajo del contrato"}</h4>
							<p>
								{new Date(v.scheduled_at).toLocaleString("es", {
									timeZone: "America/New_York",
								})}{" "}
								· {v.planned_minutes} min previstos
							</p>
							<p>
								<strong>{v.crew_name}</strong>
							</p>
							<div className="crew-chips">
								{v.personnel.map((p) => (
									<span key={p.employee_id}>{p.name_snapshot}</span>
								))}
							</div>
							{!v.personnel.length ? (
								<p className="muted">Personal histórico sin identificar</p>
							) : null}
							<ul className="visit-task-list">
								{v.tasks.map((t) => (
									<li key={t.id ?? t.clientKey}>
										<strong>{t.description}</strong>
										<span>
											{c.label("service", t.service_key)} ·{" "}
											{t.completed_quantity ?? t.quantity}{" "}
											{c.label("element_unit", t.unit)} ·{" "}
											{t.employee_id
												? v.personnel.find(
														(p) => p.employee_id === t.employee_id,
													)?.name_snapshot
												: "Toda la cuadrilla"}
											{t.status === "blocked" ? " · Bloqueada" : ""}
										</span>
									</li>
								))}
							</ul>
							{v.cancellation_reason ? (
								<p className="notice">Motivo: {v.cancellation_reason}</p>
							) : null}
							{v.notes ? <p>{v.notes}</p> : null}
							{v.assignment_review_required ? (
								<p className="notice" role="status">
									Reasignación pendiente: {v.assignment_review_reason}
								</p>
							) : null}
							<div className="manage-actions">
								{v.status === "scheduled" ? (
									<>
										<button
											type="button"
											onClick={() => editVisit(v)}
											disabled={state.busy || !canUpdate}
										>
											Editar visita
										</button>
										<button
											type="button"
											disabled={
												state.busy ||
												!canExecute ||
												v.assignment_review_required
											}
											onClick={() =>
												void state.save({
													action: "start",
													id: v.id,
													revision: v.revision,
												})
											}
										>
											Iniciar visita
										</button>
									</>
								) : (
									<button
										type="button"
										className="quiet-button"
										onClick={() => {
											const notes = window.prompt(
												"Corregir observaciones del registro:",
												v.notes,
											);
											if (notes === null) return;
											const reason = window.prompt(
												"Motivo de la corrección (mínimo 5 caracteres):",
											);
											if (reason)
												void state.save({
													action: "note",
													id: v.id,
													revision: v.revision,
													notes,
													reason,
												});
										}}
										disabled={state.busy || !canExecute}
									>
										Editar registro
									</button>
								)}
								{v.status === "started" ? (
									<button
										type="button"
										onClick={() => setExecution({ visit: v, cancel: false })}
										disabled={state.busy || !canExecute}
									>
										Finalizar ejecución
									</button>
								) : null}
								{v.status === "scheduled" ? (
									<button
										type="button"
										className="quiet-button"
										disabled={state.busy || !canExecute}
										onClick={() => {
											const reason = window.prompt(
												"Motivo de cancelación (mínimo 5 caracteres):",
											);
											if (reason)
												void state.save({
													action: "cancel",
													id: v.id,
													revision: v.revision,
													reason,
												});
										}}
									>
										Cancelar visita
									</button>
								) : v.status === "started" ? (
									<button
										type="button"
										className="quiet-button"
										onClick={() => setExecution({ visit: v, cancel: true })}
										disabled={state.busy || !canExecute}
									>
										Cancelar visita
									</button>
								) : null}
								{canCosts ? (
									<a className="button-link" href={`/costos?visit_id=${v.id}`}>
										Detalle de costos
									</a>
								) : null}
								<button
									type="button"
									className="quiet-button"
									disabled={state.busy || !canDelete}
									onClick={() => {
										if (
											!window.confirm(
												"La visita se retirará de la agenda activa. Los trabajos y costos ya registrados se conservan en los informes históricos.",
											)
										)
											return;
										const reason = window.prompt(
											"Motivo de la baja (mínimo 5 caracteres):",
										);
										if (reason)
											void state.save({
												action: "delete",
												id: v.id,
												revision: v.revision,
												reason,
											});
									}}
								>
									Eliminar de agenda
								</button>
							</div>
						</article>
					))}
			</PagedCollection>
			{state.data?.length === 0 ? (
				<p>
					No hay visitas registradas. Crea empleados, integra una cuadrilla y
					programa su trabajo.
				</p>
			) : null}
		</div>
	);
}
