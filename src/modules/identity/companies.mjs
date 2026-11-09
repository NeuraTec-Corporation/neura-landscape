import { randomUUID } from "node:crypto";
import { SecurityError, enrollMembership } from "../security/index.mjs";
import {
	bootstrapCompanyStorage,
	assertCompanyStorage,
	companyDatabase,
} from "../operations/tenant-database.mjs";
import { assignUserCode } from "./user-codes.mjs";

// Explicit API targeting must fail closed. An old cookie is only a preference;
// switching Google accounts may leave another user's preference behind.
export function selectCompany(companies, explicit, cookie) {
	const active = companies.filter(
		(c) => c.status === "active" && c.operational_enabled,
	);
	return explicit
		? active.find((c) => c.id === explicit)
		: active.find((c) => c.id === cookie) || active[0];
}
export async function platformIT(db, subject) {
	return Boolean(
		(
			await db.query(
				"SELECT p.subject_id FROM security_platform_admins p JOIN app_members m ON m.email=p.subject_id WHERE p.subject_id=$1 AND p.status='active' AND m.status='active'",
				[subject],
			)
		).rows.length,
	);
}
export async function availableCompanies(db, subject) {
	const root = await platformIT(db, subject);
	return (
		await db.query(
			`SELECT c.id,c.name,c.status,c.operational_enabled,c.version,l.prefix FROM security_companies c LEFT JOIN security_company_logins l ON l.company_id=c.id WHERE $2::boolean OR (c.status='active' AND EXISTS(SELECT 1 FROM security_memberships m WHERE m.company_id=c.id AND m.subject_id=$1 AND m.status='active')) ORDER BY c.name,c.id`,
			[subject, root],
		)
	).rows;
}
export async function synchronizeIT(db, companyId, subject) {
	if (!(await platformIT(db, subject))) return false;
	await db.transaction(async (tx) => {
		await tx.query("SELECT id FROM security_companies WHERE id=$1 FOR UPDATE", [
			companyId,
		]);
		await enrollMembership(tx, companyId, subject, ["default-it_admin"]);
		await tx.query(
			"UPDATE security_memberships SET status='active' WHERE company_id=$1 AND subject_id=$2",
			[companyId, subject],
		);
	});
	return true;
}
export async function storageForCompany(db, companyId) {
	const row = (
		await db.query(
			"SELECT s.schema_name FROM security_company_storage s JOIN security_companies c ON c.id=s.company_id WHERE c.id=$1 AND c.status='active' AND c.operational_enabled=true",
			[companyId],
		)
	).rows[0];
	if (!row) throw new SecurityError("Empresa no disponible.", 403);
	await assertCompanyStorage(db, row.schema_name);
	return companyDatabase(db, row.schema_name);
}
const ranks = {
	it_admin: 0,
	owner: 10,
	company_admin: 20,
	manager: 30,
	finance: 40,
	crew_lead: 50,
	worker: 60,
};
export async function saveCompany(db, subject, input, templates) {
	return db.transaction(async (tx) => {
		// Check under lock too: a request admitted before revocation has no authority.
		await tx.query(
			"SELECT subject_id FROM security_platform_admins WHERE subject_id=$1 FOR UPDATE",
			[subject],
		);
		if (!(await platformIT(tx, subject)))
			throw new SecurityError("Solo IT administra empresas.", 403);
		const name = String(input.name || "").trim(),
			prefix = String(input.prefix || "")
				.trim()
				.toUpperCase();
		if (
			name.length < 2 ||
			name.length > 150 ||
			!["active", "disabled"].includes(input.status)
		)
			throw new SecurityError("Revisa nombre y estado de la empresa.");
		let id = input.id;
		if (id) {
			const old = (
				await tx.query(
					"SELECT * FROM security_companies WHERE id=$1 FOR UPDATE",
					[id],
				)
			).rows[0];
			if (!old) throw new SecurityError("Empresa no encontrada.", 404);
			if (
				input.status === "disabled" &&
				(
					await tx.query(
						"SELECT id FROM security_companies WHERE status='active' AND id<>$1",
						[id],
					)
				).rows.length === 0
			)
				throw new SecurityError(
					"Conserva una empresa activa para la administración de la plataforma.",
					409,
				);
			if (old.version !== input.version)
				throw new SecurityError(
					"La empresa cambió. Recarga antes de guardar.",
					409,
				);
			await tx.query(
				"UPDATE security_companies SET name=$2,status=$3,version=version+1 WHERE id=$1",
				[id, name, input.status],
			);
		} else {
			if (!/^[A-Z]{3}$/.test(prefix) || prefix === "NEU")
				throw new SecurityError(
					"Usa tres letras únicas; NEU está reservado a la plataforma.",
				);
			id = randomUUID();
			const schema = `tenant_${id.replaceAll("-", "")}`;
			await tx.query(
				"INSERT INTO security_companies(id,name,status,operational_enabled) VALUES($1,$2,$3,true)",
				[id, name, input.status],
			);
			await tx.query(
				"INSERT INTO security_company_logins(company_id,prefix) VALUES($1,$2)",
				[id, prefix],
			);
			await bootstrapCompanyStorage(tx, schema);
			await tx.query(
				"INSERT INTO security_company_storage(company_id,schema_name) VALUES($1,$2)",
				[id, schema],
			);
			for (const p of templates)
				await tx.query(
					"INSERT INTO security_profiles(company_id,id,name,system_key,protected,scope,grants,authority_level) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)",
					[
						id,
						`default-${p.key}`,
						p.name,
						p.key,
						p.protected,
						p.scope,
						JSON.stringify(p.grants),
						ranks[p.key] ?? 100,
					],
				);
			const admins = (
				await tx.query(
					"SELECT subject_id FROM security_platform_admins WHERE status='active'",
				)
			).rows;
			for (const a of admins)
				await enrollMembership(tx, id, a.subject_id, ["default-it_admin"]);
			// New companies have static reference catalogs and no copied customers.
			await tx.query(
				`UPDATE "${schema}".operator_settings SET code=$1 WHERE id=1`,
				[prefix],
			);
		}
		await tx.query(
			"INSERT INTO security_audit(company_id,actor,entity,entity_id,after_value) VALUES($1,$2,'company',$1,$3::jsonb)",
			[id, subject, JSON.stringify({ name, status: input.status })],
		);
		return { id };
	});
}
export async function assignCompany(db, subject, input) {
	return db.transaction(async (tx) => {
		await tx.query(
			"SELECT subject_id FROM security_platform_admins WHERE subject_id=$1 FOR UPDATE",
			[subject],
		);
		if (!(await platformIT(tx, subject)))
			throw new SecurityError("Solo IT asigna usuarios entre empresas.", 403);
		const company = (
			await tx.query(
				"SELECT * FROM security_companies WHERE id=$1 FOR UPDATE",
				[input.company_id],
			)
		).rows[0];
		if (company?.status !== "active")
			throw new SecurityError("Selecciona una empresa activa.");
		const user = (
			await tx.query(
				"SELECT email FROM app_members WHERE email=$1 AND status='active'",
				[input.subject_id],
			)
		).rows[0];
		if (!user) throw new SecurityError("Selecciona un usuario activo.");
		const profile = (
			await tx.query(
				"SELECT * FROM security_profiles WHERE company_id=$1 AND id=$2 AND status='active'",
				[company.id, input.profile_id],
			)
		).rows[0];
		if (!profile || profile.protected)
			throw new SecurityError(
				"Selecciona un perfil empresarial. IT se administra en la plataforma.",
			);
		if (await platformIT(tx, user.email))
			throw new SecurityError(
				"IT ya tiene acceso global; no necesita membresías empresariales.",
			);
		await enrollMembership(tx, company.id, user.email, []);
		await tx.query(
			"UPDATE security_memberships SET status='active',revision=revision+1 WHERE company_id=$1 AND subject_id=$2",
			[company.id, user.email],
		);
		await tx.query(
			"DELETE FROM security_assignments WHERE company_id=$1 AND subject_id=$2",
			[company.id, user.email],
		);
		await tx.query("INSERT INTO security_assignments VALUES($1,$2,$3)", [
			company.id,
			user.email,
			profile.id,
		]);
		await assignUserCode(tx, company.id, user.email);
		await tx.query(
			"UPDATE security_companies SET version=version+1 WHERE id=$1",
			[company.id],
		);
		await tx.query(
			"INSERT INTO security_audit(company_id,actor,entity,entity_id,after_value) VALUES($1,$2,'company_assignment',$3,$4::jsonb)",
			[
				company.id,
				subject,
				user.email,
				JSON.stringify({ profile: profile.id }),
			],
		);
		return { ok: true };
	});
}
