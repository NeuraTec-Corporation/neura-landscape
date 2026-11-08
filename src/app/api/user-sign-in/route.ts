import { randomUUID } from "node:crypto";
import { z } from "zod";
import { allowedRequest } from "../_access";
import { nativeAuthentication } from "../_native-auth";
import { emailForUserCode } from "@/modules/identity/user-codes.mjs";
import { database } from "@/modules/operations/index.mjs";
import { CURRENT_COMPANY } from "../../_security-manifest.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z
	.object({
		code: z
			.string()
			.trim()
			.toUpperCase()
			.regex(/^[A-Z]{3}[0-9]{3,10}$/),
		password: z.string().min(1).max(128),
	})
	.strict();
export async function POST(request: Request) {
	const headers = { "Cache-Control": "no-store" };
	if (!allowedRequest(request) || !request.headers.get("origin"))
		return Response.json(
			{ error: "Origen no permitido." },
			{ status: 403, headers },
		);
	try {
		if (!request.headers.get("content-type")?.startsWith("application/json"))
			return Response.json(
				{ error: "Se requiere JSON." },
				{ status: 415, headers },
			);
		const raw = await request.text();
		if (raw.length > 2048)
			return Response.json(
				{ error: "Solicitud demasiado grande." },
				{ status: 413, headers },
			);
		const v = schema.parse(JSON.parse(raw)),
			auth = await nativeAuthentication();
		const email =
			(await emailForUserCode(await database(), CURRENT_COMPANY, v.code)) ||
			`${randomUUID()}@unknown.invalid`;
		// Use the provider's HTTP handler so its persistent rate limiting and cookie
		// handling apply exactly as they do to email sign-in. No email is requested in UI.
		const forwarded=new Headers(request.headers);forwarded.delete("content-length");
		return auth.handler(
			new Request(new URL("/api/auth/sign-in/email", request.url), {
				method: "POST",
				headers: forwarded,
				body: JSON.stringify({
					email,
					password: v.password,
					rememberMe: false,
				}),
			}),
		);
	} catch {
		return Response.json(
			{ error: "No se pudo ingresar. Revisa tu usuario y clave." },
			{ status: 422, headers },
		);
	}
}
