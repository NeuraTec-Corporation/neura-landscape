import { operatingComparison } from "./operating-comparison.mjs";
import { z } from "zod";
import { parse, date, ManageError } from "./manage.mjs";
const schema = z.object({
	origin: z.enum(["all", "sample", "existing"]).default("all"),
	from: date,
	to: date,
	customer_id: z.string().default(""),
	city: z.string().default(""),
	region: z.string().default(""),
	status: z
		.enum(["", "scheduled", "started", "completed", "cancelled"])
		.default(""),
	service: z.string().default(""),
	crew_id: z.string().default(""),
	date_basis: z.enum(["scheduled", "completed"]).default("scheduled"),
});
const dateOnly = (value) =>
	typeof value === "string"
		? value.slice(0, 10)
		: new Date(value).toISOString().slice(0, 10);
const day = (value) =>
	new Date(value).toLocaleDateString("sv-SE", { timeZone: "America/New_York" });
export async function managementDashboard(db, input) {
	const f = parse(schema, input);
	if (
		f.to < f.from ||
		(Date.parse(f.to) - Date.parse(f.from)) / 86400000 > 3660
	)
		throw new ManageError("Selecciona un período válido de hasta diez años.");
	return db.transaction(async (tx) => {
		const sampleCustomers = new Set(
			(
				await tx.query(
					"SELECT entity_id FROM sample_data_records WHERE entity='customer'",
				)
			).rows.map((r) => r.entity_id),
		);
		const originMatch = (row) =>
			f.origin === "all" ||
			(f.origin === "sample"
				? sampleCustomers.has(row.customer_id)
				: !sampleCustomers.has(row.customer_id));
		// These read models run in one transaction and never include photo bytes or credentials.
		const all = (
			await tx.query(
				"SELECT v.*,p.name property_name,p.code property_code,p.city,p.region,p.customer_id,p.id property_id,k.name customer_name,c.service,cr.name crew_name,coalesce((SELECT json_agg(t) FROM visit_tasks t WHERE t.visit_id=v.id),'[]'::json) tasks,coalesce((SELECT json_agg(json_build_object('employee_id',pn.employee_id,'name',pn.name_snapshot,'actual_minutes',pn.actual_minutes)) FROM visit_personnel pn WHERE pn.visit_id=v.id),'[]'::json) personnel FROM visits v JOIN contracts c ON c.id=v.contract_id JOIN properties p ON p.id=c.property_id JOIN customers k ON k.id=p.customer_id JOIN crews cr ON cr.id=v.crew_id WHERE (v.deleted_at IS NULL OR v.status='completed' OR (v.status='cancelled' AND (coalesce(v.labor_cents,0)+v.materials_cents+v.equipment_cents+v.travel_cents+v.overhead_cents)>0)) ORDER BY v.scheduled_at",
			)
		).rows;
		const siteMatch = (row) =>
			originMatch(row) &&
			(!f.customer_id || row.customer_id === f.customer_id) &&
			(!f.city || row.city === f.city) &&
			(!f.region || row.region === f.region);
		const visits = all.filter((v) => {
			const timestamp =
				f.date_basis === "completed" ? v.completed_at : v.scheduled_at;
			if (!timestamp) return false;
			const d = day(timestamp);
			return (
				d >= f.from &&
				d <= f.to &&
				siteMatch(v) &&
				(!f.status || v.status === f.status) &&
				(!f.crew_id || v.crew_id === f.crew_id) &&
				(!f.service || v.tasks.some((t) => t.service_key === f.service))
			);
		});
		const catalogs = (await tx.query("SELECT * FROM catalog_options")).rows,
			label = (category, key) =>
				catalogs.find((c) => c.category === category && c.key === key)?.label ||
				key;
		const semantic = (category, key) =>
			catalogs.find((c) => c.category === category && c.key === key)
				?.semantic_key || key;
		const elementMap = new Map(
			(await tx.query("SELECT id,kind FROM property_elements")).rows.map(
				(e) => [e.id, e],
			),
		);
		const byStatus = { scheduled: 0, started: 0, completed: 0, cancelled: 0 };
		const costBreakdown = {
			labor: 0,
			materials: 0,
			equipment: 0,
			travel: 0,
			overhead: 0,
		};
		const trend = {},
			production = {},
			people = {};
		let allocated = 0,
			cost = 0,
			knownRevenue = 0,
			knownCosts = 0,
			costPending = 0,
			trees = 0,
			blocked = 0,
			unstructured = 0;
		for (const v of visits) {
			byStatus[v.status]++;
			const d = day(
				f.date_basis === "completed" ? v.completed_at : v.scheduled_at,
			);
			trend[d] ??= { date: d, completed: 0, scheduled: 0, cancelled: 0 };
			if (v.status in trend[d]) trend[d][v.status]++;
			if (v.status === "completed") {
				allocated += Number(v.revenue_cents || 0);
				if (v.cost_complete && v.labor_cents !== null) {
					cost += [
						"labor_cents",
						"materials_cents",
						"equipment_cents",
						"travel_cents",
						"overhead_cents",
					].reduce((sum, k) => sum + Number(v[k] || 0), 0);
					for (const key of Object.keys(costBreakdown))
						costBreakdown[key] += Number(v[`${key}_cents`] || 0);
					knownCosts++;
					knownRevenue += Number(v.revenue_cents || 0);
				} else costPending++;
				if (!v.tasks.length) unstructured++;
			}
			for (const t of v.tasks) {
				if (f.service && t.service_key !== f.service) continue;
				if (t.status === "blocked") blocked++;
				if (t.completed_quantity === null || Number(t.completed_quantity) === 0)
					continue;
				const key = `${t.service_key}:${t.unit}`;
				production[key] ??= {
					service_key: t.service_key,
					service: label("service", t.service_key),
					unit: t.unit,
					unit_label: label("element_unit", t.unit),
					quantity: 0,
				};
				production[key].quantity += Number(t.completed_quantity);
				if (
					semantic("service", t.service_key) === "pruning" &&
					t.unit === "each" &&
					t.element_id
				) {
					const e = elementMap.get(t.element_id);
					if (
						e &&
						["tree", "fruit_tree"].includes(semantic("element_kind", e.kind))
					)
						trees += Number(t.completed_quantity);
				}
			}
			for (const p of v.personnel) {
				people[p.employee_id] ??= {
					employee_id: p.employee_id,
					name: p.name,
					minutes: 0,
					visits: 0,
					tasks: 0,
				};
				if (v.status === "completed") {
					people[p.employee_id].minutes += Number(p.actual_minutes || 0);
					people[p.employee_id].visits++;
					people[p.employee_id].tasks += v.tasks.filter(
						(t) => t.employee_id === p.employee_id && t.status === "done",
					).length;
				}
			}
		}
		const financial = (
			await tx.query(
				"SELECT i.*,i.issue_date::text issue_date,i.due_date::text due_date,p.city,p.region,k.name customer_name,coalesce((SELECT sum(amount_cents)::int FROM payments t WHERE t.invoice_id=i.id AND t.voided_at IS NULL),0) paid_cents FROM invoices i JOIN customers k ON k.id=i.customer_id LEFT JOIN properties p ON p.id=i.property_id WHERE i.deleted_at IS NULL",
			)
		).rows.filter(siteMatch);
		const billed = financial.filter(
				(i) =>
					i.status === "issued" &&
					dateOnly(i.issue_date) >= f.from &&
					dateOnly(i.issue_date) <= f.to,
			),
			receivable = financial.filter((i) => i.status === "issued");
		const payments = (
			await tx.query(
				"SELECT t.*,t.received_date::text received_date,i.customer_id,p.city,p.region FROM payments t JOIN invoices i ON i.id=t.invoice_id LEFT JOIN properties p ON p.id=i.property_id WHERE t.voided_at IS NULL AND i.status='issued' AND i.deleted_at IS NULL",
			)
		).rows.filter(
			(t) =>
				siteMatch(t) &&
				dateOnly(t.received_date) >= f.from &&
				dateOnly(t.received_date) <= f.to,
		);
		const now = Date.now(),
			today = day(new Date());
		const month = today.slice(0, 7),
			obligationsAvailable = f.from <= `${month}-31` && f.to >= `${month}-01`;
		const allContracts = (
			await tx.query(
				"SELECT c.*,p.name property_name,p.city,p.region,p.customer_id,k.name customer_name FROM contracts c JOIN properties p ON p.id=c.property_id JOIN customers k ON k.id=p.customer_id WHERE c.deleted_at IS NULL AND c.status='active' AND p.deleted_at IS NULL",
			)
		).rows;
		const obligations = obligationsAvailable
			? allContracts
					.filter(
						(c) =>
							siteMatch(c) &&
							(!f.service ||
								c.service_key === f.service ||
								all.some(
									(v) =>
										v.contract_id === c.id &&
										v.tasks.some((t) => t.service_key === f.service),
								)),
					)
					.map((c) => {
						const related = all.filter(
							(v) =>
								v.contract_id === c.id &&
								day(v.scheduled_at).slice(0, 7) === month,
						);
						const completed = related.filter(
								(v) => v.status === "completed",
							).length,
							planned = related.filter(
								(v) =>
									["scheduled", "started"].includes(v.status) && !v.deleted_at,
							).length;
						return {
							...c,
							completed,
							planned,
							remaining: Math.max(0, c.visits_per_month - completed),
							unplanned: Math.max(0, c.visits_per_month - completed - planned),
						};
					})
			: [];

		const scopeSites = (
			await tx.query(
				"SELECT p.id,p.name,p.customer_id,p.city,p.region,p.status,c.name customer_name FROM properties p JOIN customers c ON c.id=p.customer_id WHERE p.deleted_at IS NULL",
			)
		).rows.filter(siteMatch);
		const customerRows = new Map();
		for (const p of scopeSites) {
			if (!customerRows.has(p.customer_id))
				customerRows.set(p.customer_id, {
					id: p.customer_id,
					name: p.customer_name,
					properties: 0,
					completed: 0,
					pending: 0,
					cancelled: 0,
					services: new Set(),
					billed_cents: 0,
					collected_cents: 0,
					balance_cents: 0,
				});
			customerRows.get(p.customer_id).properties++;
		}
		const account = (v) => {
			if (!customerRows.has(v.customer_id))
				customerRows.set(v.customer_id, {
					id: v.customer_id,
					name: v.customer_name || "Cliente",
					properties: 0,
					completed: 0,
					pending: 0,
					cancelled: 0,
					services: new Set(),
					billed_cents: 0,
					collected_cents: 0,
					balance_cents: 0,
				});
			return customerRows.get(v.customer_id);
		};
		for (const c of (await tx.query("SELECT id,name FROM customers")).rows) {
			if (
				(!f.customer_id || c.id === f.customer_id) &&
				originMatch({ customer_id: c.id }) &&
				(!(f.city || f.region) ||
					scopeSites.some((p) => p.customer_id === c.id))
			)
				account({ customer_id: c.id, customer_name: c.name });
		}
		for (const v of visits) {
			const a = account(v);
			if (v.status === "completed") a.completed++;
			if (["scheduled", "started"].includes(v.status)) a.pending++;
			if (v.status === "cancelled") a.cancelled++;
			for (const t of v.tasks) a.services.add(label("service", t.service_key));
		}
		for (const i of billed) account(i).billed_cents += i.total_cents;
		for (const p of payments) account(p).collected_cents += p.amount_cents;
		for (const i of receivable)
			account(i).balance_cents += i.total_cents - i.paid_cents;
		const scenario =
			(
				await tx.query(
					"SELECT manifest FROM sample_data_batches WHERE id='ops01-scenario-v1'",
				)
			).rows[0]?.manifest || null;

		const comparison=operatingComparison(visits,(await tx.query("SELECT * FROM visit_resources WHERE visit_id=ANY($1::text[])",[visits.map(v=>v.id)])).rows);
		return {
			comparison,
			filters: f,
			costBreakdown,
			scenario,
			customers: Array.from(customerRows.values(), (r) => ({
				...r,
				services: [...r.services],
			})),
			portfolio: {
				customers: customerRows.size,
				properties: scopeSites.length,
				active_contracts: allContracts.filter(siteMatch).length,
				crews: new Set(visits.map((v) => v.crew_id)).size,
				sample_customers: [...customerRows.keys()].filter((id) =>
					sampleCustomers.has(id),
				).length,
			},
			obligations,
			obligationsAvailable,
			obligationsMonth: month,
			summary: {
				unplanned_visits: obligations.reduce((sum, c) => sum + c.unplanned, 0),
				remaining_monthly: obligations.reduce((sum, c) => sum + c.remaining, 0),
				visits: visits.length,
				...byStatus,
				late: visits.filter(
					(v) =>
						v.status === "scheduled" &&
						new Date(v.scheduled_at).getTime() < now,
				).length,
				blocked_tasks: blocked,
				trees_pruned: trees,
				allocated_revenue_cents: allocated,
				known_cost_cents: cost,
				known_revenue_cents: knownRevenue,
				known_contribution_cents: knownRevenue - cost,
				cost_pending: costPending,
				known_cost_visits: knownCosts,
				unstructured_completed: unstructured,
				billed_cents: billed.reduce((s, i) => s + i.total_cents, 0),
				collected_cents: payments.reduce((s, p) => s + p.amount_cents, 0),
				receivable_cents: receivable.reduce(
					(s, i) => s + i.total_cents - i.paid_cents,
					0,
				),
				overdue_cents: receivable
					.filter((i) => dateOnly(i.due_date) < today)
					.reduce((s, i) => s + i.total_cents - i.paid_cents, 0),
				invoice_count: billed.length,
			},
			trend: Object.values(trend).sort((a, b) => a.date.localeCompare(b.date)),
			production: Object.values(production),
			productivity: Object.values(people),
			visits,
			invoices: billed,
			receivables: receivable.filter((i) => i.total_cents > i.paid_cents),
			options: {
				customers: (
					await tx.query("SELECT id,name FROM customers ORDER BY name")
				).rows,
				cities: [...new Set(all.map((v) => v.city).filter(Boolean))].sort(),
				regions: [...new Set(all.map((v) => v.region).filter(Boolean))].sort(),
				crews: (
					await tx.query(
						"SELECT id,name FROM crews WHERE deleted_at IS NULL ORDER BY name",
					)
				).rows,
			},
		};
	});
}
