import { database } from "@/modules/operations/index.mjs";
import { principal } from "../_identity";
import { ManageError, withActor } from "@/modules/operations/manage.mjs";
import {
	catalogOptions,
	categories,
	saveOption,
} from "@/modules/operations/catalog.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
	const actor = await principal(request);
	if (!actor)
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });
	try {
		return Response.json(
			{
				options: await catalogOptions(await database()),
				categories,
				role: actor.role,
				canEdit: ["it_admin", "owner", "manager"].includes(actor.role),
			},
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch {
		return Response.json(
			{ error: "No se pudieron consultar los catálogos." },
			{ status: 500 },
		);
	}
}
export async function POST(request: Request) {
	const actor = await principal(request);
	if (!actor || !["it_admin", "owner", "manager"].includes(actor.role))
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
		return Response.json(
			await withActor(actor.email || "protected-evaluation", async () =>
				saveOption(await database(), input),
			),
		);
	} catch (error) {
		return Response.json(
			{
				error:
					error instanceof ManageError
						? error.message
						: "No se pudo guardar. Revisa si el nombre ya existe.",
				fields: error instanceof ManageError ? error.fields : {},
			},
			{ status: error instanceof ManageError ? error.status : 422 },
		);
	}
}
