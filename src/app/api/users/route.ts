import { identityReadiness } from "@/modules/identity/configuration.mjs";
import { principal } from "../_identity";
import { database } from "@/modules/operations/index.mjs";
import { z } from "zod";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const schema = z.object({
	email: z
		.email()
		.max(254)
		.transform((v) => v.toLowerCase()),
	name: z.string().trim().min(1).max(150),
	role: z.enum([
		"it_admin",
		"owner",
		"manager",
		"crew_lead",
		"worker",
		"finance",
	]),
	status: z.enum(["active", "disabled"]),
	revision: z.number().int().positive().optional(),
	crew_ids: z.array(z.string().min(1)).max(50),
});
export async function GET(request: Request) {
	const member = await principal(request);
	if (!member || !["it_admin", "owner"].includes(member.role))
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });
	try {
		const db = await database();
		const users = (
			await db.query(
				"SELECT m.*,coalesce((SELECT json_agg(crew_id) FROM app_crew_members c WHERE c.email=m.email),'[]'::json) crew_ids FROM app_members m ORDER BY name",
			)
		).rows;
		const crews = (await db.query("SELECT id,name FROM crews ORDER BY name"))
			.rows;
		return Response.json(
			{ users, crews, enabled: process.env.APP_AUTH_ENABLED === "true", readiness:identityReadiness() },
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch {
		return Response.json(
			{ error: "No se pudieron consultar usuarios." },
			{ status: 500 },
		);
	}
}
export async function POST(request: Request) {
	const actor = await principal(request);
	if (!actor || !["it_admin", "owner"].includes(actor.role))
		return Response.json({ error: "Acceso no permitido." }, { status: 403 });
	if (!request.headers.get("content-type")?.startsWith("application/json"))
		return Response.json({ error: "Se requiere JSON." }, { status: 415 });
	try {
		const raw = await request.text();
		if (raw.length > 12000) throw new Error();
		const v = schema.parse(JSON.parse(raw));
 if(v.email===process.env.LANDSCAPE_IT_ADMIN_EMAIL?.toLowerCase()&&(v.role!=='it_admin'||v.status!=='active'))return Response.json({error:'El administrador inicial de TI debe conservar su acceso administrativo activo.'},{status:409});
		if (
			v.email === actor.email &&
			(v.role !== actor.role || v.status !== "active")
		)
			return Response.json(
				{ error: "No puedes deshabilitar ni cambiar tu propio rol." },
				{ status: 409 },
			);
		await (await database()).transaction(async (tx) => {
			const old = (
				await tx.query<{ role: string; revision: number }>(
					"SELECT role,revision FROM app_members WHERE email=$1 FOR UPDATE",
					[v.email],
				)
			).rows[0];
			if (
				actor.role !== "it_admin" &&
				(v.role === "it_admin" || old?.role === "it_admin")
			)
				throw new Error();
			if (old && old.revision !== v.revision) throw new Error();
			if (old)
				await tx.query(
					"UPDATE app_members SET name=$2,role=$3,status=$4,revision=revision+1 WHERE email=$1",
					[v.email, v.name, v.role, v.status],
				);
			else
				await tx.query(
					"INSERT INTO app_members(email,name,role,status) VALUES($1,$2,$3,$4)",
					[v.email, v.name, v.role, v.status],
				);
			await tx.query("DELETE FROM app_crew_members WHERE email=$1", [v.email]);
			for (const crew of new Set(v.crew_ids))
				await tx.query("INSERT INTO app_crew_members VALUES($1,$2)", [
					v.email,
					crew,
				]);
			await tx.query(
				"INSERT INTO service_audit(entity,entity_id,event) VALUES('member',$1,$2)",
				[v.email, `updated:${actor.email || "protected-evaluation"}`],
			);
		});
		return Response.json({ ok: true });
	} catch {
		return Response.json(
			{
				error:
					"Revisa los datos, permisos, cuadrillas y revisión del usuario. Recarga si hubo otra edición.",
			},
			{ status: 422 },
		);
	}
}
