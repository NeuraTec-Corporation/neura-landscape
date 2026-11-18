import { companyRoute } from "../_company-route";
import { authorizedMutation } from "../_identity";
import { database } from "@/modules/operations/index.mjs";
import { savePhoto, readPhoto } from "@/modules/operations/photos.mjs";
import { SurveyError } from "@/modules/operations/survey.mjs";
import { propertyAllowed } from "../_identity";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handleGET(request: Request) {
	const id = new URL(request.url).searchParams.get("id");
	try {
		const row = (
			await (
				await database()
			).query<{ id: string; pathname: string; property_id: string }>(
				"SELECT id,pathname,property_id FROM property_photos WHERE id=$1 AND deleted_at IS NULL",
				[id],
			)
		).rows[0];
		if (!row || !(await propertyAllowed(request, row.property_id)))
			return new Response(null, { status: 404 });
		const body = await readPhoto(await database(), row);
		if (!body) return new Response(null, { status: 404 });
		return new Response(body as BodyInit, {
			headers: {
				"Content-Type": "image/jpeg",
				"Cache-Control": "private, no-store",
				"X-Content-Type-Options": "nosniff",
				"Content-Security-Policy": "default-src 'none'; sandbox",
			},
		});
	} catch {
		return new Response(null, { status: 500 });
	}
}
async function handlePOST(request: Request) {
	const url = new URL(request.url),
		input = Object.fromEntries(url.searchParams);
	if (
		!(await propertyAllowed(request, input.property_id)) ||
		!(await authorizedMutation(request, "survey", input))
	)
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });
	try {
		if (request.headers.get("content-type") !== "application/octet-stream")
			return Response.json(
				{ error: "Se requiere una imagen binaria." },
				{ status: 415 },
			);
		const reader = request.body?.getReader();
		if (!reader) throw new SurveyError("Imagen vacía.");
		const chunks: Uint8Array[] = [];
		let length = 0;
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			length += value.length;
			if (length > 2 * 1024 * 1024) {
				await reader.cancel();
				throw new SurveyError("La imagen supera 2 MB.", 413);
			}
			chunks.push(value);
		}
		return Response.json(
			await savePhoto(await database(), input, Buffer.concat(chunks)),
		);
	} catch (error) {
		return Response.json(
			{
				error:
					error instanceof SurveyError
						? error.message
						: "No se pudo guardar la fotografía.",
			},
			{ status: error instanceof SurveyError ? error.status : 500 },
		);
	}
}

async function handleDELETE(request: Request) {
	try {
		const id = new URL(request.url).searchParams.get("id");
		const db = await database();
		const row = (
			await db.query<{ property_id: string }>(
				"SELECT property_id FROM property_photos WHERE id=$1 AND deleted_at IS NULL",
				[id],
			)
		).rows[0];
		if (
			!row ||
			!(await propertyAllowed(request, row.property_id)) ||
			!(await authorizedMutation(request, "survey", { action: "delete" }))
		)
			return new Response(null, { status: 404 });
		await db.transaction(async (tx) => {
			await tx.query(
				"UPDATE property_photos SET deleted_at=now() WHERE id=$1",
				[id],
			);
			await tx.query(
				"INSERT INTO service_audit(entity,entity_id,event) VALUES('photo',$1,'archived')",
				[id],
			);
		});
		return Response.json({ ok: true });
	} catch {
		return Response.json(
			{ error: "No se pudo retirar la fotografía." },
			{ status: 500 },
		);
	}
}

export const GET = companyRoute(handleGET);
export const POST = companyRoute(handlePOST);
export const DELETE = companyRoute(handleDELETE);
