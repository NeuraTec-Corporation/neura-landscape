import { database } from "@/modules/operations/index.mjs";
import { allowedRequest } from "../_access";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
	if (!allowedRequest(request))
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });
	try {
		const rows = (
			await (
				await database()
			).query<{ code: string }>("SELECT code FROM operator_settings WHERE id=1")
		).rows;
		return Response.json(
			{ code: rows[0]?.code ?? process.env.LANDSCAPE_OPERATOR_CODE ?? "" },
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch {
		return Response.json(
			{ error: "No se pudo consultar la empresa." },
			{ status: 500 },
		);
	}
}
export async function POST(request: Request) {
	if (!allowedRequest(request))
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });
	if (!request.headers.get("content-type")?.startsWith("application/json"))
		return Response.json({ error: "Se requiere JSON." }, { status: 415 });
	try {
		const raw = await request.text();
		if (raw.length > 1000) throw new Error();
		const { code } = JSON.parse(raw);
		if (
			typeof code !== "string" ||
			code.length > 40 ||
			!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(code)
		)
			return Response.json(
				{ error: "Usa de 1 a 40 letras A-Z, números o guiones, sin espacios." },
				{ status: 422 },
			);
		await (await database()).transaction(async (tx) => {
			await tx.query(
				"INSERT INTO operator_settings(id,code) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET code=EXCLUDED.code",
				[code],
			);
			await tx.query(
				"INSERT INTO service_audit(entity,entity_id,event) VALUES('operator','1',$1)",
				[`code:${code}`],
			);
		});
		return Response.json({ code });
	} catch {
		return Response.json(
			{ error: "No se pudo guardar la empresa." },
			{ status: 400 },
		);
	}
}
