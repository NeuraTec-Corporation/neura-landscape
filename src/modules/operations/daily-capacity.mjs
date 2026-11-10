export const planningZone = "America/New_York";
export function planningDay(value) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("sv-SE", { timeZone: planningZone });
}
const minute = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const span = (v) => ({ start: Date.parse(v.scheduled_at) - (Number(v.travel_minutes) || 0) * 60000, end: Date.parse(v.scheduled_at) + (Number(v.planned_minutes) || 0) * 60000 });
const active = (v) => !v.deleted_at && ["scheduled", "started", "completed"].includes(v.status);
const people = (v, crews) => v.personnel?.length ? v.personnel.map((p) => p.employee_id) : (crews.find((c) => c.id === v.crew_id)?.members ?? []).map((p) => p.employee_id);
function outside(v, crew) {
	const start = new Date(v.scheduled_at);
	if (Number.isNaN(start.getTime())) return true;
	const time = start.toLocaleTimeString("en-GB", { timeZone: planningZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
	return minute(time) - Number(v.travel_minutes || 0) < minute(crew.shift_start) || minute(time) + Number(v.planned_minutes || 0) > minute(crew.shift_end);
}
/** Read-only planning aid; the existing saveVisit transaction remains authoritative. */
export function dailyCapacity(crews, visits, day, candidate) {
	const all = visits.filter((v) => active(v) && (!candidate || v.id !== candidate.id));
	if (candidate) all.push(candidate);
	return crews.map((crew) => {
		const members = crew.members.filter((p) => p.status === "active");
		const assigned = all.filter((v) => v.crew_id === crew.id && planningDay(v.scheduled_at) === day);
		const work = assigned.reduce((n, v) => n + Number(v.planned_minutes || 0), 0);
		const travel = assigned.reduce((n, v) => n + Number(v.travel_minutes || 0), 0);
		const capacity = Math.max(0, minute(crew.shift_end) - minute(crew.shift_start) - Number(crew.break_minutes));
		const collisions = new Set();
		for (const v of assigned.filter((v) => v.status !== "completed")) {
			const a = span(v), ids = new Set(people(v, crews));
			for (const other of all) {
				if (other.id === v.id || other.status === "completed") continue;
				const b = span(other);
				if (a.start < b.end && b.start < a.end && (v.crew_id === other.crew_id || people(other, crews).some((id) => ids.has(id)))) collisions.add(v.id);
			}
		}
		const warnings = [];
		if (!members.length || members.length !== crew.members.length) warnings.push("Personal incompleto o inactivo: revisa los integrantes.");
		if (!capacity) warnings.push("El turno no tiene capacidad disponible.");
		if (work + travel > capacity) warnings.push(`Sobrecarga de ${work + travel - capacity} min. Cambia fecha o cuadrilla.`);
		if (collisions.size) warnings.push(`${collisions.size} visita(s) con cruce de cuadrilla o personal.`);
		const beyond = assigned.filter((v) => outside(v, crew)).length;
		if (beyond) warnings.push(`${beyond} visita(s) fuera del turno, incluido el traslado previo.`);
		const unknown = assigned.filter((v) => !Number.isFinite(Number(v.planned_minutes)) || Number(v.planned_minutes) <= 0).length;
		if (unknown) warnings.push(`${unknown} visita(s) sin duración prevista: carga incompleta.`);
		const review = assigned.filter((v) => v.assignment_review_required).length;
		if (review) warnings.push(`${review} visita(s) requieren confirmar la reasignación.`);
		return { id: crew.id, name: crew.name, capacity, work, travel, reserved: work + travel, remaining: Math.max(0, capacity - work - travel), utilization: capacity ? Math.round((work + travel) / capacity * 100) : 0, activeMembers: members.length, visits: assigned.length, review, warnings };
	});
}
