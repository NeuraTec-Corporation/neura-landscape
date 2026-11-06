import { database } from "@/modules/operations/index.mjs";
import {
	canLoadSamples,
	loadSampleCustomers,
	sampleStatus,
} from "@/modules/operations/sample-data.mjs";
import { ManageError, withActor } from "@/modules/operations/manage.mjs";
import { principal } from "../_identity";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
	const actor = await principal(request);
	if (!actor || !canLoadSamples(actor.role))
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });
	return Response.json(await sampleStatus(await database()), {
		headers: { "Cache-Control": "no-store" },
	});
}
export async function POST(request: Request) {
	const actor = await principal(request);
	if (!actor || !canLoadSamples(actor.role))
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });
	if (!request.headers.get("content-type")?.startsWith("application/json"))
		return Response.json({ error: "Se requiere JSON." }, { status: 415 });
	try {
		const raw = await request.text();
		if (raw.length > 1000)
			return Response.json(
				{ error: "Solicitud demasiado grande." },
				{ status: 413 },
			);
		const v = JSON.parse(raw);
		if (v.action !== "load")
			return Response.json({ error: "Acción no disponible." }, { status: 400 });
		return Response.json(
			await withActor(actor.email || "protected-evaluation", async () =>
				loadSampleCustomers(await database(), {
					confirmed: v.confirmed === true,
					actor: actor.email || "protected-evaluation",
					environment: process.env.VERCEL_ENV,
				}),
			),
		);
	} catch (e) {
		return Response.json(
			{
				error:
					e instanceof ManageError
						? e.message
						: "No se pudo completar la carga de prueba.",
			},
			{ status: e instanceof ManageError ? e.status : 422 },
		);
	}
}
