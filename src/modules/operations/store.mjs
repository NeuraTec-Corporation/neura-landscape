import { PGlite } from "@electric-sql/pglite";

import { mkdir } from "node:fs/promises";

import { resolve } from "node:path";

import { randomUUID } from "node:crypto";

import { migrate } from "./migrations.mjs";
import { requestTenant } from "./tenant-database.mjs";

const key = Symbol.for("neura-landscape.database");

export async function database() {
	return requestTenant()?.db || globalDatabase();
}
export async function globalDatabase() {
	if (!globalThis[key])
		globalThis[key] = (async () => {
			if (process.env.DATABASE_URL) {
				const { postgresDatabase } = await import("./postgres.mjs");

				const db = postgresDatabase(process.env.DATABASE_URL);

				if (process.env.MIGRATE_ON_START === "true") await migrate(db, true);

				return db;
			}

			if (process.env.VERCEL)
				throw new Error("DATABASE_URL is required for hosted persistence.");

			const dataDir =
				process.env.LANDSCAPE_DATA_DIR || resolve(".data/landscape");

			if (dataDir !== "memory://") await mkdir(dataDir, { recursive: true });

			const db = new PGlite(dataDir);

			await migrate(db);

			return db;
		})();

	return globalThis[key];
}

function text(value, label) {
	if (typeof value !== "string" || !value.trim() || value.length > 500)
		throw new Error(`${label} requerido (máximo 500 caracteres).`);

	return value.trim();
}

function integer(value, label, min = 0, max = 100000000) {
	if (value === "" || value === null || value === undefined)
		throw new Error(`${label} requerido.`);

	const result = Number(value);

	if (!Number.isSafeInteger(result) || result < min || result > max)
		throw new Error(`${label} fuera de rango.`);

	return result;
}

function cents(value, label) {
	const n = Number(value);

	if (
		value === "" ||
		value == null ||
		!Number.isFinite(n) ||
		n < 0 ||
		n > 1000000 ||
		Math.abs(n * 100 - Math.round(n * 100)) > 0.00001
	)
		throw new Error(`${label} debe tener hasta dos decimales y ser positivo.`);

	return Math.round(n * 100);
}

export function profitability(visit) {
	if (visit.status !== "completed" || visit.cost_complete === false)
		return null;

	const cost =
		Number(visit.labor_cents) +
		Number(visit.materials_cents) +
		Number(visit.equipment_cents) +
		Number(visit.travel_cents) +
		Number(visit.overhead_cents);

	const revenue = Number(visit.revenue_cents);

	return {
		cost_cents: cost,

		revenue_cents: revenue,

		contribution_cents: revenue - cost,

		margin: revenue === 0 ? null : ((revenue - cost) / revenue) * 100,
	};
}

export async function snapshot(db) {
	return db.transaction(async (tx) => {
		const customers = (await tx.query("SELECT * FROM customers ORDER BY name"))
			.rows;

		const properties = (
			await tx.query(
				"SELECT p.*, c.name customer_name FROM properties p JOIN customers c ON c.id=p.customer_id WHERE to_jsonb(p)->>'deleted_at' IS NULL ORDER BY p.name",
			)
		).rows;

		const contracts = (
			await tx.query(
				"SELECT c.*,p.name property_name,to_jsonb(p)->>'code' property_code,k.name customer_name FROM contracts c JOIN properties p ON p.id=c.property_id JOIN customers k ON k.id=p.customer_id ORDER BY p.name",
			)
		).rows;

		const crews = (await tx.query("SELECT * FROM crews ORDER BY name")).rows;

		const visits = (
			await tx.query(
				"SELECT v.*,p.name property_name,c.service,c.estimated_minutes,k.name crew_name FROM visits v JOIN contracts c ON c.id=v.contract_id JOIN properties p ON p.id=c.property_id JOIN crews k ON k.id=v.crew_id ORDER BY v.scheduled_at,v.route_order",
			)
		).rows;

		return {
			customers,

			properties,

			contracts,

			crews,

			visits: visits.map((v) => ({ ...v, profitability: profitability(v) })),
		};
	});
}

