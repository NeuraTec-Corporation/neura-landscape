import {
	database,
	customerPropertyCounts,
} from "../../../modules/operations/index.mjs";
import {
	listCustomers,
	getCustomer,
	saveCustomer,
	customerReminder,
	CustomerError,
} from "../../../modules/customers/index.mjs";
import { authorizedRequest as allowedRequest } from "../_identity";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
	if (!(await allowedRequest(request)))
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });
	try {
		const id = new URL(request.url).searchParams.get("id");
		const db = await database();
		if (id)
			return Response.json(await getCustomer(db, id), {
				headers: { "Cache-Control": "no-store" },
			});
		const [items, counts] = await Promise.all([
			listCustomers(db),
			customerPropertyCounts(db),
		]);
		const byCustomer = new Map(
			counts.map((row) => [row.customer_id, row.property_count]),
		);
		return Response.json(
			items.map((row) => ({
				...row,
				property_count: byCustomer.get(row.id) ?? 0,
			})),
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
		if (raw.length > 65000)
			return Response.json(
				{ error: "Solicitud demasiado grande." },
				{ status: 413 },
			);
		const input = JSON.parse(raw);
		return Response.json(
			input.action === "reminder"
				? await customerReminder(await database(), input)
				: await saveCustomer(await database(), input),
			{ status: 201 },
		);
	} catch (error) {
		return failure(error);
	}
}
function failure(error: unknown) {
	if (error instanceof CustomerError)
		return Response.json(
			{ error: error.message, fields: error.fields },
			{ status: error.status },
		);
	return Response.json(
		{
			error:
				"No se pudo completar la operación. Revisa la conexión y los datos.",
		},
		{ status: 500 },
	);
}
