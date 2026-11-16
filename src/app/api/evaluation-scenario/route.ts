import { companyRoute } from "../_company-route";
import { principal } from "../_identity";
import { database, globalDatabase } from "@/modules/operations/index.mjs";
import { evaluationCheckpoint, evaluationCoverage, enrichEvaluation } from "@/modules/operations/evaluation-scenario.mjs";
import { ManageError, withActor } from "@/modules/operations/manage.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request:Request) {
	const actor=await principal(request);
	if(!actor?.platform_it || process.env.VERCEL_ENV!=="preview")return Response.json({error:"Acceso no permitido."},{status:403});
	const company=(await (await globalDatabase()).query<{name:string;prefix:string}>("SELECT c.name,l.prefix FROM security_companies c JOIN security_company_logins l ON l.company_id=c.id WHERE c.id=$1 AND c.kind='operator'",[actor.security?.company_id])).rows[0];
	const profile=company?.prefix==='ROJ'?'rojas':company?.prefix==='EVE'?'evergreen':null;
	if(!profile)return Response.json({error:"Selecciona Rojas o Evergreen para esta operación de evaluación."},{status:422});
	try {
		const db=await database();
		if(request.method==='GET') {
			if(new URL(request.url).searchParams.get('export')==='1')return Response.json({company_id:actor.security?.company_id,profile,...await evaluationCheckpoint(db)});
			return Response.json({profile,coverage:await evaluationCoverage(db)});
		}
		if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:"Se requiere JSON."},{status:415});
		const body=await request.text();if(body.length>1000)return Response.json({error:"Solicitud demasiado grande."},{status:413});
		const input=JSON.parse(body);
		return Response.json(await withActor(actor.email,()=>enrichEvaluation(db,{confirmed:input.confirmed===true,expectedDigest:typeof input.expectedDigest==='string'?input.expectedDigest:'',actor:actor.email,environment:process.env.VERCEL_ENV,profile})));
	} catch(e) {
		return Response.json({error:e instanceof ManageError?e.message:"No se pudo completar el escenario; se revierte la transacción."},{status:e instanceof ManageError?e.status:422});
	}
}
export const GET=companyRoute(handle);
export const POST=companyRoute(handle);
