import { saveRate, saveEstimate } from "../estimates/index.ts";
import { randomUUID } from "node:crypto";
import { saveEmployee, saveCrew } from "./workforce.mjs";
import { saveContract } from "./contracts.mjs";
import {
	saveVisit,
	changeVisit,
	completeVisit,
	saveVisitCosts,
} from "./visits.mjs";
import { saveInvoice, changeInvoice, savePayment } from "./finance.mjs";
import { saveSurveyItem } from "./survey.mjs";
import { saveOption } from "./catalog.mjs";
import {
	SAMPLE_BATCH,
	loadSampleCustomers,
	sampleStatus,
} from "./sample-data.mjs";
import { ManageError, audit } from "./manage.mjs";
export const OPERATIONS_BATCH = "ops01-scenario-v1";
const day = (value) =>
	new Date(value).toLocaleDateString("sv-SE", { timeZone: "America/New_York" });
const shiftDate = (date, offset) => {
	const d = new Date(`${date}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + offset);
	return d.toISOString().slice(0, 10);
};
function localDate(date, hour) {
	const probe = new Date(`${date}T12:00:00Z`);
	const tz = new Intl.DateTimeFormat("en", {
		timeZone: "America/New_York",
		timeZoneName: "longOffset",
	})
		.formatToParts(probe)
		.find((p) => p.type === "timeZoneName").value;
	const m = tz.match(/GMT([+-])(\d{2}):(\d{2})/);
	const offset = m
		? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
		: 0;
	return new Date(
		Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00Z`) -
			offset * 60000,
	).toISOString();
}
export async function loadSampleOperations(
	db,
	{ confirmed, actor, environment, now = new Date() },
) {
	if (!confirmed)
		throw new ManageError("Confirma el escenario operativo sintético.");
	if (environment === "production")
		throw new ManageError(
			"El escenario de prueba solo se carga en Preview o desarrollo.",
			403,
		);
	return db.transaction(async (tx) => {
		const created = (
			await tx.query(
				"INSERT INTO sample_data_batches(id,created_by,manifest) VALUES($1,$2,$3::jsonb) ON CONFLICT(id) DO NOTHING RETURNING id",
				[
					OPERATIONS_BATCH,
					actor,
					JSON.stringify({ synthetic: true, version: 1 }),
				],
			)
		).rows;
		if (!created.length) return { ...(await sampleStatus(tx)), replayed: true };
		const scoped = {
			query: (s, p) => tx.query(s, p),
			transaction: (fn) => fn(tx),
		};
		await loadSampleCustomers(scoped, { confirmed: true, actor, environment });
		const sites = (
			await tx.query(
				"SELECT p.*,cp.status customer_status FROM properties p JOIN customer_profiles cp ON cp.customer_id=p.customer_id JOIN sample_data_records r ON r.entity='property' AND r.entity_id=p.id AND r.batch_id=$1 WHERE p.deleted_at IS NULL AND p.status='active' ORDER BY p.code",
				[SAMPLE_BATCH],
			)
		).rows;
		if (!sites.length)
			throw new ManageError(
				"No hay localidades sintéticas activas para el escenario.",
			);
		const mark = async (entity, id) => {
			await tx.query("INSERT INTO sample_scenario_records VALUES($1,$2,$3)", [
				OPERATIONS_BATCH,
				entity,
				id,
			]);
			return id;
		};
		const manifest = {
			synthetic: true,
			version: 1,
			anchor_day: day(now),
			from: `${day(now).slice(0, 7)}-01`,
			to: "",
			customers: new Set(sites.map((p) => p.customer_id)).size,
			properties: sites.length,
			estimates: 0,
			rates: 1,
			serviced_properties: 0,
			draft_contracts: 0,
			employees: 0,
			crews: 0,
			contracts: 0,
			visits: 0,
			invoices: 0,
			payments: 0,
			zones: 0,
			elements: 0,
		};
		const [year, month] = manifest.anchor_day.split("-").map(Number);
		manifest.to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
		const previous = new Date(Date.UTC(year, month - 2, 1))
				.toISOString()
				.slice(0, 7),
			current = manifest.from.slice(0, 7);
		manifest.history_from = `${previous}-01`;
		const serviceKeys = [
			"mowing",
			"pruning",
			"planting",
			"inspection",
			"preserve",
			"maintenance",
			"snow",
		];
		for (const [name, semantic] of [
			["Retiro de hojas · PRUEBA", "maintenance"],
			["Instalación de mulch · PRUEBA", "planting"],
			["Fertilización · PRUEBA", "maintenance"],
			["Revisión de riego · PRUEBA", "inspection"],
		]) {
			const opt = await saveOption(scoped, {
				category: "service",
				label: name,
				active: true,
				semantic_key: semantic,
			});
			serviceKeys.push(opt.key);
			await mark("catalog", `service:${opt.key}`);
		}
		const rate = await saveRate(
			scoped,
			{
				name: "PRUEBA · Referencia de corte de césped",
				unit: "sqft",
				quantity_per_person_hour: 1000,
				setup_person_minutes: 10,
				source:
					"SUPUESTO SINTÉTICO de evaluación; no es un rendimiento validado ni referencia de mercado.",
				confidence: "estimated",
				active: true,
			},
			actor,
		);
		await mark("rate", rate.id);
		const crews = [];
		const first = [
			"ELENA",
			"MATEO",
			"LUCÍA",
			"DIEGO",
			"SOFÍA",
			"ANDRÉS",
			"VALERIA",
			"GABRIEL",
			"CAMILA",
			"TOMÁS",
			"PAULA",
			"DANIEL",
			"SARA",
			"NICOLÁS",
			"IRENE",
			"MARCOS",
			"ALBA",
			"JULIÁN",
		];
		for (let c = 0; c < 6; c++) {
			const members = [];
			for (let m = 0; m < 3; m++) {
				const id = await mark(
					"employee",
					(
						await saveEmployee(scoped, {
							first_name: first[c * 3 + m],
							last_name: "EJEMPLO",
							email: `equipo-${c * 3 + m + 1}@example.invalid`,
							phone: "",
							role_key: m === 0 ? "leader" : m === 1 ? "operator" : "gardener",
							skills:
								"DATOS SINTÉTICOS. Césped, poda y mantenimiento; sin cuenta de acceso creada.",
							hourly: 24 + m * 3 + c,
							status: "active",
						})
					).id,
				);
				members.push({
					employee_id: id,
					duty: m === 0 ? "leader" : m === 1 ? "operator" : "gardener",
				});
				manifest.employees++;
			}
			const id = await mark(
				"crew",
				(
					await saveCrew(scoped, {
						name: `${["Norte", "Sur", "Centro", "Jardines", "Comercial", "Especialistas"][c]} · PRUEBA`,
						shift_start: "06:00",
						shift_end: "18:00",
						break_minutes: 60,
						members,
					})
				).id,
			);
			crews.push({ id, members });
			manifest.crews++;
		}
		for (let i = 0; i < sites.length; i++) {
			const p = sites[i],
				crew = crews[i % 6],
				group = Math.floor(i / 6),
				hours = 8 + (group % 3) * 3,
				monthly =
					p.kind === "commercial" ? 980 + (i % 9) * 80 : 420 + (i % 9) * 35;
			const front = (
				await tx.query(
					"SELECT * FROM property_zones WHERE property_id=$1 AND kind='lawn' AND deleted_at IS NULL ORDER BY id LIMIT 1",
					[p.id],
				)
			).rows[0];
			if (!front)
				throw new ManageError(
					"La localidad sintética no tiene su zona inicial; no se sobrescribe el levantamiento.",
				);
			const rear = await mark(
				"zone",
				(
					await saveSurveyItem(scoped, "zone", {
						property_id: p.id,
						name: "Jardín posterior · PRUEBA",
						kind: "garden",
						area: 100 + (i % 8) * 35,
						unit: "sqft",
						measurement_status: "estimated",
						latitude: null,
						longitude: null,
						notes:
							"Levantamiento sintético. Superficie estimada para simular cuidados.",
					})
				).id,
			);
			manifest.zones++;
			const _driveway = await mark(
				"zone",
				(
					await saveSurveyItem(scoped, "zone", {
						property_id: p.id,
						name: "Driveway · PRUEBA",
						kind: "driveway",
						area: 200 + (i % 5) * 80,
						unit: "sqft",
						measurement_status: "estimated",
						latitude: null,
						longitude: null,
						notes: "Zona sintética para limpieza y servicio de nieve.",
					})
				).id,
			);
			manifest.zones++;
			const elements = [];
			for (const [name, kind, quantity, service, zoneId] of [
				[
					"Árboles ornamentales · PRUEBA",
					"tree",
					3 + (i % 3),
					"pruning",
					front.id,
				],
				["Árbol frutal · PRUEBA", "fruit_tree", 1, "preserve", rear],
				["Jardineras · PRUEBA", "planter", 2 + (i % 4), "planting", rear],
			]) {
				const id = await mark(
					"element",
					(
						await saveSurveyItem(scoped, "element", {
							property_id: p.id,
							zone_id: zoneId,
							name,
							kind,
							quantity,
							unit: "each",
							service,
							frequency: "monthly",
							season: "all",
							protection_notes:
								kind === "fruit_tree"
									? "Preservar frutos; no podar sin autorización."
									: "Revisar accesos y proteger plantas.",
							latitude: null,
							longitude: null,
							notes: "Inventario sintético, sin fotografía real.",
						})
					).id,
				);
				elements.push({ id, quantity });
				manifest.elements++;
			}
			await mark(
				"estimate",
				(
					await saveEstimate(
						scoped,
						{
							property_id: p.id,
							title: "PRUEBA · Propuesta de corte de césped frontal",
							rate_id: rate.id,
							rate_revision: 1,
							zone_ids: [front.id],
							zone_revisions: { [front.id]: front.revision },
							areas_independent: true,
							resources_reviewed: true,
							labor_hourly: 26,
							overhead_percent: 12,
							margin_percent: 30,
							lines: [
								{
									client_key: randomUUID(),
									description: "PRUEBA · Combustible de cortadora",
									category: "materials",
									quantity: 1,
									unit: "galón estimado",
									unit_price: 4,
								},
								{
									client_key: randomUUID(),
									description: "PRUEBA · Uso de cortadora",
									category: "equipment",
									quantity: 0.5,
									unit: "hora",
									unit_price: 18,
								},
							],
							reason:
								"ESCENARIO SINTÉTICO. Propuesta de corte únicamente; no incluye el resto del plan integral.",
							notes: "Datos de prueba. Sin envío, aceptación ni cobro real.",
						},
						actor,
					)
				).id,
			);
			manifest.estimates++;
			const contract = await mark(
				"contract",
				(
					await saveContract(scoped, {
						property_id: p.id,
						service:
							"PRUEBA · Plan integral: césped, poda, limpieza y cuidados estacionales",
						service_key: "maintenance",
						frequency: "Semanal",
						monthly,
						visits_per_month: 4,
						estimated_minutes: 45,
						status: p.customer_status === "active" ? "active" : "draft",
					})
				).id,
			);
			manifest.contracts++;
			if (p.customer_status !== "active") {
				manifest.draft_contracts++;
				continue;
			}
			manifest.serviced_properties++;
			for (let cycle = 0; cycle < 4; cycle++) {
				const date =
					cycle === 0
						? `${previous}-${String(1 + Math.floor(group / 3)).padStart(2, "0")}`
						: `${current}-${String((cycle === 1 ? 1 : cycle === 2 ? 8 : 18) + Math.floor(group / 3)).padStart(2, "0")}`;
				let scheduled = localDate(date, hours),
					state =
						cycle <= 1 &&
						new Date(scheduled).getTime() + 90 * 60000 < new Date(now).getTime()
							? "completed"
							: "scheduled";
				if (cycle === 2 && i % 13 === 0) state = "cancelled";
				const localHour = Number(
					new Date(now).toLocaleTimeString("en-GB", {
						timeZone: "America/New_York",
						hour: "2-digit",
						hourCycle: "h23",
					}),
				);
				if (cycle === 2 && i < 6 && localHour >= 7 && localHour < 17) {
					scheduled = new Date(
						new Date(now).getTime() - 20 * 60000,
					).toISOString();
					state = "started";
				}
				const main = serviceKeys[(i + cycle) % serviceKeys.length],
					quantity =
						main === "mowing"
							? Number(front.area || 300)
							: main === "snow"
								? 200 + (i % 5) * 80
								: main === "pruning"
									? elements[0].quantity
									: 1;
				const tasks = [
					{
						service_key: main,
						description: `PRUEBA · ${main.startsWith("custom_") ? "Servicio estacional contratado" : { mowing: "Cortar césped frontal y recoger residuos", pruning: "Poda de árboles ornamentales", planting: "Renovar jardineras", inspection: "Revisar estado de riego y accesos", preserve: "Revisar frutal y preservar frutos", maintenance: "Mantenimiento general del sitio", snow: "Limpiar nieve del driveway" }[main]}`,
						element_id:
							main === "pruning"
								? elements[0].id
								: main === "preserve"
									? elements[1].id
									: main === "planting"
										? elements[2].id
										: null,
						employee_id: crew.members[0].employee_id,
						quantity,
						unit: ["mowing", "snow"].includes(main) ? "sqft" : "each",
					},
					{
						service_key: main === "pruning" ? "preserve" : "pruning",
						description:
							main === "pruning"
								? "PRUEBA · Preservar frutos del árbol frutal"
								: "PRUEBA · Poda mensual de árboles ornamentales",
						element_id: elements[main === "pruning" ? 1 : 0].id,
						employee_id: crew.members[1].employee_id,
						quantity: main === "pruning" ? 1 : elements[0].quantity,
						unit: "each",
					},
					{
						service_key:
							main === serviceKeys[7] ? "inspection" : serviceKeys[7],
						description: "PRUEBA · Recolectar hojas y revisar acceso",
						employee_id: crew.members[2].employee_id,
						quantity: 2 + (i % 4),
						unit: "each",
					},
				];
				const visit = await mark(
					"visit",
					(
						await saveVisit(scoped, {
							contract_id: contract,
							crew_id: crew.id,
							scheduled_at: scheduled,
							title: `PRUEBA · Visita ${cycle + 1} · ${p.name}`,
							planned_minutes: 35 + (i % 4) * 10,
							travel_minutes: 15,
							tasks,
						})
					).id,
				);
				manifest.visits++;
				if (state === "completed" || state === "started")
					await changeVisit(scoped, {
						id: visit,
						revision: 1,
						action: "start",
					});
				if (state === "completed") {
					const rows = (
						await tx.query(
							"SELECT * FROM visit_tasks WHERE visit_id=$1 ORDER BY id",
							[visit],
						)
					).rows;
					await completeVisit(scoped, {
						id: visit,
						revision: 2,
						notes:
							"SIMULACIÓN: trabajo realizado, control de calidad y consumos registrados. Sin servicio real.",
						personnel: crew.members.map((m, n) => ({
							employee_id: m.employee_id,
							actual_minutes: 30 + (i % 5) * 7 - n * 2,
						})),
						tasks: rows.map((t) => ({
							id: t.id,
							completed_quantity:
								i % 11 === 0 && t.description === "PRUEBA · Recolectar hojas y revisar acceso" ? 0 : Number(t.quantity),
							status: i % 11 === 0 && t.description === "PRUEBA · Recolectar hojas y revisar acceso" ? "blocked" : "done",
							notes:
								i % 11 === 0 && t.description === "PRUEBA · Recolectar hojas y revisar acceso"
									? "SIMULACIÓN: acceso cerrado; requiere reprogramación."
									: "",
						})),
					});
					await saveVisitCosts(scoped, {
						id: visit,
						revision: 3,
						reason:
							"Consumos SINTÉTICOS de evaluación; no representan compras reales.",
						lines: [
							{
								category: "materials",
								description: "PRUEBA · Bolsas para residuos vegetales",
								quantity: 2 + (i % 3),
								unit_price: 2.5,
							},
							{
								category: "materials",
								description: "PRUEBA · Mulch embolsado",
								quantity: i % 7 === 0 ? 12 : 2,
								unit_price: 8,
							},
							{
								category: "equipment",
								description: "PRUEBA · Uso de cortadora/sopladora (hora)",
								quantity: 0.5,
								unit_price: 18,
							},
							{
								category: "travel",
								description: "PRUEBA · Combustible y traslado asignado",
								quantity: 1,
								unit_price: 8,
							},
							{
								category: "overhead",
								description: "PRUEBA · Indirectos asignados",
								quantity: 1,
								unit_price: 5,
							},
						],
					});
					// Fixture-only historical import: operational calculations above are reused; these explicit synthetic timestamps place the example in its stated period.
					const end = new Date(
						new Date(scheduled).getTime() + (45 + (i % 15)) * 60000,
					).toISOString();
					await tx.query(
						"UPDATE visits SET started_at=$2,completed_at=$3 WHERE id=$1",
						[visit, scheduled, end],
					);
				} else if (state === "cancelled")
					await changeVisit(scoped, {
						id: visit,
						revision: 1,
						action: "cancel",
						reason: "SIMULACIÓN: cliente solicita cambiar la fecha.",
					});
			}
			for (let period = 0; period < 2; period++) {
				const issue = `${period ? current : previous}-01`,
					due = period
						? shiftDate(manifest.anchor_day, 15)
						: shiftDate(`${current}-01`, -7);
				const invoice = await mark(
					"invoice",
					(
						await saveInvoice(scoped, {
							customer_id: p.customer_id,
							property_id: p.id,
							issue_date: issue,
							due_date: due,
							notes: `DOCUMENTO SINTÉTICO DE PRUEBA. Sin validez fiscal, sin entrega al cliente y sin cobro real. Plan ${contract}`,
							lines: [
								{
									description:
										"PRUEBA · Plan mensual integral de la localidad — 4 visitas",
									quantity: 1,
									unit_price: monthly,
								},
							],
						})
					).id,
				);
				manifest.invoices++;
				await changeInvoice(scoped, {
					id: invoice,
					revision: 1,
					action: "issue",
				});
				const fraction =
					i % 4 === 0
						? 1
						: i % 4 === 1
							? 0.5
							: period === 0 && i % 4 === 3
								? 1
								: 0;
				if (fraction) {
					await mark(
						"payment",
						(
							await savePayment(scoped, {
								invoice_id: invoice,
								revision: 2,
								received_date: period
									? manifest.anchor_day
									: shiftDate(issue, 7),
								amount: Math.round(monthly * fraction * 100) / 100,
								method: i % 2 ? "check" : "bank",
								reference: `SIMULACIÓN SIN TRANSACCIÓN REAL · ${OPERATIONS_BATCH}`,
							})
						).id,
					);
					manifest.payments++;
				}
			}
		}
		await tx.query(
			"UPDATE sample_data_batches SET manifest=$2::jsonb WHERE id=$1",
			[OPERATIONS_BATCH, JSON.stringify(manifest)],
		);
		await audit(
			tx,
			"sample_data",
			OPERATIONS_BATCH,
			"operational_scenario_loaded",
			manifest,
		);
		return { ...(await sampleStatus(tx)), replayed: false };
	});
}
