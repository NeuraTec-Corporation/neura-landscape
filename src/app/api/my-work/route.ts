import { companyRoute } from "../_company-route";
import { capability } from "../_security";
import { assignedWork,assignedVisit,assignedExecutionDatabase } from "@/modules/identity/assignments.mjs";
import { visitList,changeVisit,completeVisit } from "@/modules/operations/visits.mjs";
import { ManageError,withActor } from "@/modules/operations/manage.mjs";
import { redactFinancials } from "../_security-data";
import { principal } from "../_identity";
import { database } from "@/modules/operations/index.mjs";
export const dynamic = "force-dynamic";
async function handleGET(request: Request) {
	const member = await principal(request);
	if (
		!member ||
		!capability(member, "my_work.read") ||
		process.env.APP_AUTH_ENABLED !== "true"
	)
		return Response.json(
			{ error: "Se requiere acceso individual configurado." },
			{ status: 403 },
		);
	try {
		const db=await database(),id=new URL(request.url).searchParams.get("visit_id");
		if(id){
			if(!await assignedVisit(db,member.email,id))return Response.json({error:"Visita no asignada."},{status:403});
			return Response.json(redactFinancials((await visitList(db) as {id:string}[]).find(v=>v.id===id)),{headers:{"Cache-Control":"no-store"}});
		}
		const rows = await assignedWork(db, member.email);
		return Response.json(rows, { headers: { "Cache-Control": "no-store" } });
	} catch {
		return Response.json(
			{ error: "No se pudieron consultar tus asignaciones." },
			{ status: 500 },
		);
	}
}

export const GET = companyRoute(handleGET);
async function handlePOST(request:Request){
	const member=await principal(request);if(!member||!capability(member,"my_work.execute")||process.env.APP_AUTH_ENABLED!=="true")return Response.json({error:"Acceso no permitido."},{status:403});
	if(!request.headers.get("content-type")?.startsWith("application/json"))return Response.json({error:"Se requiere JSON."},{status:415});
	try{
		const raw=await request.text();if(raw.length>64000)return Response.json({error:"Solicitud demasiado grande."},{status:413});
		const input=JSON.parse(raw);if(!["start","complete","cancel"].includes(input.action))return Response.json({error:"Acción no permitida."},{status:403});
		const db=assignedExecutionDatabase(await database(),member.email,String(input.id||""));
		return Response.json(await withActor(member.email,()=>input.action==="complete"?completeVisit(db,input):changeVisit(db,input)));
	}catch(e){return Response.json({error:e instanceof ManageError?e.message:"No se pudo actualizar la visita."},{status:e instanceof ManageError?e.status:422});}
}
export const POST=companyRoute(handlePOST);
