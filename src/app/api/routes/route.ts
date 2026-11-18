import { companyRoute } from "../_company-route";
import { principal } from "../_identity";
import { capability } from "../_security";
import { database, globalDatabase } from "@/modules/operations/index.mjs";
import { reserveMaps, MapsError, limits, point, googleMatrix } from "@/modules/maps/index.mjs";
import { planRoadItinerary } from "@/integrations/road-planning.mjs";
import { accessWindow } from "@/modules/operations/access-window.mjs";
import { date,parse } from "@/modules/operations/manage.mjs";
import { z } from "zod";
export const dynamic="force-dynamic";
const enabled=()=>process.env.LANDSCAPE_MAPS_ENABLED==="true";
const clock=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3,5));
const itinerarySchema=z.object({action:z.literal("plan"),day:date,crew_id:z.string().min(1).max(100),origin:z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)})});
async function get(request:Request){
 const actor=await principal(request);if(!actor||!capability(actor,"visits.read")||!capability(actor,"workforce.read"))return Response.json({error:"Acceso no permitido."},{status:403});
 try{
  const url=new URL(request.url),f=parse(z.object({day:date}),{day:url.searchParams.get("day")}),db=await database();
  return Response.json({day:f.day,roadOptimization:enabled()&&Boolean(process.env.GOOGLE_ROUTES_API_KEY),mapConfigured:enabled()&&Boolean(process.env.GOOGLE_MAPS_BROWSER_KEY),limits,visits:(await db.query("SELECT v.id,v.crew_id,k.name crew_name,v.status,v.scheduled_at,v.route_order,v.planned_minutes,v.travel_minutes,p.name property_name,p.address,p.city,p.region,p.latitude,p.longitude,p.service_hours FROM visits v JOIN contracts c ON c.id=v.contract_id JOIN properties p ON p.id=c.property_id JOIN crews k ON k.id=v.crew_id WHERE v.deleted_at IS NULL AND v.status IN('scheduled','started') AND (v.scheduled_at AT TIME ZONE 'America/New_York')::date=$1::date ORDER BY k.name,v.scheduled_at,v.route_order",[f.day])).rows});
 }catch{return Response.json({error:"Selecciona una fecha válida."},{status:422});}
}
export const GET=companyRoute(get);
async function post(request:Request){
 const actor=await principal(request);if(!actor||!capability(actor,"visits.read")||!capability(actor,"workforce.read"))return Response.json({error:"Acceso no permitido."},{status:403});
 try{
  if(!enabled())throw new MapsError("Google Maps está desactivado.",503);
  if(!request.headers.get("content-type")?.startsWith("application/json"))throw new MapsError("Se requiere JSON.",415);
  const raw=await request.text();if(raw.length>2000)throw new MapsError("Solicitud demasiado grande.",413);
  const input=JSON.parse(raw);
  if(input.action==="load_map"){
   const key=process.env.GOOGLE_MAPS_BROWSER_KEY;if(!key)throw new MapsError("Mapa sin configurar.",503);
   const usage=await reserveMaps(await globalDatabase(),"map");return Response.json({key,usage});
  }
  const v=parse(itinerarySchema,input),db=await database(),key=process.env.GOOGLE_ROUTES_API_KEY;if(!key)throw new MapsError("Google Routes sin configurar.",503);
  const crew=(await db.query<{shift_start:string;shift_end:string;break_minutes:number}>("SELECT shift_start,shift_end,break_minutes FROM crews WHERE id=$1 AND deleted_at IS NULL",[v.crew_id])).rows[0];if(!crew)throw new MapsError("Cuadrilla no disponible.");
  const rows=(await db.query<{id:string;status:string;planned_minutes:number;latitude:number;longitude:number;property_name:string;service_hours:string;policy:boolean;opens_at:string|null;closes_at:string|null;assignment_review_required:boolean}>("SELECT v.id,v.status,v.planned_minutes,v.assignment_review_required,p.name property_name,p.latitude,p.longitude,p.service_hours,(ap.property_id IS NOT NULL) policy,w.opens_at,w.closes_at FROM visits v JOIN contracts c ON c.id=v.contract_id JOIN properties p ON p.id=c.property_id LEFT JOIN property_access_policies ap ON ap.property_id=p.id LEFT JOIN property_access_windows w ON w.property_id=p.id AND w.weekday=extract(dow FROM $2::date)::integer WHERE v.crew_id=$1 AND v.deleted_at IS NULL AND v.status IN('scheduled','started') AND (v.scheduled_at AT TIME ZONE 'America/New_York')::date=$2::date ORDER BY v.id",[v.crew_id,v.day])).rows;
  if(!rows.length||rows.length>14)throw new MapsError("Selecciona un día con entre 1 y 14 visitas de esa cuadrilla. No se omiten paradas.");
  if(rows.some(r=>r.status!=="scheduled"||r.assignment_review_required))throw new MapsError("Hay una visita iniciada o una asignación por revisar. Resuélvela en Agenda antes de proponer otro recorrido.",409);
  const stops=rows.map(r=>{const window=r.policy?(r.opens_at&&r.closes_at?{start:clock(r.opens_at),end:clock(r.closes_at)}:null):accessWindow(r.service_hours);if(!point(r)||!window||!r.planned_minutes)throw new MapsError(`Completa ubicación, duración y horario de acceso de ${r.property_name}.`);return {id:r.id,latitude:r.latitude,longitude:r.longitude,durationMinutes:r.planned_minutes,opensAt:window.start,closesAt:window.end};});
  const usage=await reserveMaps(await globalDatabase(),"matrix",(stops.length+1)**2);
  const plan=await planRoadItinerary({origin:v.origin,stops,startsAt:clock(crew.shift_start),endsAt:clock(crew.shift_end),breakMinutes:crew.break_minutes},{enabled:true,matrix:points=>googleMatrix(points,{key})});
  return Response.json({plan,usage,day:v.day,crew_id:v.crew_id,notice:"Propuesta vial sin tráfico en vivo. Incluye descanso y regreso a la base. No cambia horarios ni asignaciones; revisa personas, recursos y compromisos en Agenda."});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"No se pudo calcular el recorrido."},{status:error instanceof MapsError?error.status:422});}
}
export const POST=companyRoute(post);
