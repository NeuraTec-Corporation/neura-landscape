import { authorizedMutation } from "../_identity";
import { database } from "@/modules/operations/index.mjs";
import {
	survey,
	saveSurveyItem,
	deleteSurveyItem,
	SurveyError,
} from "@/modules/operations/survey.mjs";
import { ManageError } from "@/modules/operations/manage.mjs";
import { uploadReady } from "@/modules/operations/photos.mjs";
import { propertyAllowed } from "../_identity";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
	const id = new URL(request.url).searchParams.get("property_id") || "";
	if (!(await propertyAllowed(request, id)))
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });
	try {
		return Response.json(
			{
				...((await survey(await database(), id)) as object),
				uploadReady: uploadReady(),
			},
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch (error) {
		return failure(error);
	}
}
function failure(error: unknown) {
	if (error instanceof ManageError)
		return Response.json(
			{ error: error.message, fields: error.fields },
			{ status: error.status },
		);
	return Response.json(
		{
			fields: error instanceof SurveyError ? error.fields : {},
			error:
				error instanceof SurveyError
					? error.message
					: "No se pudo guardar el levantamiento.",
		},
		{ status: error instanceof SurveyError ? error.status : 500 },
	);
}
export async function POST(request: Request) {
	if (!request.headers.get("content-type")?.startsWith("application/json"))
		return Response.json({ error: "Se requiere JSON." }, { status: 415 });
	try {
		const raw = await request.text();
		if (raw.length > 14000)
			return Response.json(
				{ error: "Solicitud demasiado grande." },
				{ status: 413 },
			);
		const input = JSON.parse(raw);
		if (!(await authorizedMutation(request, "survey", input)))
			return Response.json(
				{ error: "Acceso no permitido para esta acción." },
				{ status: 403 },
			);
		if (!(await propertyAllowed(request, input.property_id)))
			return Response.json({ error: "Acceso no permitido." }, { status: 403 });
		return Response.json(
			input.action === "delete"
				? await deleteSurveyItem(await database(), input.entity, input)
				: await saveSurveyItem(await database(), input.entity, input),
		);
	} catch (error) {
		return failure(error);
	}
}
