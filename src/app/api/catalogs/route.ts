import { companyRoute } from "../_company-route";
import { capability } from "../_security";
import { sectionPermission } from "../../_security-manifest.mjs";
import { database } from "@/modules/operations/index.mjs";
import { principal } from "../_identity";
import { ManageError, withActor } from "@/modules/operations/manage.mjs";
import {
	catalogOptions,
	catalogMetadata,
	canManageCatalog,
	saveOption,
} from "@/modules/operations/catalog.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handleGET(request: Request) {
	const actor = await principal(request);
	if (!actor)
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });
	try {
		const db = await database(),
			metadata = await catalogMetadata(db);
		return Response.json(
			{
				options: await catalogOptions(db),
				...metadata,
				role: actor.role,
				grants: actor.security?.grants || [],
				allowedSections: Object.entries(sectionPermission)
					.filter(([, resource]) => capability(actor, `${resource}.read`))
					.map(([section]) => section),
				canEdit: capability(actor, "catalogs.update"),
				manageableCategories: Object.keys(metadata.categories).filter(
					(c) =>
						capability(actor, "catalogs.update") &&
						canManageCatalog(
							capability(actor, "security.update") ? "owner" : "manager",
							c,
						),
				),
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
async function handlePOST(request: Request) {
	const actor = await principal(request);
	if (!actor || !capability(actor, "catalogs.update"))
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
		if (
			!canManageCatalog(
				capability(actor, "security.update") ? "owner" : "manager",
				input.category,
			)
		)
			return Response.json({ error: "Acceso no permitido." }, { status: 403 });
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

export const GET = companyRoute(handleGET);
export const POST = companyRoute(handlePOST);
