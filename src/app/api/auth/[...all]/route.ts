import { authentication, authConfigured } from "@/modules/identity/auth.mjs";
import { allowedRequest } from "../../_access";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handler(request: Request) {
	if (!allowedRequest(request))
		return Response.json({ error: "Origen no permitido." }, { status: 403 });
	if (!authConfigured())
		return Response.json(
			{ error: "Google OAuth está pendiente de configuración." },
			{ status: 503 },
		);
	try {
		return await (await authentication()).handler(request);
	} catch {
		return Response.json(
			{ error: "No se pudo completar el acceso." },
			{ status: 503 },
		);
	}
}
export const GET = handler;
export const POST = handler;
