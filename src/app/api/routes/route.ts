import { companyRoute } from "../_company-route";
import { principal } from "../_identity";
import { capability } from "../_security";
import { database } from "@/modules/operations/index.mjs";
import { date,parse } from "@/modules/operations/manage.mjs";
import { z } from "zod";
export const dynamic="force-dynamic";
async function get(request:Request){
 const actor=await principal(request);if(!actor||!capability(actor,"visits.read")||!capability(actor,"workforce.read"))return Response.json({error:"Acceso no permitido."},{status:403});
 try{
  const url=new URL(request.url),f=parse(z.object({day:date}),{day:url.searchParams.get("day")}),db=await database();
  return Response.json({day:f.day,roadOptimization:false,visits:(await db.query("SELECT v.id,v.crew_id,k.name crew_name,v.status,v.scheduled_at,v.route_order,v.planned_minutes,v.travel_minutes,p.name property_name,p.address,p.city,p.region,p.latitude,p.longitude,p.service_hours FROM visits v JOIN contracts c ON c.id=v.contract_id JOIN properties p ON p.id=c.property_id JOIN crews k ON k.id=v.crew_id WHERE v.deleted_at IS NULL AND v.status IN('scheduled','started') AND (v.scheduled_at AT TIME ZONE 'America/New_York')::date=$1::date ORDER BY k.name,v.scheduled_at,v.route_order",[f.day])).rows});
 }catch{return Response.json({error:"Selecciona una fecha válida."},{status:422});}
}
export const GET=companyRoute(get);
