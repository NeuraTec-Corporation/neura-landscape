import { removeEntity } from "@/modules/operations/contracts.mjs";

import {
	database,
	listProperties,
	saveProperty,
	PropertyError,
} from "../../../modules/operations/index.mjs";

import { authorizedRequest as allowedRequest } from "../_identity";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

function failure(error: unknown) {
	if (error instanceof PropertyError)
		return Response.json(
			{ error: error.message, fields: error.fields },

			{ status: error.status },
		);

	if (
		error instanceof Error &&
		/Primero elimina|Registro modificado/.test(error.message)
	)
		return Response.json({ error: error.message }, { status: 409 });

	return Response.json(
		{ error: "No se pudo completar la operación de localidades." },

		{ status: 500 },
	);
}

export async function GET(request: Request) {
	if (!(await allowedRequest(request)))
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });

	try {
		return Response.json(
			await listProperties(
				await database(),

				new URL(request.url).searchParams.get("customer_id") ?? undefined,
			),

			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch (error) {
		return failure(error);
	}
}

export async function POST(request: Request) {
	if (!(await allowedRequest(request)))
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });

	if (!request.headers.get("content-type")?.startsWith("application/json"))
		return Response.json({ error: "Se requiere JSON." }, { status: 415 });

	try {
		const raw = await request.text();

		if (raw.length > 20000)
			return Response.json(
				{ error: "Solicitud demasiado grande." },

				{ status: 413 },
			);

		const input = JSON.parse(raw);

		return Response.json(
			input.action === "delete"
				? await removeEntity(
						await database(),
						"property",
						input.id,
						input.revision,
					)
				: await saveProperty(await database(), input),
			{
				status: 201,
			},
		);
	} catch (error) {
		if (error instanceof SyntaxError)
			return Response.json({ error: "Solicitud inválida." }, { status: 400 });

		return failure(error);
	}
}
