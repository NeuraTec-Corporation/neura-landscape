import { identityMode } from "@/modules/identity/configuration.mjs";
import { authentication, authConfigured } from "@/modules/identity/auth.mjs";
import { allowedRequest } from "../../_access";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handler(request: Request) {
	if (!allowedRequest(request))
		return Response.json({ error: "Origen no permitido." }, { status: 403 });
	if (identityMode() === "blocked" || !authConfigured())
		return Response.json(
			{ error: "El ingreso está pendiente de configuración." },
			{ status: 503 },
		);
	try {
		const path = new URL(request.url).pathname.replace(/^\/api\/auth\//, "");
		const allowed =
			request.method === "GET"
				? ["get-session", "callback/google", "error", "ok"]
				: ["sign-in/email", "sign-in/social", "sign-out"];
		// No public registration, email mutation, linking or password recovery endpoint.
		// Local identities are provisioned only by an authorized administrator.
		if (!allowed.includes(path))
			return Response.json(
				{ error: "Operación de acceso no disponible." },
				{ status: 403 },
			);
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
