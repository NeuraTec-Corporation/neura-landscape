import { database } from "@/modules/operations/index.mjs";
import { principal } from "../_identity";
import { ManageError, withActor } from "@/modules/operations/manage.mjs";
import {
	workforce,
	saveEmployee,
	saveCrew,
	removeWorkforce,
} from "@/modules/operations/workforce.mjs";
import {
	visitList,
	saveVisit,
	changeVisit,
	completeVisit,
	saveVisitCosts,
} from "@/modules/operations/visits.mjs";
import {
	financeList,
	saveInvoice,
	changeInvoice,
	savePayment,
	reversePayment,
} from "@/modules/operations/finance.mjs";
import { managementDashboard } from "@/modules/operations/dashboard.mjs";
import { authConfigured, canManage } from "@/modules/identity/auth.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function failure(error: unknown) {
	if (error instanceof ManageError)
		return Response.json(
			{ error: error.message, fields: error.fields },
			{ status: error.status },
		);
	if (error instanceof SyntaxError)
		return Response.json({ error: "Solicitud inválida." }, { status: 400 });
	return Response.json(
		{
			error:
				"No se pudo completar la operación. Revisa los datos y relaciones.",
		},
		{ status: 422 },
	);
}
export async function GET(request: Request) {
	const url = new URL(request.url),
		area = url.searchParams.get("area") || "",
		actor = await principal(request);
	if (!actor || !canManage(actor.role, area, "GET"))
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });
	try {
		const db = await database();
		let data: unknown;
		if (area === "workforce") data = await workforce(db);
		else if (area === "visits" || area === "costs") data = await visitList(db);
		else if (area === "finance")
			data = {
				...((await financeList(db)) as object),
				canEdit: canManage(actor.role, area, "POST"),
			};
		else if (area === "dashboard")
			data = await managementDashboard(
				db,
				Object.fromEntries(
					[...url.searchParams].filter(([key]) => key !== "area"),
				),
			);
		else
			data = {
				database: process.env.DATABASE_URL ? "cloud" : "local",
				identityConfigured: authConfigured(),
				identityEnabled: process.env.APP_AUTH_ENABLED === "true",
				placesConfigured: Boolean(process.env.GOOGLE_PLACES_API_KEY),
				routingConfigured: false,
				mediaBackend:
					process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN
						? "private_blob"
						: "private_database",
			};
		return Response.json(data, { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		return failure(error);
	}
}
export async function POST(request: Request) {
	const area = new URL(request.url).searchParams.get("area") || "",
		actor = await principal(request);
	if (!actor || !canManage(actor.role, area, "POST"))
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
		const input = JSON.parse(raw);
		const result = await withActor(
			actor.email || "protected-evaluation",
			async () => {
				const db = await database();
				if (area === "workforce") {
					if (input.entity === "employee")
						return input.action === "delete"
							? removeWorkforce(db, "employee", input)
							: saveEmployee(db, input);
					if (input.entity === "crew")
						return input.action === "delete"
							? removeWorkforce(db, "crew", input)
							: saveCrew(db, input);
				}
				if (area === "visits") {
					if (input.action === "save") return saveVisit(db, input);
					if (input.action === "complete") return completeVisit(db, input);
					return changeVisit(db, input);
				}
				if (area === "costs") return saveVisitCosts(db, input);
				if (area === "finance") {
					if (input.action === "save") return saveInvoice(db, input);
					if (input.action === "payment") return savePayment(db, input);
					if (input.action === "reverse_payment")
						return reversePayment(db, input);
					return changeInvoice(db, input);
				}
				throw new ManageError("Operación inválida.");
			},
		);
		return Response.json(result);
	} catch (error) {
		return failure(error);
	}
}
