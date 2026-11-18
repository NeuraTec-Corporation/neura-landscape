import { companyRoute } from "../_company-route";
import { database } from "@/modules/operations/index.mjs";
import { principal } from "../_identity";
import { manageAllowed as canManage, mutationAllowed } from "../_security";
import {
	issueOffer,
	acceptOffer,
	closeOffer,
	bindOffer,
	estimateWorkspace,
	saveEstimate,
	saveRate,
	archiveEstimate,
	EstimateError,
} from "@/modules/estimates";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function failure(e: unknown) {
	if (e instanceof EstimateError)
		return Response.json(
			{ error: e.message, fields: e.fields },
			{ status: e.status },
		);
	return Response.json(
		{
			error: "No se pudo completar el presupuesto. Revisa los datos o recarga.",
		},
		{ status: 500 },
	);
}
async function handleGET(request: Request) {
	const actor = await principal(request);
	if (!actor || !canManage(actor, "estimates", "GET"))
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });
	try {
		return Response.json(
			{
				...(await estimateWorkspace(await database())),
				canEdit: canManage(actor, "estimates", "POST"),
			},
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch (e) {
		return failure(e);
	}
}
async function handlePOST(request: Request) {
	const actor = await principal(request);
	if (!actor || !canManage(actor, "estimates", "POST"))
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });
	if (!request.headers.get("content-type")?.startsWith("application/json"))
		return Response.json({ error: "Se requiere JSON." }, { status: 415 });
	try {
		const raw = await request.text();
		if (raw.length > 64000)
			return Response.json(
				{ error: "Solicitud demasiado grande." },
				{ status: 413 },
			);
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			return Response.json({ error: "Solicitud inválida." }, { status: 400 });
		}
		if (!parsed || typeof parsed !== "object")
			return Response.json({ error: "Solicitud inválida." }, { status: 400 });
		const v = parsed as Record<string, unknown>;
		if (!mutationAllowed(actor, "estimates", v))
			return Response.json(
				{ error: "Acceso no permitido para esta acción." },
				{ status: 403 },
			);
		const db = await database(),
			who = actor.email || "protected-evaluation";
		if (v.action === "issue")
			return Response.json(await issueOffer(db, v, who));
		if (v.action === "accept")
			return Response.json(await acceptOffer(db, v, who));
		if (v.action === "withdraw" || v.action === "decline")
			return Response.json(await closeOffer(db, v, who));
		if (v.action === "bind") return Response.json(await bindOffer(db, v, who));
		if (v.action === "rate") return Response.json(await saveRate(db, v, who));
		if (v.action === "save")
			return Response.json(await saveEstimate(db, v, who));
		if (v.action === "archive")
			return Response.json(await archiveEstimate(db, v, who));
		return Response.json({ error: "Acción inválida." }, { status: 400 });
	} catch (e) {
		return failure(e);
	}
}

export const GET = companyRoute(handleGET);
export const POST = companyRoute(handlePOST);
