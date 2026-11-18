import { z } from "zod";
import { globalDatabase } from "@/modules/operations/index.mjs";
import {
	availableCompanies,
	platformIT,
	saveCompany,
	assignCompany,
} from "@/modules/identity/companies.mjs";
import { SecurityError } from "@/modules/security/index.mjs";
import { defaultProfiles } from "../../_security-manifest.mjs";
import { principal } from "../_identity";
import { companyCookie } from "../_company-route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
	const actor = await principal(request);
	if (!actor)
		return Response.json(
			{ error: "Acceso no permitido." },
			{ status: 403, headers },
		);
	const db = await globalDatabase(),
		root = await platformIT(db, actor.email);
	const companies = await availableCompanies(db, actor.email);
	const users = root
		? (
				await db.query(
					"SELECT m.email,m.name,(SELECT code FROM security_login_codes l WHERE l.subject_id=m.email ORDER BY l.account_kind DESC,l.code LIMIT 1) login_code FROM app_members m WHERE m.status='active' AND NOT EXISTS(SELECT 1 FROM security_platform_admins p WHERE p.subject_id=m.email AND p.status='active') ORDER BY m.name",
				)
			).rows
		: [];
	const memberships = root
		? (
				await db.query(
					"SELECT m.company_id,m.subject_id,m.status,p.id profile_id,p.name profile_name FROM security_memberships m JOIN security_assignments a ON a.company_id=m.company_id AND a.subject_id=m.subject_id JOIN security_profiles p ON p.company_id=a.company_id AND p.id=a.profile_id WHERE NOT p.protected ORDER BY m.company_id,m.subject_id",
				)
			).rows
		: [];
	const profiles = root
		? (
				await db.query(
					"SELECT company_id,id,name FROM security_profiles WHERE status='active' AND NOT protected ORDER BY authority_level,name",
				)
			).rows
		: [];
	return Response.json(
		{
			companies,
			users,
			memberships,
			profiles,
			platformIT: root,
			scenario: root
				? (
						await db.query<{ manifest: unknown }>(
							"SELECT manifest FROM security_scenarios WHERE id='enterprise-distribution-v1'",
						)
					).rows[0]?.manifest
				: null,
			setupStatus: root
				? (
						await db.query(
							"SELECT status,message FROM security_setup_attempts WHERE id='enterprise-distribution-v1'",
						)
					).rows[0]
				: null,
			activeCompany: actor.security?.company_id,
		},
		{ headers },
	);
}
const save = z
	.object({
		action: z.literal("save"),
		id: z.string().max(80).optional(),
		name: z.string().trim().min(2).max(150),
		prefix: z.string().max(3).optional(),
		status: z.enum(["active", "disabled"]),
		version: z.number().int().positive().optional(),
	})
	.strict();
const assign = z
	.object({
		action: z.literal("assign"),
		company_id: z.string().max(80),
		subject_id: z.string().max(254),
		profile_id: z.string().max(100),
	})
	.strict();
const select = z
	.object({ action: z.literal("select"), company_id: z.string().max(80) })
	.strict();
export async function POST(request: Request) {
	const actor = await principal(request);
	if (!actor)
		return Response.json(
			{ error: "Acceso no permitido." },
			{ status: 403, headers },
		);
	try {
		if (!request.headers.get("content-type")?.startsWith("application/json"))
			throw new SecurityError("Se requiere JSON.", 415);
		const raw = await request.text();
		if (raw.length > 4096)
			throw new SecurityError("Solicitud demasiado grande.", 413);
		const input = z
				.discriminatedUnion("action", [save, assign, select])
				.parse(JSON.parse(raw)),
			db = await globalDatabase();
		if (input.action === "select") {
			const companies = await availableCompanies(db, actor.email);
			if (
				!companies.some(
					(c) => c.id === input.company_id && c.status === "active",
				)
			)
				throw new SecurityError("Empresa no autorizada.", 403);
			return Response.json(
				{ ok: true },
				{
					headers: {
						...headers,
						"Set-Cookie": companyCookie(input.company_id),
					},
				},
			);
		}
		if (!(await platformIT(db, actor.email)))
			throw new SecurityError(
				"Solo IT administra empresas y asignaciones.",
				403,
			);
		return Response.json(
			input.action === "save"
				? await saveCompany(db, actor.email, input, defaultProfiles)
				: await assignCompany(db, actor.email, input),
			{ headers },
		);
	} catch (e) {
		return Response.json(
			{
				error:
					e instanceof SecurityError
						? e.message
						: "Revisa los datos. El nombre o prefijo puede estar ocupado.",
			},
			{ status: e instanceof SecurityError ? e.status : 422, headers },
		);
	}
}
