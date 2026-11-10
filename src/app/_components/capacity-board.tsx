"use client";
import "./capacity-board.css";
import { useState } from "react";
import { dailyCapacity, planningDay, type DailyCapacity } from "@/modules/operations/daily-capacity.mjs";
import type { Workforce } from "./workforce-workspace";
import type { Visit } from "./visits-workspace";
import { PagedCollection } from "./paged-collection";
export function CapacitySummary({ value }: { value: DailyCapacity }) {
	return <>
		<div className="capacity-numbers"><span><strong>{value.visits}</strong> visitas</span><span><strong>{value.reserved}</strong> min reservados</span><span><strong>{value.remaining}</strong> min libres</span></div>
		<progress aria-label={`Carga de ${value.name}: ${value.utilization}%`} max={Math.max(value.capacity, value.reserved, 1)} value={value.reserved} />
		<p>{value.work} min de servicio + {value.travel} de traslado / {value.capacity} disponibles · {value.utilization}%</p>
		{value.warnings.length ? <ul className="capacity-alerts">{value.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p className="capacity-clear">Sin conflictos detectados con los datos registrados.</p>}
	</>;
}
export function CapacityBoard({ workforce, visits, busy, canEdit, onEdit }: { workforce: Workforce; visits: Visit[]; busy: boolean; canEdit: boolean; onEdit: (visit: Visit) => void }) {
	const [day, setDay] = useState(() => planningDay(new Date()));
	const rows = dailyCapacity(workforce.crews, visits, day);
	const pending = visits.filter((v) => v.status === "scheduled" && v.assignment_review_required);
	return <section className="panel capacity-board" aria-label="Capacidad diaria y reasignaciones">
		<div className="manage-actions"><div><p className="eyebrow">PLANIFICACIÓN DE JORNADA</p><h2>Personas, tiempo y asignaciones</h2></div><label>Día de trabajo · New York<input type="date" value={day} onChange={(e) => setDay(e.target.value)} required /></label></div>
		<p>Disponible = turno menos descanso. Reservado = servicio y traslado previo previstos. El número de personas no reduce automáticamente la duración; los traslados se ingresan manualmente.</p>
		<PagedCollection label="Capacidad de cuadrillas" className="capacity-grid">{rows.map((row) => { const crew = workforce.crews.find((c) => c.id === row.id); return <article className="capacity-card" key={row.id}>
			<div className="manage-actions"><h3>{row.name}</h3><span className={`status-tag ${row.warnings.length ? "started" : "completed"}`}>{row.warnings.length ? "Revisar" : "Sin alertas"}</span></div>
			<p>{crew?.shift_start}–{crew?.shift_end} · {crew?.break_minutes} min de descanso · {row.activeMembers} personas activas</p>
			<div className="crew-chips">{crew?.members.map((p) => <span key={p.employee_id}>{p.name} · {p.duty} {p.status !== "active" ? "· inactivo" : ""}</span>)}</div>
			<CapacitySummary value={row} />
		</article>; })}</PagedCollection>
		{!rows.length ? <p>No hay cuadrillas operativas. Crea una cuadrilla y asigna empleados para programar.</p> : null}
		{pending.length ? <div className="capacity-pending"><h3>{pending.length} visitas pendientes de reasignar · todas las fechas</h3><p>Elige una visita para revisar cuadrilla, hora y responsables. La asignación solo cambia al guardar; no se cancelan visitas ni se descartan tareas.</p>
			<PagedCollection label="Reasignaciones pendientes">{pending.map((v) => <article className="capacity-pending-row" key={v.id} data-search={`${v.customer_name} ${v.property_name} ${v.property_code} ${v.crew_name}`}><div><strong>{v.customer_name} · {v.property_name}</strong><p>{new Date(v.scheduled_at).toLocaleString("es-US", { timeZone: "America/New_York" })} · {v.crew_name}</p><p>{v.assignment_review_reason}</p></div><button type="button" disabled={busy || !canEdit} onClick={() => onEdit(v)}>Revisar asignación</button></article>)}</PagedCollection>
		</div> : <p className="capacity-clear">No hay reasignaciones pendientes.</p>}
	</section>;
}
