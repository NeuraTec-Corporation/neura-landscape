import {
	database,
	snapshot,
	mutate,
} from "../../../modules/operations/index.mjs";
import { allowedRequest } from "../_access";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function allowed(request: Request) {
	return allowedRequest(request);
}
export async function GET(request: Request) {
	if (!allowed(request))
		return Response.json(
			{ error: "Prototipo local: acceso solo desde este equipo." },
			{ status: 403 },
		);
	try {
		return Response.json(await snapshot(await database()), {
			headers: { "Cache-Control": "no-store" },
		});
	} catch {
		return Response.json(
			{ error: "No se pudo abrir la base local." },
			{ status: 500 },
		);
	}
}
export async function POST(request: Request) {
	if (!allowed(request))
		return Response.json({ error: "Origen no permitido." }, { status: 403 });
	if (!request.headers.get("content-type")?.startsWith("application/json"))
		return Response.json({ error: "Se requiere JSON." }, { status: 415 });
	const body = await request.text();
	if (body.length > 10000)
		return Response.json(
			{ error: "Solicitud demasiado grande." },
			{ status: 413 },
		);
	try {
		const input = JSON.parse(body);
		if (!input || typeof input !== "object" || Array.isArray(input))
			throw new Error("Solicitud inválida.");
		if (input.action === "customer")
			return Response.json(
				{ error: "Crea el expediente completo en Clientes." },
				{ status: 422 },
			);
		return Response.json(await mutate(await database(), input), {
			status: 201,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "";
		const safe =
			/requerid|rango|decimales|positiv|inválid|programada|Inicia|desconocida/.test(
				message,
			);
		return Response.json(
			{
				error: safe
					? message
					: "Revisa las relaciones y los valores del formulario.",
			},
			{ status: 400 },
		);
	}
}
