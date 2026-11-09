import { platformIT } from "@/modules/identity/companies.mjs";
import { companyRoute } from "../_company-route";
import { identityReadiness } from "@/modules/identity/configuration.mjs";
import { principal } from "../_identity";
import { capability } from "../_security";
import { database } from "@/modules/operations/index.mjs";
import {
	enrollMembership,
	securityService,
	SecurityError,
} from "@/modules/security/index.mjs";
import { permissionRegistry } from "../../_security-manifest.mjs";
import { z } from "zod";
import type { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import {
	assignUserCode,
	editUserCode,
} from "@/modules/identity/user-codes.mjs";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const schema = z
	.object({
		email: z
			.union([z.email().max(254), z.literal("")])
			.optional()
			.transform(
				(v) => v?.toLowerCase() || `${randomUUID()}@access.neuratec.invalid`,
			),
		name: z.string().trim().min(1).max(150),
		login_code: z
			.string()
			.trim()
			.toUpperCase()
			.regex(/^[A-Z]{3}[0-9]{3,10}$/)
			.optional(),
		status: z.enum(["active", "disabled"]),
		profile_ids: z.array(z.string().min(1)).max(30),
		revision: z.number().int().positive().optional(),
		version: z.number().int().positive(),
		crew_ids: z.array(z.string().min(1)).max(50),
	})
	.strict();
async function handleGET(request: Request) {
	const member = await principal(request);
	if (!member?.security || !capability(member, "security.read"))
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });
	const companyId = member.security.company_id;
	try {
		const db = await database();
		const security = await securityService(db, permissionRegistry).snapshot({
			companyId: companyId,
			subjectId: member.security.subject_id,
		});
		const users = (
			await db.query<Record<string, unknown> & { email: string }>(
				"SELECT m.email,m.role,m.revision,coalesce(nullif(s.display_name,''),m.name) name,s.status,l.code login_code,l.account_kind,l.evaluation_only,EXISTS(SELECT 1 FROM security_local_identities i WHERE i.email=m.email) has_password,coalesce((SELECT json_agg(crew_id) FROM app_crew_members c WHERE c.email=m.email),'[]'::json) crew_ids FROM app_members m JOIN security_memberships s ON s.subject_id=m.email AND s.company_id=$1 LEFT JOIN security_login_codes l ON l.subject_id=m.email AND (l.company_id=s.company_id OR l.account_kind='platform') WHERE ($2::boolean OR NOT EXISTS(SELECT 1 FROM security_platform_admins p WHERE p.subject_id=m.email AND p.status='active')) ORDER BY m.name",
				[companyId, Boolean(member.platform_it)],
			)
		).rows;
		const memberships = new Map(
			security.memberships.map((m) => [m.subject_id, m]),
		);
		return Response.json(
			{
				users: users.map((u) => ({
					...u,
					profile_ids: memberships.get(String(u.email))?.profile_ids || [],
				})),
				crews: (
					await db.query(
						"SELECT id,name FROM crews WHERE deleted_at IS NULL ORDER BY name",
					)
				).rows,
				...security,
				canEdit: capability(member, "security.update"),
				platformIT: Boolean(member.platform_it),
				enabled: process.env.APP_AUTH_ENABLED === "true",
				readiness: identityReadiness(),
			},
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch {
		return Response.json(
			{ error: "No se pudieron consultar usuarios y perfiles." },
			{ status: 500 },
		);
	}
}
async function handlePOST(request: Request) {
	const actor = await principal(request);
	if (!actor?.security || !capability(actor, "security.update"))
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });
	if (!request.headers.get("content-type")?.startsWith("application/json"))
		return Response.json({ error: "Se requiere JSON." }, { status: 415 });
	const companyId = actor.security.company_id;
	try {
		const raw = await request.text();
		if (raw.length > 16000)
			return Response.json(
				{ error: "Solicitud demasiado grande." },
				{ status: 413 },
			);
		const v = schema.parse(JSON.parse(raw));
		if (
			v.email === process.env.LANDSCAPE_IT_ADMIN_EMAIL?.toLowerCase() &&
			(v.status !== "active" || !v.profile_ids.includes("default-it_admin"))
		)
			throw new SecurityError(
				"El administrador inicial IT debe conservar su perfil protegido activo.",
				409,
			);
		const db = await database();
		await securityService(db, permissionRegistry).assign(
			{ companyId: companyId, subjectId: actor.security.subject_id },
			{
				subjectId: v.email,
				profileIds: v.profile_ids,
				status: v.status,
				version: v.version,
			},
			async (port) => {
				const tx = port as PGlite;
				const isPlatform = await platformIT(tx, v.email);
				if (
					isPlatform &&
					(v.status !== "active" || !v.profile_ids.includes("default-it_admin"))
				)
					throw new SecurityError(
						"IT debe conservar su acceso de plataforma activo.",
						409,
					);
				if (isPlatform && !actor.platform_it)
					throw new SecurityError(
						"Solo IT modifica administradores de plataforma.",
						403,
					);
				if (v.profile_ids.includes("default-it_admin") && !isPlatform)
					throw new SecurityError(
						"IT es una autoridad de plataforma; asigna un perfil empresarial.",
						403,
					);
				const existingMembership = (
					await tx.query(
						"SELECT status FROM security_memberships WHERE company_id=$1 AND subject_id=$2",
						[companyId, v.email],
					)
				).rows[0];
				if (
					!existingMembership &&
					!actor.platform_it &&
					(
						await tx.query("SELECT email FROM app_members WHERE email=$1", [
							v.email,
						])
					).rows.length
				)
					throw new SecurityError(
						"IT debe asignar esta identidad a la empresa.",
						403,
					);
				const old = (
					await tx.query<{
						revision: number;
						name: string;
						role: string;
						status: string;
						login_code: string | null;
					}>(
						"SELECT revision,name,role,status,(SELECT code FROM security_login_codes c WHERE c.subject_id=app_members.email AND c.company_id=$2) login_code FROM app_members WHERE email=$1 FOR UPDATE",
						[v.email, companyId],
					)
				).rows[0];
				if (old && old.revision !== v.revision)
					throw new SecurityError(
						"El usuario cambió. Recarga antes de guardar.",
						409,
					);
				const profiles = (
					await tx.query<{
						id: string;
						scope: string;
						system_key: string | null;
					}>(
						"SELECT id,scope,system_key FROM security_profiles WHERE company_id=$1 AND id=ANY($2::text[])",
						[companyId, v.profile_ids],
					)
				).rows;
				const legacy = profiles.some((p) => p.system_key === "it_admin")
					? "it_admin"
					: profiles.some((p) => p.system_key === "owner")
						? "owner"
						: profiles[0]?.scope === "assigned"
							? profiles.some((p) => p.system_key === "crew_lead")
								? "crew_lead"
								: "worker"
							: profiles.some((p) => p.system_key === "finance")
								? "finance"
								: "manager";
				if (old && actor.platform_it)
					await tx.query(
						"UPDATE app_members SET name=$2,role=$3,status=$4,revision=revision+1 WHERE email=$1",
						[v.email, v.name, isPlatform ? "it_admin" : legacy, "active"],
					);
				else if (!old)
					await tx.query(
						"INSERT INTO app_members(email,name,role,status) VALUES($1,$2,$3,$4)",
						[v.email, v.name, isPlatform ? "it_admin" : legacy, "active"],
					);
				await enrollMembership(tx, companyId, v.email, [], v.status);
				await tx.query(
					"UPDATE security_memberships SET display_name=$3 WHERE company_id=$1 AND subject_id=$2",
					[companyId, v.email, v.name],
				);
				const codeCompany = isPlatform
					? (
							await tx.query<{ company_id: string }>(
								"SELECT company_id FROM security_login_codes WHERE subject_id=$1 AND account_kind='platform' LIMIT 1",
								[v.email],
							)
						).rows[0]?.company_id
					: companyId;
				if (!codeCompany)
					throw new SecurityError(
						"Falta el código de plataforma. Contacta a IT.",
					);
				if (!isPlatform) await assignUserCode(tx, companyId, v.email);
				const loginCode = v.login_code
					? await editUserCode(tx, codeCompany, v.email, v.login_code)
					: (
							await tx.query<{ code: string }>(
								"SELECT code FROM security_login_codes WHERE company_id=$1 AND subject_id=$2",
								[codeCompany, v.email],
							)
						).rows[0].code;
				const previousCrews = (
					await tx.query<{ crew_id: string }>(
						"SELECT crew_id FROM app_crew_members WHERE email=$1",
						[v.email],
					)
				).rows.map((c) => c.crew_id);
				await tx.query("DELETE FROM app_crew_members WHERE email=$1", [
					v.email,
				]);
				for (const crew of new Set(v.crew_ids)) {
					if (
						!(
							await tx.query(
								"SELECT id FROM crews WHERE id=$1 AND deleted_at IS NULL",
								[crew],
							)
						).rows.length
					)
						throw new SecurityError("Cuadrilla no disponible.");
					await tx.query(
						"INSERT INTO app_crew_members(email,crew_id) VALUES($1,$2)",
						[v.email, crew],
					);
				}
				await tx.query(
					"INSERT INTO security_audit(company_id,actor,entity,entity_id,before_value,after_value) VALUES($1,$2,'user',$3,$4::jsonb,$5::jsonb)",
					[
						companyId,
						actor.email || "protected-evaluation",
						v.email,
						JSON.stringify(old ? { ...old, crew_ids: previousCrews } : null),
						JSON.stringify({
							name: v.name,
							login_code: loginCode,
							status: v.status,
							role: legacy,
							crew_ids: [...new Set(v.crew_ids)],
						}),
					],
				);
			},
		);
		return Response.json({ ok: true });
	} catch (error) {
		const duplicate =
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === "23505";
		return Response.json(
			{
				error:
					error instanceof SecurityError
						? error.message
						: duplicate
							? "El código o identidad ya está asignado. Usa otro."
							: "Revisa código, nombre, correo, perfiles, cuadrillas y revisión del usuario.",
			},
			{
				status:
					error instanceof SecurityError ? error.status : duplicate ? 409 : 422,
			},
		);
	}
}

export const GET = companyRoute(handleGET);
export const POST = companyRoute(handlePOST);
