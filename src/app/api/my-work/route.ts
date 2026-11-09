import { companyRoute } from "../_company-route";
import { capability } from "../_security";
import { assignedWork } from "@/modules/identity/assignments.mjs";
import { principal } from "../_identity";
import { database } from "@/modules/operations/index.mjs";
export const dynamic = "force-dynamic";
async function handleGET(request: Request) {
	const member = await principal(request);
	if (
		!member ||
		!capability(member, "my_work.read") ||
		process.env.APP_AUTH_ENABLED !== "true"
	)
		return Response.json(
			{ error: "Se requiere acceso individual configurado." },
			{ status: 403 },
		);
	try {
		const rows = await assignedWork(await database(), member.email);
		return Response.json(rows, { headers: { "Cache-Control": "no-store" } });
	} catch {
		return Response.json(
			{ error: "No se pudieron consultar tus asignaciones." },
			{ status: 500 },
		);
	}
}

export const GET = companyRoute(handleGET);
