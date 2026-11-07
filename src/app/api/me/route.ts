import { principal } from "../_identity";
import { authConfigured } from "@/modules/identity/auth.mjs";
import { allowedRequest } from "../_access";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
	if (!allowedRequest(request))
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });
	const member = await principal(request);
	return Response.json(
		{
			member,
			enabled: process.env.APP_AUTH_ENABLED === "true",
			configured: authConfigured(),
		},
		{ headers: { "Cache-Control": "no-store" } },
	);
}
