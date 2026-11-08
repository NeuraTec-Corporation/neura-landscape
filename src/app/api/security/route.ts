import { database } from "@/modules/operations/index.mjs";
import { securityService, SecurityError } from "@/modules/security/index.mjs";
import {
	CURRENT_COMPANY,
	permissionRegistry,
} from "../../_security-manifest.mjs";
import { principal } from "../_identity";
import { capability } from "../_security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
	const member = await principal(request);
	if (!member?.security || !capability(member, "security.read"))
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });
	try {
		const data = await securityService(
			await database(),
			permissionRegistry,
		).snapshot({
			companyId: CURRENT_COMPANY,
			subjectId: member.security.subject_id,
		});
		return Response.json(
			{ ...data, canEdit: capability(member, "security.update") },
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch (error) {
		return failure(error);
	}
}
export async function POST(request: Request) {
	const member = await principal(request);
	if (!member?.security || !capability(member, "security.update"))
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });
	if (!request.headers.get("content-type")?.startsWith("application/json"))
		return Response.json({ error: "Se requiere JSON." }, { status: 415 });
	try {
		const raw = await request.text();
		if (raw.length > 32000)
			return Response.json(
				{ error: "Solicitud demasiado grande." },
				{ status: 413 },
			);
		const input = JSON.parse(raw);
		if (input.company_id && input.company_id !== CURRENT_COMPANY)
			return Response.json(
				{ error: "Empresa no autorizada." },
				{ status: 403 },
			);
		if (input.action !== "profile")
			return Response.json({ error: "Acción no disponible." }, { status: 400 });
		const result = await securityService(
			await database(),
			permissionRegistry,
		).saveProfile(
			{ companyId: CURRENT_COMPANY, subjectId: member.security.subject_id },
			input,
		);
		return Response.json(result);
	} catch (error) {
		return failure(error);
	}
}
function failure(error: unknown) {
	return Response.json(
		{
			error:
				error instanceof SecurityError
					? error.message
					: "No se pudo guardar la seguridad. Revisa el nombre y recarga si hubo cambios.",
		},
		{ status: error instanceof SecurityError ? error.status : 422 },
	);
}