export async function mutate(db, input) {
	const id = randomUUID();

	return db.transaction(async (tx) => {
		switch (input.action) {
			case "example": {
				if ((await tx.query("SELECT id FROM customers LIMIT 1")).rows.length)
					throw new Error("El ejemplo requiere una base vacía.");

				const propertyId = randomUUID(),
					contractId = randomUUID(),
					crewId = randomUUID(),
					visitId = randomUUID();

				await tx.query("INSERT INTO customers VALUES($1,$2)", [
					id,

					"CAMILO SANTANA",
				]);

				await tx.query(
					"INSERT INTO properties(id,customer_id,name,address,lawn_sqft) VALUES($1,$2,$3,$4,$5)",

					[propertyId, id, "Jardín Alameda", "Dirección ficticia", 8400],
				);

				await tx.query(
					"INSERT INTO contracts(id,property_id,service,frequency,monthly_cents,visits_per_month,estimated_minutes) VALUES($1,$2,$3,$4,$5,$6,$7)",
					[
						contractId,

						propertyId,

						"Mantenimiento",

						"Semanal",

						32000,

						4,

						45,
					],
				);

				await tx.query("INSERT INTO crews VALUES($1,$2,$3,$4)", [
					crewId,

					"Cuadrilla Alameda",

					2,

					2400,
				]);

				await tx.query(
					"INSERT INTO visits(id,contract_id,crew_id,scheduled_at,route_order) VALUES($1,$2,$3,$4,$5)",

					[visitId, contractId, crewId, new Date().toISOString(), 1],
				);

				await tx.query("INSERT INTO activity(visit_id,event) VALUES($1,$2)", [
					visitId,

					"scheduled",
				]);

				break;
			}

			case "customer":
				await tx.query("INSERT INTO customers VALUES($1,$2)", [
					id,

					text(input.name, "Nombre"),
				]);

				break;

			case "property":
				await tx.query(
					"INSERT INTO properties(id,customer_id,name,address,lawn_sqft) VALUES($1,$2,$3,$4,$5)",

					[
						id,

						text(input.customer_id, "Cliente"),

						text(input.name, "Propiedad"),

						text(input.address, "Dirección"),

						integer(input.lawn_sqft, "Superficie", 0, 100000000),
					],
				);

				break;

			case "contract":
				await tx.query(
					"INSERT INTO contracts(id,property_id,service,frequency,monthly_cents,visits_per_month,estimated_minutes) VALUES($1,$2,$3,$4,$5,$6,$7)",
					[
						id,

						text(input.property_id, "Propiedad"),

						text(input.service, "Servicio"),

						text(input.frequency, "Frecuencia"),

						cents(input.monthly, "Precio mensual"),

						integer(input.visits_per_month, "Visitas al mes", 1, 100),

						integer(input.estimated_minutes, "Minutos previstos", 1, 1440),
					],
				);

				break;

			case "crew":
				await tx.query("INSERT INTO crews VALUES($1,$2,$3,$4)", [
					id,

					text(input.name, "Cuadrilla"),

					integer(input.workers, "Trabajadores", 1, 100),

					cents(input.hourly, "Costo laboral por hora y trabajador"),
				]);

				break;

			case "visit": {
				const date = new Date(text(input.scheduled_at, "Fecha"));

				if (!Number.isFinite(date.getTime()))
					throw new Error("Fecha inválida.");

				const contract = (
					await tx.query(
						"SELECT c.*,to_jsonb(p)->>'deleted_at' property_deleted FROM contracts c JOIN properties p ON p.id=c.property_id WHERE c.id=$1 FOR UPDATE OF c,p",
						[input.contract_id],
					)
				).rows[0];

				if (
					!contract ||
					contract.deleted_at ||
					contract.property_deleted ||
					(contract.status && contract.status !== "active")
				)
					throw new Error("Contrato no activo o localidad eliminada.");

				await tx.query(
					"INSERT INTO visits(id,contract_id,crew_id,scheduled_at,route_order) VALUES($1,$2,$3,$4,$5)",

					[
						id,

						text(input.contract_id, "Contrato"),

						text(input.crew_id, "Cuadrilla"),

						date.toISOString(),

						integer(input.route_order, "Orden de ruta", 1, 1000),
					],
				);

				if ("status" in contract)
					await tx.query(
						"UPDATE visits SET planned_revenue_cents=$2 WHERE id=$1",
						[
							id,
							Math.round(contract.monthly_cents / contract.visits_per_month),
						],
					);

				await tx.query("INSERT INTO activity(visit_id,event) VALUES($1,$2)", [
					id,

					"scheduled",
				]);

				break;
			}

			case "start": {
				const result = await tx.query(
					"UPDATE visits SET status='started',started_at=now() WHERE id=$1 AND status='scheduled' RETURNING id",

					[text(input.id, "Visita")],
				);

				if (result.rows.length !== 1)
					throw new Error("La visita debe estar programada.");

				await tx.query("INSERT INTO activity(visit_id,event) VALUES($1,$2)", [
					input.id,

					"started",
				]);

				return { id: input.id };
			}

			case "complete": {
				const visit = (
					await tx.query(
						"SELECT v.*,c.monthly_cents,c.visits_per_month,k.workers,k.hourly_cents FROM visits v JOIN contracts c ON c.id=v.contract_id JOIN crews k ON k.id=v.crew_id WHERE v.id=$1 FOR UPDATE OF v",

						[text(input.id, "Visita")],
					)
				).rows[0];

				if (visit?.status !== "started")
					throw new Error("Inicia la visita antes de completarla.");

				const minutes = integer(
					input.actual_minutes,

					"Minutos reales",

					1,

					1440,
				);

				const labor = Math.round(
					(minutes / 60) * Number(visit.workers) * Number(visit.hourly_cents),
				);

				const revenue = Math.round(
					visit.planned_revenue_cents ??
						Number(visit.monthly_cents) / Number(visit.visits_per_month),
				);

				const notes = input.notes ? text(input.notes, "Notas") : "";

				await tx.query(
					"UPDATE visits SET status='completed',completed_at=now(),actual_minutes=$2,labor_cents=$3,revenue_cents=$4,materials_cents=$5,equipment_cents=$6,travel_cents=$7,overhead_cents=$8,notes=$9 WHERE id=$1",

					[
						input.id,

						minutes,

						labor,

						revenue,

						cents(input.materials, "Materiales"),

						cents(input.equipment, "Maquinaria"),

						cents(input.travel, "Traslado"),

						cents(input.overhead, "Indirectos"),

						notes,
					],
				);

				await tx.query("INSERT INTO activity(visit_id,event) VALUES($1,$2)", [
					input.id,

					"completed",
				]);

				return { id: input.id };
			}

			default:
				throw new Error("Operación desconocida.");
		}

		return { id };
	});
}
