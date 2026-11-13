import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parse, ManageError, text, revision, audit, money } from "./manage.mjs";
import { requireOption } from "./catalog.mjs";
import { fitsAccess, accessWindow } from "./access-window.mjs";
import { resourceCostState } from "./resources.mjs";
const task = z.object({
	service_key: text,
	description: text,
	element_id: z.string().min(1).nullable().optional(),
	employee_id: z.string().uuid().nullable().optional(),
	quantity: z.coerce.number().positive().max(1e6),
	unit: text,
});
const schema = z.object({
	id: z.string().min(1).optional(),
	revision,
	contract_id: z.string().min(1),
	crew_id: z.string().min(1),
	scheduled_at: z.string().datetime({ offset: true }),
	title: text,
	reschedule_reason: z.string().trim().max(500).optional(),
	planned_minutes: z.coerce.number().int().min(1).max(1440),
	travel_minutes: z.coerce.number().int().min(0).max(1440),
	route_order: z.preprocess(
		(v) => (v === "" ? undefined : v),
		z.coerce.number().int().min(1).max(1000).optional(),
	),
	tasks: z.array(task).min(1, "Añade al menos una tarea concreta.").max(100),
});
export async function visitList(db) {
	return db.transaction(async (tx) => {
		const rows = (
			await tx.query(
				"SELECT v.*,p.name property_name,p.code property_code,p.city,p.region,p.service_hours,p.status property_status,c.status contract_status,c.effective_from::text effective_from,c.effective_until::text effective_until,p.id property_id,p.customer_id,u.name customer_name,c.service,k.name crew_name,coalesce((SELECT json_agg(t ORDER BY t.id) FROM visit_tasks t WHERE t.visit_id=v.id),'[]'::json) tasks,coalesce((SELECT json_agg(pn ORDER BY pn.name_snapshot) FROM visit_personnel pn WHERE pn.visit_id=v.id),'[]'::json) personnel,coalesce((SELECT json_agg(cl ORDER BY cl.id) FROM visit_cost_lines cl WHERE cl.visit_id=v.id),'[]'::json) cost_lines FROM visits v JOIN contracts c ON c.id=v.contract_id JOIN properties p ON p.id=c.property_id JOIN customers u ON u.id=p.customer_id JOIN crews k ON k.id=v.crew_id WHERE v.deleted_at IS NULL ORDER BY v.scheduled_at,v.route_order",
			)
		).rows;
		return rows;
	});
}
export async function saveVisit(db, input) {
	const v = parse(schema, input),
		id = v.id || randomUUID();
	return db.transaction(async (tx) => {
		const crew = (
			await tx.query(
				"SELECT * FROM crews WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
				[v.crew_id],
			)
		).rows[0];
		if (!crew) throw new ManageError("Selecciona una cuadrilla disponible.");
		const contract = (
			await tx.query(
				"SELECT c.*,c.effective_from::text effective_from,c.effective_until::text effective_until,p.deleted_at property_deleted,p.service_hours FROM contracts c JOIN properties p ON p.id=c.property_id WHERE c.id=$1 FOR UPDATE OF c,p",
				[v.contract_id],
			)
		).rows[0];
		if (
			!contract ||
			contract.deleted_at ||
			contract.property_deleted ||
			contract.status !== "active"
		)
			throw new ManageError("Selecciona un contrato activo.");
		const serviceDay = new Date(v.scheduled_at).toLocaleDateString("sv-SE", {
			timeZone: "America/New_York",
		});
		if (
			(contract.effective_from && serviceDay < contract.effective_from) ||
			(contract.effective_until && serviceDay > contract.effective_until)
		)
			throw new ManageError(
				"La visita debe estar dentro de la vigencia del contrato.",
			);
		if (v.reschedule_reason && !accessWindow(contract.service_hours)) throw new ManageError("Confirma un intervalo de acceso válido antes de aplicar la alternativa.");
		if (accessWindow(contract.service_hours) && !fitsAccess(v.scheduled_at,v.planned_minutes,contract.service_hours)) throw new ManageError("La visita debe caber en el horario de acceso de la localidad.",422,{scheduled_at:"Fuera del horario de acceso."});
		const old = v.id
			? (await tx.query("SELECT * FROM visits WHERE id=$1 FOR UPDATE", [id]))
					.rows[0]
			: null;
		if (v.id && (!old || old.deleted_at || old.revision !== v.revision))
			throw new ManageError("La visita cambió. Recarga.", 409);
		if (old && old.status !== "scheduled")
			throw new ManageError(
				"Solo se reprograman visitas pendientes. Las realizadas conservan su historial.",
			);
		const previousPlan = old
			? {
					visit: old,
					tasks: (
						await tx.query("SELECT * FROM visit_tasks WHERE visit_id=$1", [id])
					).rows,
					personnel: (
						await tx.query("SELECT * FROM visit_personnel WHERE visit_id=$1", [
							id,
						])
					).rows,
				}
			: null;
		if (
			old &&
			old.contract_id !== v.contract_id &&
			(
				await tx.query(
					"SELECT id FROM visit_cost_lines WHERE visit_id=$1 LIMIT 1",
					[id],
				)
			).rows.length
		)
			throw new ManageError(
				"Esta visita ya tiene costos. Conserva su contrato y crea otra visita para un contrato diferente.",
			);
		const people = (
			await tx.query(
				"SELECT e.*,m.duty FROM crew_employees m JOIN employees e ON e.id=m.employee_id WHERE m.crew_id=$1 AND e.status='active' AND e.deleted_at IS NULL ORDER BY e.id FOR UPDATE OF e",
				[v.crew_id],
			)
		).rows;
		const memberCount = Number(
			(
				await tx.query(
					"SELECT count(*)::int n FROM crew_employees WHERE crew_id=$1",
					[v.crew_id],
				)
			).rows[0].n,
		);
		if (!people.length || people.length !== memberCount)
			throw new ManageError(
				"Identifica y activa a todos los integrantes de la cuadrilla antes de programar.",
			);
		const begin = new Date(v.scheduled_at).getTime() - v.travel_minutes * 60000,
			end = new Date(v.scheduled_at).getTime() + v.planned_minutes * 60000;
		const collisions = await tx.query(
			"SELECT v.id FROM visits v WHERE v.id<>$1 AND v.deleted_at IS NULL AND v.status IN ('scheduled','started') AND (v.contract_id=$6 OR v.crew_id=$2 OR EXISTS(SELECT 1 FROM visit_personnel p WHERE p.visit_id=v.id AND p.employee_id=ANY($5::text[]))) AND v.scheduled_at-coalesce(v.travel_minutes,0)*interval '1 minute'<$4::timestamptz AND v.scheduled_at+coalesce(v.planned_minutes,1)*interval '1 minute'>$3::timestamptz LIMIT 1",
			[
				id,
				v.crew_id,
				new Date(begin).toISOString(),
				new Date(end).toISOString(),
				people.map((p) => p.id),
				v.contract_id,
			],
		);
		if (collisions.rows.length)
			throw new ManageError(
				"La cuadrilla o uno de sus empleados ya está asignado en ese horario.",
				409,
				{ scheduled_at: "Hay una asignación superpuesta." },
			);
		const day = new Date(v.scheduled_at).toLocaleDateString("sv-SE", {
			timeZone: "America/New_York",
		});
		const daily = Number(
			(
				await tx.query(
					"SELECT coalesce(sum(coalesce(planned_minutes,0)+travel_minutes),0)::int n FROM visits WHERE crew_id=$1 AND id<>$2 AND deleted_at IS NULL AND status IN ('scheduled','started','completed') AND to_char(scheduled_at AT TIME ZONE 'America/New_York','YYYY-MM-DD')=$3",
					[v.crew_id, id, day],
				)
			).rows[0].n,
		);
		const minute = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
		const capacity =
			minute(crew.shift_end) - minute(crew.shift_start) - crew.break_minutes;
		const localTime = new Date(v.scheduled_at).toLocaleTimeString("en-GB", {
			timeZone: "America/New_York",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		});
		if (
			minute(localTime) - v.travel_minutes < minute(crew.shift_start) ||
			minute(localTime) + v.planned_minutes > minute(crew.shift_end)
		)
			throw new ManageError(
				"La visita y su traslado deben caber dentro del turno de la cuadrilla.",
			);
		if (daily + v.planned_minutes + v.travel_minutes > capacity)
			throw new ManageError(
				`La jornada excede la capacidad de ${capacity} minutos de esa cuadrilla. Reasigna o cambia la fecha.`,
				409,
			);
		for (const t of v.tasks) {
			await requireOption(tx, "service", t.service_key);
			await requireOption(tx, "element_unit", t.unit);
			if (t.unit === "each" && !Number.isInteger(t.quantity))
				throw new ManageError("Las cantidades en unidades deben ser enteras.");
			if (t.employee_id && !people.some((p) => p.id === t.employee_id))
				throw new ManageError("El responsable debe pertenecer a la cuadrilla.");
			if (
				t.element_id &&
				!(
					await tx.query(
						"SELECT id FROM property_elements WHERE id=$1 AND property_id=$2 AND deleted_at IS NULL",
						[t.element_id, contract.property_id],
					)
				).rows.length
			)
				throw new ManageError(
					"El elemento debe pertenecer a la localidad del contrato.",
				);
		}
		const hourly = people.every((p) => p.hourly_cents !== null)
			? people.reduce((sum, p) => sum + p.hourly_cents, 0)
			: null;
		const order =
			v.route_order ||
			Number(
				(
					await tx.query(
						"SELECT coalesce(max(route_order),0)+1 n FROM visits WHERE crew_id=$1 AND deleted_at IS NULL AND to_char(scheduled_at AT TIME ZONE 'America/New_York','YYYY-MM-DD')=$2",
						[v.crew_id, day],
					)
				).rows[0].n,
			);
		const vals = [
			id,
			v.contract_id,
			v.crew_id,
			v.scheduled_at,
			order,
			v.title,
			v.planned_minutes,
			v.travel_minutes,
			v.tasks[0].service_key,
			Math.round(contract.monthly_cents / contract.visits_per_month),
			hourly,
		];
		if (v.id)
			await tx.query(
				"UPDATE visits SET contract_id=$2,crew_id=$3,scheduled_at=$4,route_order=$5,title=$6,planned_minutes=$7,travel_minutes=$8,service_key=$9,planned_revenue_cents=$10,planned_labor_hourly_cents=$11,assignment_review_required=false,assignment_review_reason='',revision=revision+1 WHERE id=$1",
				vals,
			);
		else
			await tx.query(
				"INSERT INTO visits(id,contract_id,crew_id,scheduled_at,route_order,title,planned_minutes,travel_minutes,service_key,planned_revenue_cents,planned_labor_hourly_cents) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
				vals,
			);
		await tx.query("DELETE FROM visit_tasks WHERE visit_id=$1", [id]);
		await tx.query("DELETE FROM visit_personnel WHERE visit_id=$1", [id]);
		for (const p of people)
			await tx.query(
				"INSERT INTO visit_personnel(visit_id,employee_id,name_snapshot,duty,hourly_cents) VALUES($1,$2,$3,$4,$5)",
				[id, p.id, `${p.first_name} ${p.last_name}`, p.duty, p.hourly_cents],
			);
		for (const t of v.tasks)
			await tx.query(
				"INSERT INTO visit_tasks(id,visit_id,service_key,description,element_id,employee_id,quantity,unit) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
				[
					randomUUID(),
					id,
					t.service_key,
					t.description,
					t.element_id || null,
					t.employee_id || null,
					t.quantity,
					t.unit,
				],
			);
		await audit(tx, "visit", id, v.id ? "rescheduled" : "scheduled", {
			before: previousPlan,
			after: v,
		});
		return { id };
	});
}
export async function changeVisit(db, input) {
	const v = parse(
		z.object({
			id: z.string().min(1),
			revision: z.number().int().positive(),
			action: z.enum(["start", "cancel", "delete", "note"]),
			reason: z.string().trim().max(2000).default(""),
			notes: z.string().trim().max(3000).default(""),
			legacy_minutes: z.coerce.number().int().min(0).max(1440).optional(),
			personnel: z
				.array(
					z.object({
						employee_id: z.string(),
						actual_minutes: z.coerce.number().int().min(0).max(1440),
					}),
				)
				.max(100)
				.optional(),
			tasks: z
				.array(
					z.object({
						id: z.string(),
						completed_quantity: z.coerce.number().min(0).max(1e6),
					}),
				)
				.max(100)
				.optional(),
		}),
		input,
	);
	return db.transaction(async (tx) => {
		const row = (
			await tx.query("SELECT * FROM visits WHERE id=$1 FOR UPDATE", [v.id])
		).rows[0];
		if (!row || row.deleted_at || row.revision !== v.revision)
			throw new ManageError("La visita cambió. Recarga.", 409);
		if (v.action === "start") {
			if (row.assignment_review_required)
				throw new ManageError(
					"Revisa y guarda una cuadrilla propia antes de iniciar esta visita.",
				);
			if (row.status !== "scheduled")
				throw new ManageError("La visita debe estar programada.");
			const crew = (
					await tx.query("SELECT deleted_at FROM crews WHERE id=$1", [
						row.crew_id,
					])
				).rows[0],
				contract = (
					await tx.query(
						"SELECT status,deleted_at,effective_from::text,effective_until::text FROM contracts WHERE id=$1",
						[row.contract_id],
					)
				).rows[0];
			if (
				crew?.deleted_at ||
				contract?.deleted_at ||
				contract?.status !== "active"
			)
				throw new ManageError(
					"Revisa el contrato y la cuadrilla antes de iniciar.",
				);
			const actualDay = new Date().toLocaleDateString("sv-SE", {
				timeZone: "America/New_York",
			});
			if (
				(contract.effective_from && actualDay < contract.effective_from) ||
				(contract.effective_until && actualDay > contract.effective_until)
			)
				throw new ManageError(
					"La visita debe iniciarse dentro de la vigencia del contrato.",
				);
			const staff = (
				await tx.query(
					"SELECT p.employee_id FROM visit_personnel p JOIN employees e ON e.id=p.employee_id JOIN crew_employees m ON m.employee_id=e.id AND m.crew_id=$2 WHERE p.visit_id=$1 AND e.status='active' AND e.deleted_at IS NULL",
					[v.id, row.crew_id],
				)
			).rows;
			const planned = Number(
				(
					await tx.query(
						"SELECT count(*)::int n FROM visit_personnel WHERE visit_id=$1",
						[v.id],
					)
				).rows[0].n,
			);
			if (!staff.length || staff.length !== planned)
				throw new ManageError(
					"Edita la asignación e identifica a sus personas antes de iniciar.",
				);
			await tx.query(
				"UPDATE visits SET status='started',started_at=now(),revision=revision+1 WHERE id=$1",
				[v.id],
			);
		} else {
			if (v.reason.length < 5)
				throw new ManageError("Explica el motivo de la corrección o baja.");
			if (v.action === "note")
				await tx.query(
					"UPDATE visits SET notes=$2,revision=revision+1 WHERE id=$1",
					[v.id, v.notes],
				);
			else if (v.action === "delete") {
				if (row.status === "started")
					throw new ManageError(
						"Cancela primero la visita en ejecución y registra el trabajo realizado.",
					);
				await tx.query(
					"UPDATE visits SET deleted_at=now(),revision=revision+1 WHERE id=$1",
					[v.id],
				);
			} else {
				if (row.status === "completed")
					throw new ManageError(
						"La visita realizada se conserva. Corrige su registro o sus costos.",
					);
				if (row.status === "cancelled")
					throw new ManageError("La visita ya está cancelada.");
				if (row.status === "started") {
					const people = (
							await tx.query(
								"SELECT * FROM visit_personnel WHERE visit_id=$1",
								[v.id],
							)
						).rows,
						tasks = (
							await tx.query("SELECT * FROM visit_tasks WHERE visit_id=$1", [
								v.id,
							])
						).rows;
					let labor = 0,
						known = true,
						actual = 0;
					if (people.length) {
						if (
							!v.personnel ||
							v.personnel.length !== people.length ||
							new Set(v.personnel.map((p) => p.employee_id)).size !==
								people.length
						)
							throw new ManageError(
								"Registra los minutos consumidos por cada persona; usa cero si se inició por error.",
							);
						for (const p of people) {
							const entry = v.personnel.find(
								(e) => e.employee_id === p.employee_id,
							);
							if (!entry)
								throw new ManageError("Revisa el personal de la visita.");
							actual = Math.max(actual, entry.actual_minutes);
							if (p.hourly_cents === null && entry.actual_minutes > 0)
								known = false;
							else
								labor += Math.round(
									(entry.actual_minutes / 60) * Number(p.hourly_cents || 0),
								);
							await tx.query(
								"UPDATE visit_personnel SET actual_minutes=$3 WHERE visit_id=$1 AND employee_id=$2",
								[v.id, p.employee_id, entry.actual_minutes],
							);
						}
					} else {
						if (v.legacy_minutes === undefined)
							throw new ManageError(
								"Indica los minutos consumidos por la cuadrilla histórica.",
							);
						actual = v.legacy_minutes;
						known = actual === 0 || row.planned_labor_hourly_cents !== null;
						labor = Math.round(
							(actual / 60) * Number(row.planned_labor_hourly_cents || 0),
						);
					}
					if (tasks.length) {
						if (
							!v.tasks ||
							v.tasks.length !== tasks.length ||
							new Set(v.tasks.map((t) => t.id)).size !== tasks.length
						)
							throw new ManageError(
								"Registra las cantidades realizadas antes de cancelar.",
							);
						for (const t of tasks) {
							const entry = v.tasks.find((x) => x.id === t.id);
							if (
								!entry ||
								(t.unit === "each" &&
									!Number.isInteger(entry.completed_quantity))
							)
								throw new ManageError("Revisa las cantidades de las tareas.");
							await tx.query(
								"UPDATE visit_tasks SET completed_quantity=$2,status='blocked',notes=$3 WHERE id=$1",
								[t.id, entry.completed_quantity, v.reason],
							);
						}
					}
					await tx.query(
						"UPDATE visits SET actual_minutes=$2,labor_cents=$3,cost_complete=$4,revenue_cents=0 WHERE id=$1",
						[v.id, actual || null, known ? labor : null, known && (await resourceCostState(tx,v.id)).complete],
					);
				}
				await tx.query(
					"UPDATE visits SET status='cancelled',cancelled_at=now(),cancellation_reason=$2,revision=revision+1 WHERE id=$1",
					[v.id, v.reason],
				);
			}
		}
		await tx.query("INSERT INTO activity(visit_id,event) VALUES($1,$2)", [
			v.id,
			v.action,
		]);
		await audit(tx, "visit", v.id, `${v.action}:${v.reason}`, {
			before: row,
			after: v,
		});
		return { id: v.id };
	});
}
export async function completeVisit(db, input) {
	const v = parse(
		z.object({
			id: z.string().min(1),
			revision: z.number().int().positive(),
			notes: z.string().trim().max(3000),
			legacy_minutes: z.coerce.number().int().min(1).max(1440).optional(),
			personnel: z
				.array(
					z.object({
						employee_id: z.string().min(1),
						actual_minutes: z.coerce.number().int().min(0).max(1440),
					}),
				)
				.max(100),
			tasks: z
				.array(
					z.object({
						id: z.string().min(1),
						completed_quantity: z.coerce.number().min(0).max(1e6),
						status: z.enum(["done", "blocked"]),
						notes: z.string().trim().max(1000),
					}),
				)
				.max(100),
		}),
		input,
	);
	return db.transaction(async (tx) => {
		const row = (
			await tx.query("SELECT * FROM visits WHERE id=$1 FOR UPDATE", [v.id])
		).rows[0];
		if (
			!row ||
			row.deleted_at ||
			row.status !== "started" ||
			row.revision !== v.revision
		)
			throw new ManageError(
				"La visita debe estar en ejecución y sin otra edición.",
				409,
			);
		const people = (
				await tx.query("SELECT * FROM visit_personnel WHERE visit_id=$1", [
					v.id,
				])
			).rows,
			tasks = (
				await tx.query("SELECT * FROM visit_tasks WHERE visit_id=$1", [v.id])
			).rows;
		if (
			v.personnel.length !== people.length ||
			new Set(v.personnel.map((p) => p.employee_id)).size !== people.length ||
			v.personnel.some(
				(p) => !people.some((s) => s.employee_id === p.employee_id),
			)
		)
			throw new ManageError(
				"Indica los minutos reales de cada integrante asignado.",
			);
		if (
			v.tasks.length !== tasks.length ||
			new Set(v.tasks.map((t) => t.id)).size !== tasks.length ||
			v.tasks.some((t) => !tasks.some((s) => s.id === t.id))
		)
			throw new ManageError("Revisa todas las tareas asignadas.");
		if (!people.length && v.legacy_minutes === undefined)
			throw new ManageError(
				"Indica los minutos reales de la cuadrilla histórica.",
			);
		if (people.length && !v.personnel.some((p) => p.actual_minutes > 0))
			throw new ManageError(
				"Registra tiempo trabajado o cancela si se inició por error.",
			);
		let labor = people.length
				? 0
				: Math.round(
						(Number(v.legacy_minutes) / 60) *
							Number(row.planned_labor_hourly_cents || 0),
					),
			known = people.length > 0 || row.planned_labor_hourly_cents !== null;
		for (const p of people) {
			const actual = v.personnel.find((s) => s.employee_id === p.employee_id);
			if (p.hourly_cents === null && actual.actual_minutes > 0) known = false;
			else labor += Math.round((actual.actual_minutes / 60) * p.hourly_cents);
			await tx.query(
				"UPDATE visit_personnel SET actual_minutes=$3 WHERE visit_id=$1 AND employee_id=$2",
				[v.id, p.employee_id, actual.actual_minutes],
			);
		}
		for (const t of v.tasks) {
			const original = tasks.find((x) => x.id === t.id);
			if (original.unit === "each" && !Number.isInteger(t.completed_quantity))
				throw new ManageError("Las unidades realizadas deben ser enteras.");
			if (t.status === "done" && t.completed_quantity <= 0)
				throw new ManageError(
					"Una tarea realizada debe tener una cantidad mayor que cero.",
				);
			if (t.status === "blocked" && !t.notes)
				throw new ManageError("Explica las tareas bloqueadas.");
			await tx.query(
				"UPDATE visit_tasks SET completed_quantity=$2,status=$3,notes=$4 WHERE id=$1",
				[t.id, t.completed_quantity, t.status, t.notes],
			);
		}
		const resourcesComplete = (await resourceCostState(tx,v.id)).complete;
		await tx.query(
			"UPDATE visits SET status='completed',completed_at=now(),actual_minutes=$2,labor_cents=$3,revenue_cents=planned_revenue_cents,cost_complete=$4,notes=$5,revision=revision+1 WHERE id=$1",
			[
				v.id,
				people.length
					? Math.max(...v.personnel.map((p) => p.actual_minutes))
					: v.legacy_minutes,
				known ? labor : null,
				known && resourcesComplete,
				v.notes,
			],
		);
		await tx.query(
			"INSERT INTO activity(visit_id,event) VALUES($1,'completed')",
			[v.id],
		);
		await audit(tx, "visit", v.id, "completed");
		return { id: v.id };
	});
}
export async function saveVisitCosts(db, input) {
	const v = parse(
		z.object({
			id: z.string().min(1),
			revision: z.number().int().positive(),
			reason: text,
			lines: z
				.array(
					z.object({
						category: z.enum(["materials", "equipment", "travel", "overhead"]),
						description: text,
						quantity: z.coerce.number().positive().max(1e6),
						unit_price: money,
					}),
				)
				.max(100),
			labor: z.union([z.literal(""), money]).optional(),
		}),
		input,
	);
	return db.transaction(async (tx) => {
		const row = (
			await tx.query(
				"SELECT * FROM visits WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
				[v.id],
			)
		).rows[0];
		if (!row || row.revision !== v.revision)
			throw new ManageError("La visita cambió. Recarga.", 409);
		const totals = { materials: 0, equipment: 0, travel: 0, overhead: 0 };
		const previousLines = (
			await tx.query("SELECT * FROM visit_cost_lines WHERE visit_id=$1", [v.id])
		).rows;
		await audit(tx, "visit_cost_lines", v.id, "replaced", {
			before: previousLines,
			after: v.lines,
		});
		await tx.query("DELETE FROM visit_cost_lines WHERE visit_id=$1", [v.id]);
		for (const line of v.lines) {
			const cents = Math.round(line.unit_price * 100),
				total = Math.round(line.quantity * cents);
			if (!Number.isSafeInteger(total) || total > 100000000)
				throw new ManageError("El costo excede el máximo permitido.");
			totals[line.category] += total;
			if (totals[line.category] > 100000000)
				throw new ManageError(
					"El total de la categoría supera el máximo permitido.",
				);
			await tx.query(
				"INSERT INTO visit_cost_lines VALUES($1,$2,$3,$4,$5,$6,$7)",
				[
					randomUUID(),
					v.id,
					line.category,
					line.description,
					line.quantity,
					cents,
					total,
				],
			);
		}
		const resourceState = await resourceCostState(tx,v.id);
		totals.materials += resourceState.totals.materials;
		totals.equipment += resourceState.totals.equipment;
		if(Object.values(totals).some(n=>n>100000000))throw new ManageError("El costo total supera el máximo permitido.");
		const labor =
			v.labor === undefined || v.labor === ""
				? row.labor_cents
				: Math.round(v.labor * 100);
		await tx.query(
			"UPDATE visits SET labor_cents=$2,materials_cents=$3,equipment_cents=$4,travel_cents=$5,overhead_cents=$6,cost_complete=$7,revision=revision+1 WHERE id=$1",
			[
				v.id,
				labor,
				totals.materials,
				totals.equipment,
				totals.travel,
				totals.overhead,
				labor !== null && resourceState.complete,
			],
		);
		await audit(tx, "visit_cost", v.id, `adjusted:${v.reason}`, {
			before: row,
			after: v,
		});
		return { id: v.id };
	});
}
