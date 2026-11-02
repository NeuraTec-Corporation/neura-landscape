import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
	parse,
	ManageError,
	money,
	text,
	revision,
	audit,
	sequence,
} from "./manage.mjs";
import { requireOption } from "./catalog.mjs";
import { parsePhoneNumberFromString } from "libphonenumber-js";
const employeeSchema = z.object({
	id: z.string().uuid().optional(),
	revision,
	first_name: text,
	last_name: text,
	email: z.union([z.literal(""), z.email()]),
	phone: z.string().max(40),
	role_key: text,
	skills: z.string().trim().max(2000),
	hourly: z.union([z.literal(""), z.null(), money]),
	status: z.enum(["active", "inactive"]),
});
const crewSchema = z.object({
	id: z.string().min(1).optional(),
	revision,
	name: text,
	shift_start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
	shift_end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
	break_minutes: z.coerce.number().int().min(0).max(180),
	members: z
		.array(z.object({ employee_id: z.string().uuid(), duty: text }))
		.min(1, "Selecciona al menos una persona.")
		.max(100),
});
export async function workforce(db) {
	return db.transaction(async (tx) => ({
		employees: (
			await tx.query(
				"SELECT * FROM employees WHERE deleted_at IS NULL ORDER BY last_name,first_name",
			)
		).rows,
		crews: (
			await tx.query(
				"SELECT c.*,coalesce((SELECT json_agg(json_build_object('employee_id',e.id,'name',e.first_name||' '||e.last_name,'duty',m.duty,'hourly_cents',e.hourly_cents,'status',e.status)) FROM crew_employees m JOIN employees e ON e.id=m.employee_id WHERE m.crew_id=c.id),'[]'::json) members FROM crews c WHERE deleted_at IS NULL ORDER BY c.name",
			)
		).rows,
	}));
}
export async function saveEmployee(db, input) {
	const v = parse(employeeSchema, input),
		id = v.id || randomUUID();
	let phone = v.phone.trim();
	if (phone) {
		const p = parsePhoneNumberFromString(phone);
		if (!p?.isValid())
			throw new ManageError("Revisa el teléfono.", 422, {
				phone: "Usa un teléfono internacional válido.",
			});
		phone = p.number;
	}
	return db.transaction(async (tx) => {
		const old = v.id
			? (await tx.query("SELECT * FROM employees WHERE id=$1 FOR UPDATE", [id]))
					.rows[0]
			: null;
		if (v.id && (!old || old.deleted_at || old.revision !== v.revision))
			throw new ManageError("El empleado cambió. Recarga.", 409);
		await requireOption(tx, "employee_role", v.role_key, old?.role_key);
		const code = old?.code || (await sequence(tx, "employee", "EMP"));
		const vals = [
			id,
			code,
			v.first_name.toUpperCase(),
			v.last_name.toUpperCase(),
			v.email.trim().toLowerCase(),
			phone,
			v.role_key,
			v.skills,
			v.hourly === "" || v.hourly === null ? null : Math.round(v.hourly * 100),
			v.status,
		];
		if (v.id)
			await tx.query(
				"UPDATE employees SET first_name=$3,last_name=$4,email=$5,phone=$6,role_key=$7,skills=$8,hourly_cents=$9,status=$10,revision=revision+1 WHERE id=$1 AND code=$2",
				vals,
			);
		else
			await tx.query(
				"INSERT INTO employees(id,code,first_name,last_name,email,phone,role_key,skills,hourly_cents,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
				vals,
			);
		await audit(tx, "employee", id, v.id ? "updated" : "created");
		return { id };
	});
}
export async function saveCrew(db, input) {
	const v = parse(crewSchema, input),
		id = v.id || randomUUID();
	const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
	if (mins(v.shift_end) - mins(v.shift_start) <= v.break_minutes)
		throw new ManageError(
			"El horario debe superar los descansos. No se admiten turnos nocturnos en esta versión.",
		);
	if (new Set(v.members.map((m) => m.employee_id)).size !== v.members.length)
		throw new ManageError("Una persona no puede repetirse en la cuadrilla.");
	return db.transaction(async (tx) => {
		if (v.id) {
			const old = (
				await tx.query("SELECT * FROM crews WHERE id=$1 FOR UPDATE", [id])
			).rows[0];
			if (!old || old.deleted_at || old.revision !== v.revision)
				throw new ManageError("La cuadrilla cambió. Recarga.", 409);
		}
		let sum = 0,
			known = true;
		for (const member of v.members) {
			const e = (
				await tx.query(
					"SELECT * FROM employees WHERE id=$1 AND status='active' AND deleted_at IS NULL FOR SHARE",
					[member.employee_id],
				)
			).rows[0];
			if (!e)
				throw new ManageError(
					"Todos los integrantes deben ser empleados activos.",
				);
			await requireOption(tx, "employee_role", member.duty);
			if (e.hourly_cents === null) known = false;
			else sum += e.hourly_cents;
		}
		const vals = [
			id,
			v.name,
			v.members.length,
			known ? Math.round(sum / v.members.length) : 0,
			v.shift_start,
			v.shift_end,
			v.break_minutes,
		];
		if (v.id)
			await tx.query(
				"UPDATE crews SET name=$2,workers=$3,hourly_cents=$4,shift_start=$5,shift_end=$6,break_minutes=$7,revision=revision+1 WHERE id=$1",
				vals,
			);
		else
			await tx.query(
				"INSERT INTO crews(id,name,workers,hourly_cents,shift_start,shift_end,break_minutes) VALUES($1,$2,$3,$4,$5,$6,$7)",
				vals,
			);
		await tx.query("DELETE FROM crew_employees WHERE crew_id=$1", [id]);
		for (const m of v.members)
			await tx.query("INSERT INTO crew_employees VALUES($1,$2,$3)", [
				id,
				m.employee_id,
				m.duty,
			]);
		await audit(tx, "crew", id, v.id ? "updated" : "created");
		return { id };
	});
}
export async function removeWorkforce(db, entity, input) {
	if (
		!["employee", "crew"].includes(entity) ||
		typeof input.id !== "string" ||
		!Number.isInteger(input.revision)
	)
		throw new ManageError("Solicitud inválida.");
	return db.transaction(async (tx) => {
		const table = entity === "crew" ? "crews" : "employees",
			row = (
				await tx.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [
					input.id,
				])
			).rows[0];
		if (!row || row.deleted_at || row.revision !== input.revision)
			throw new ManageError("El registro cambió. Recarga.", 409);
		if (
			entity === "employee" &&
			(
				await tx.query(
					"SELECT c.id FROM crew_employees m JOIN crews c ON c.id=m.crew_id WHERE m.employee_id=$1 AND c.deleted_at IS NULL LIMIT 1",
					[input.id],
				)
			).rows.length
		)
			throw new ManageError(
				"Retira primero al empleado de sus cuadrillas activas.",
			);
		const pending =
			entity === "crew"
				? await tx.query(
						"SELECT id FROM visits WHERE crew_id=$1 AND status IN ('scheduled','started') AND deleted_at IS NULL LIMIT 1",
						[input.id],
					)
				: await tx.query(
						"SELECT v.id FROM visit_personnel p JOIN visits v ON v.id=p.visit_id WHERE p.employee_id=$1 AND v.status IN ('scheduled','started') AND v.deleted_at IS NULL LIMIT 1",
						[input.id],
					);
		if (pending.rows.length)
			throw new ManageError(
				"Reasigna o cancela primero las visitas pendientes.",
			);
		await tx.query(
			`UPDATE ${table} SET deleted_at=now(),revision=revision+1 WHERE id=$1`,
			[input.id],
		);
		await audit(tx, entity, input.id, "archived");
		return { id: input.id };
	});
}
