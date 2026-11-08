import { authorizedMutation } from "../_identity";
import { database } from "@/modules/operations/index.mjs";
import {
	contracts,
	saveContract,
	removeEntity,
	serviceControl,
} from "@/modules/operations/contracts.mjs";
import { authorizedRequest as allowedRequest } from "../_identity";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
	if (!(await allowedRequest(request)))
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });
	try {
		const month = new URL(request.url).searchParams.get("month");
		return Response.json(
			month !== null
				? await serviceControl(await database(), month)
				: await contracts(await database()),
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch {
		return Response.json(
			{ error: "No se pudo consultar el servicio." },
			{ status: 400 },
		);
	}
}
export async function POST(request: Request) {
	if (!(await allowedRequest(request)))
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });
	if (!request.headers.get("content-type")?.startsWith("application/json"))
		return Response.json({ error: "Se requiere JSON." }, { status: 415 });
	try {
		const raw = await request.text();
		if (raw.length > 12000)
			return Response.json(
				{ error: "Solicitud demasiado grande." },
				{ status: 413 },
			);
		const input = JSON.parse(raw);
		if (!(await authorizedMutation(request, "contracts", input)))
			return Response.json(
				{ error: "Acceso no permitido para esta acción." },
				{ status: 403 },
			);
		return Response.json(
			input.action === "delete"
				? await removeEntity(
						await database(),
						"contract",
						input.id,
						input.revision,
					)
				: await saveContract(await database(), input),
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "";
		const safe =
			/Selecciona|Contrato vinculado|Contrato no|contrato cambió|localidad del|Finaliza|Registro modificado/.test(
				message,
			);
		return Response.json(
			{
				error: safe ? message : "Revisa los campos del contrato y sus valores.",
			},
			{ status: 422 },
		);
	}
}
