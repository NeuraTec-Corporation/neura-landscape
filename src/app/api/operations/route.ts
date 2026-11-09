import { companyRoute } from "../_company-route";
import { database, snapshot } from "../../../modules/operations/index.mjs";
import { authorizedRequest as allowedRequest } from "../_identity";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function allowed(request: Request) {
	return allowedRequest(request);
}
async function handleGET(request: Request) {
	if (!(await allowed(request)))
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });
	try {
		return Response.json(await snapshot(await database()), {
			headers: { "Cache-Control": "no-store" },
		});
	} catch {
		return Response.json(
			{ error: "No se pudieron consultar los registros." },
			{ status: 500 },
		);
	}
}
async function handlePOST(request: Request) {
	if (!(await allowed(request)))
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
		if (input.action === "property")
			return Response.json(
				{
					error: "Registra la dirección completa en Propiedades y localidades.",
				},
				{ status: 422 },
			);
		return Response.json(
			{
				error:
					"Usa los módulos actuales de Contratos, Empleados, Cuadrillas y Agenda para registrar operaciones con sus controles.",
			},
			{ status: 422 },
		);
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

export const GET = companyRoute(handleGET);
export const POST = companyRoute(handlePOST);
