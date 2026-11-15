import { companyRoute } from "../_company-route";
import { principal } from "../_identity";
import { capability } from "../_security";
import { database } from "@/modules/operations/index.mjs";
import { messageList,saveMessage,changeMessage } from "@/modules/operations/engagement.mjs";
import { ManageError,withActor } from "@/modules/operations/manage.mjs";
export const dynamic="force-dynamic";
async function get(request:Request){
 const actor=await principal(request);if(!actor||!capability(actor,"communications.read"))return Response.json({error:"Acceso no permitido."},{status:403});
 const db=await database();return Response.json({messages:await messageList(db),customers:(await db.query("SELECT id,name FROM customers ORDER BY name")).rows,automaticDelivery:false});
}
async function post(request:Request){
 const actor=await principal(request);if(!actor)return Response.json({error:"Acceso no permitido."},{status:403});
 if(!request.headers.get("content-type")?.startsWith("application/json"))return Response.json({error:"Se requiere JSON."},{status:415});
 try{
  const raw=await request.text();if(raw.length>16000)return Response.json({error:"Solicitud demasiado grande."},{status:413});
  const input=JSON.parse(raw),grant=input.id?"communications.update":"communications.create";
  if(!capability(actor,grant))return Response.json({error:"Acceso no permitido."},{status:403});
  return Response.json(await withActor(actor.email,async()=>input.action==="save"?saveMessage(await database(),input):changeMessage(await database(),input)));
 }catch(e){return Response.json({error:e instanceof ManageError?e.message:"No se pudo guardar el mensaje."},{status:e instanceof ManageError?e.status:422});}
}
export const GET=companyRoute(get);
export const POST=companyRoute(post);
