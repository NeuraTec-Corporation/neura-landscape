import { z } from "zod";
import { authentication, authConfigured } from "@/modules/identity/auth.mjs";
import {
	identityMode,
	identityReadiness,
} from "@/modules/identity/configuration.mjs";
import { localAccessService } from "@/modules/identity/local-access.mjs";
import { database } from "@/modules/operations/index.mjs";
import { SecurityError } from "@/modules/security/index.mjs";
import { permissionRegistry } from "../../_security-manifest.mjs";
import { principal } from "../_identity";
import { capability } from "../_security";
import { allowedRequest } from "../_access";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const issue = z
	.object({
		action: z.literal("issue"),
		email: z
			.email()
			.max(254)
			.transform((v) => v.toLowerCase()),
	})
	.strict();
const redeem = z
	.object({
		action: z.literal("redeem"),
		token: z.string().length(43),
		password: z.string().min(12).max(128),
	})
	.strict();
export async function POST(request: Request) {
	const headers = {
		"Cache-Control": "no-store",
		"Referrer-Policy": "no-referrer",
	};
	if (!allowedRequest(request) || !request.headers.get("origin"))
		return Response.json(
			{ error: "Origen no permitido." },
			{ status: 403, headers },
		);
	if (!request.headers.get("content-type")?.startsWith("application/json"))
		return Response.json(
			{ error: "Se requiere JSON." },
			{ status: 415, headers },
		);
	if (identityMode() !== "google" || !authConfigured())
		return Response.json(
			{
				error:
					"El acceso propio requiere la configuración de sesión y PostgreSQL.",
			},
			{ status: 503, headers },
		);
	try {
		const raw = await request.text();
		if (raw.length > 4096)
			return Response.json(
				{ error: "Solicitud demasiado grande." },
				{ status: 413, headers },
			);
		const input = JSON.parse(raw);
		// Authenticate issuance before initializing provider storage or resolving targets.
		const actor = input.action === "issue" ? await principal(request) : null;
		if (
			input.action === "issue" &&
			(!actor?.security || !capability(actor, "security.update"))
		)
			return Response.json(
				{ error: "Acceso no permitido." },
				{ status: 403, headers },
			);
		const value = z.discriminatedUnion("action", [issue, redeem]).parse(input);
		const auth = await authentication(),
			context = await auth.$context;
		const service = localAccessService(
			await database(),
			permissionRegistry,
			context.password,
		);
		if (value.action === "redeem")
			return Response.json(await service.redeem(value.token, value.password), {
				headers,
			});
		if (!actor?.security)
			return Response.json(
				{ error: "Acceso no permitido." },
				{ status: 403, headers },
			);
		const result = await service.issue(
			{
				companyId: actor.security.company_id,
				subjectId: actor.security.subject_id,
			},
			value.email,
		);
		return Response.json(
			{
				url: `${identityReadiness().origin}/activar#token=${result.token}`,
				expiresAt: result.expiresAt,
			},
			{ headers },
		);
	} catch (error) {
		return Response.json(
			{
				error:
					error instanceof SecurityError
						? error.message
						: "No se pudo completar la operación. Revisa los datos o solicita un nuevo enlace.",
			},
			{ status: error instanceof SecurityError ? error.status : 422, headers },
		);
	}
}
