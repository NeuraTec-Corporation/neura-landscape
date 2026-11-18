import {companyRoute} from '../_company-route';
import {principal} from '../_identity';
import {capability} from '../_security';
import {database} from '@/modules/operations/index.mjs';
import {assignmentPolicies,saveQualification,saveAccessPolicy} from '@/modules/operations/qualifications.mjs';
import {ManageError,withActor} from '@/modules/operations/manage.mjs';
export const dynamic='force-dynamic';
async function get(request:Request){
 const actor=await principal(request);if(!actor||!capability(actor,'workforce.read'))return Response.json({error:'Acceso no permitido.'},{status:403});
 const db=await database(),data=await assignmentPolicies(db),canProperties=capability(actor,'properties.read');
 return Response.json({...data as object,...(!canProperties?{policies:[],windows:[]}:{}),employees:(await db.query("SELECT id,first_name||' '||last_name name FROM employees WHERE deleted_at IS NULL ORDER BY last_name,first_name")).rows,properties:canProperties?(await db.query("SELECT id,name FROM properties WHERE deleted_at IS NULL ORDER BY name")).rows:[]});
}
async function post(request:Request){
 const actor=await principal(request);if(!actor)return Response.json({error:'Acceso no permitido.'},{status:403});
 if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'Se requiere JSON.'},{status:415});
 try{
  const raw=await request.text();if(raw.length>16000)return Response.json({error:'Solicitud demasiado grande.'},{status:413});const v=JSON.parse(raw),property=v.action==='property_access';
  if(!capability(actor,property?'properties.update':'workforce.update'))return Response.json({error:'Acceso no permitido.'},{status:403});
  return Response.json(await withActor(actor.email,async()=>property?saveAccessPolicy(await database(),v):saveQualification(await database(),v)));
 }catch(e){return Response.json({error:e instanceof ManageError?e.message:'No se pudo guardar el control.'},{status:e instanceof ManageError?e.status:422});}
}
export const GET=companyRoute(get);
export const POST=companyRoute(post);
