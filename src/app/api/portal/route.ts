import { companyRoute } from "../_company-route";
import { principal } from "../_identity";
import { capability } from "../_security";
import { database } from "@/modules/operations/index.mjs";
import { customerPortal,assignPortal,portalProperty } from "@/modules/operations/engagement.mjs";
import { readPhoto } from "@/modules/operations/photos.mjs";
import { ManageError,withActor,audit } from "@/modules/operations/manage.mjs";
export const dynamic="force-dynamic";
async function get(request:Request){
 const actor=await principal(request);if(!actor?.security)return Response.json({error:"Acceso no permitido."},{status:403});
 try{
  const db=await database(),url=new URL(request.url),photo=url.searchParams.get("photo");
  if(url.searchParams.get("manage")==="1"){
   if(!capability(actor,"security.update")||!capability(actor,"customers.read"))return Response.json({error:"Acceso no permitido."},{status:403});
   return Response.json({assignments:(await db.query("SELECT a.*,c.name customer_name FROM customer_portal_access a JOIN customers c ON c.id=a.customer_id ORDER BY a.subject_id")).rows,customers:(await db.query("SELECT id,name FROM customers ORDER BY name")).rows,users:(await db.query("SELECT m.email,m.name FROM public.app_members m JOIN public.security_memberships a ON a.subject_id=m.email WHERE a.company_id=$1 AND a.status='active' AND m.status='active' ORDER BY m.name",[actor.security.company_id])).rows,photos:(await db.query("SELECT f.id,f.caption,p.name property_name,(x.photo_id IS NOT NULL) published FROM property_photos f JOIN properties p ON p.id=f.property_id LEFT JOIN portal_photos x ON x.photo_id=f.id WHERE f.deleted_at IS NULL AND p.deleted_at IS NULL ORDER BY p.name,f.id")).rows});
  }
  if(!capability(actor,"portal.read"))return Response.json({error:"Acceso no permitido."},{status:403});
  if(photo){
   const row=(await db.query<{id:string;pathname:string;property_id:string}>("SELECT f.id,f.pathname,f.property_id FROM property_photos f JOIN portal_photos x ON x.photo_id=f.id WHERE f.id=$1 AND f.deleted_at IS NULL",[photo])).rows[0];
   if(!row||!await portalProperty(db,actor.email,row.property_id))return new Response(null,{status:404});
   const body=await readPhoto(db,row);if(!body)return new Response(null,{status:404});
   return new Response(body as BodyInit,{headers:{"Content-Type":"image/jpeg","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"}});
  }
  return Response.json(await customerPortal(db,actor.email));
 }catch(e){return Response.json({error:e instanceof ManageError?e.message:"No se pudo consultar el portal."},{status:e instanceof ManageError?e.status:422});}
}
async function post(request:Request){
 const actor=await principal(request);if(!actor?.security||!capability(actor,"security.update")||!capability(actor,"customers.read"))return Response.json({error:"Acceso no permitido."},{status:403});
 if(!request.headers.get("content-type")?.startsWith("application/json"))return Response.json({error:"Se requiere JSON."},{status:415});
 try{
  const companyId=actor.security.company_id;
  const raw=await request.text();if(raw.length>8000)return Response.json({error:"Solicitud demasiado grande."},{status:413});const input=JSON.parse(raw),db=await database();
  return Response.json(await withActor(actor.email,async()=>{
   if(input.action==="photo"){
    if(!capability(actor,"survey.read")||typeof input.id!=="string"||typeof input.published!=="boolean")throw new ManageError("Acción no permitida.",403);
    return db.transaction(async tx=>{
     if(!(await tx.query("SELECT id FROM property_photos WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[input.id])).rows.length)throw new ManageError("Fotografía no disponible.",404);
     if(input.published)await tx.query("INSERT INTO portal_photos(photo_id) VALUES($1) ON CONFLICT DO NOTHING",[input.id]);else await tx.query("DELETE FROM portal_photos WHERE photo_id=$1",[input.id]);
     await audit(tx,"portal_photo",input.id,input.published?"published":"withdrawn");return {saved:true};
    });
   }
   return assignPortal(db,companyId,input);
  }));
 }catch(e){return Response.json({error:e instanceof ManageError?e.message:"No se pudo guardar el acceso."},{status:e instanceof ManageError?e.status:422});}
}
export const GET=companyRoute(get);
export const POST=companyRoute(post);
