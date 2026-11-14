import { companyRoute } from "../_company-route";
import { principal } from "../_identity";
import { capability } from "../_security";
import { redactFinancials } from "../_security-data";
import { database } from "@/modules/operations/index.mjs";
import { assignedVisit,assignedExecutionDatabase } from "@/modules/identity/assignments.mjs";
import { ManageError,withActor } from "@/modules/operations/manage.mjs";
import { resourceCatalog,resourceReport,saveResource,removeResource,saveResourcePlan,saveResourceUsage,prepareResourceCatalog,saveResourceRates } from "@/modules/operations/resources.mjs";
export const dynamic="force-dynamic";
function failure(e:unknown){return Response.json({error:e instanceof ManageError?e.message:"No se pudo completar la operación de recursos."},{status:e instanceof ManageError?e.status:422});}
async function get(request:Request){
	const member=await principal(request);if(!member)return Response.json({error:"Acceso no permitido."},{status:403});
	try{
		const db=await database(),id=new URL(request.url).searchParams.get("visit_id"),assigned=member.security?.scope==="assigned";
		if(assigned ? !id||!capability(member,"my_work.read")||!await assignedVisit(db,member.email,id) : !capability(member,"visits.read")&&!capability(member,"costs.read"))return Response.json({error:"Acceso no permitido."},{status:403});
		const financial=capability(member,"costs.read"),catalog=assigned?[]:await resourceCatalog(db);
		return Response.json({catalog:financial?catalog:redactFinancials(catalog),report:id?await resourceReport(db,id,financial):null,canPlan:!assigned&&capability(member,"visits.update"),canReport:assigned?capability(member,"my_work.execute"):capability(member,"visits.execute")||capability(member,"costs.update"),canPrice:!assigned&&capability(member,"costs.update"),financial});
	}catch(e){return failure(e);}
}
async function post(request:Request){
	const member=await principal(request);if(!member)return Response.json({error:"Acceso no permitido."},{status:403});
	if(!request.headers.get("content-type")?.startsWith("application/json"))return Response.json({error:"Se requiere JSON."},{status:415});
	try{
		const raw=await request.text();if(raw.length>64000)return Response.json({error:"Solicitud demasiado grande."},{status:413});
		const input=JSON.parse(raw),db=await database(),assigned=member.security?.scope==="assigned",canPrice=!assigned&&capability(member,"costs.update");
		if(assigned&&(!input.id||!await assignedVisit(db,member.email,input.id)||input.action!=="actual"||!capability(member,"my_work.execute")))return Response.json({error:"Acceso no permitido."},{status:403});
		return await withActor(member.email||"protected-evaluation",async()=>{
			if(input.action==="actual"&&(assigned||capability(member,"visits.execute")||canPrice))return Response.json(await saveResourceUsage(assigned?assignedExecutionDatabase(db,member.email,input.id):db,input,{allowPrices:canPrice}));
			if(!assigned&&input.action==="plan"&&capability(member,"visits.update"))return Response.json(await saveResourcePlan(db,input));
			if(canPrice&&input.action==="save")return Response.json(await saveResource(db,input));
			if(canPrice&&input.action==="prepare_catalog")return Response.json(await prepareResourceCatalog(db));
			if(canPrice&&input.action==="rates")return Response.json(await saveResourceRates(db,input));
			if(canPrice&&input.action==="delete")return Response.json(await removeResource(db,input));
			return Response.json({error:"Acceso no permitido."},{status:403});
		});
	}catch(e){return failure(e);}
}
export const GET=companyRoute(get);
export const POST=companyRoute(post);
