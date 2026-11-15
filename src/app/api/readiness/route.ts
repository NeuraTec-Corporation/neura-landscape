import { companyRoute } from "../_company-route";
import { principal } from "../_identity";
import { capability } from "../_security";
import { database } from "@/modules/operations/index.mjs";
export const dynamic="force-dynamic";
async function get(request:Request){
 const actor=await principal(request);if(!actor||!capability(actor,"settings.read"))return Response.json({error:"Acceso no permitido."},{status:403});
 const db=await database();
 const count=async(sql:string)=>Number((await db.query<{n:number}>(sql)).rows[0].n);
 const [calendar,unpriced,simulated,review,geolocation,maintenance,readyMessages,portalAccounts]=await Promise.all([
  count("SELECT count(*)::int n FROM working_calendar"),
  count("SELECT count(*)::int n FROM operating_resources WHERE deleted_at IS NULL AND unit_cost_cents IS NULL"),
  count("SELECT count(*)::int n FROM operating_resources WHERE deleted_at IS NULL AND rate_basis='evaluation'"),
  count("SELECT count(*)::int n FROM visits WHERE deleted_at IS NULL AND status='scheduled' AND assignment_review_required"),
  count("SELECT count(*)::int n FROM properties WHERE deleted_at IS NULL AND (latitude IS NULL OR longitude IS NULL)"),
  count("SELECT count(*)::int n FROM equipment_assets WHERE status<>'retired' AND (status='maintenance' OR maintenance_due<=current_date)"),
  count("SELECT count(*)::int n FROM customer_messages WHERE status='ready'"),
  count("SELECT count(*)::int n FROM customer_portal_access WHERE active=true"),
 ]);
 return Response.json({checked_at:new Date().toISOString(),commercialReady:false,checks:[
  {key:"rates",label:"Tarifas de recursos",status:unpriced?"pending":simulated?"evaluation":"configured",detail:`${unpriced} sin tarifa; ${simulated} con importes simulados. Los costos de evaluación no son tarifas comerciales.`},
  {key:"availability",label:"Disponibilidad y asignaciones",status:calendar&&!review?"configured":"pending",detail:`Calendario ${calendar?"confirmado":"sin confirmar"}; ${review} visitas requieren revisar personal.`},
  {key:"maps",label:"Georreferenciación y carreteras",status:"pending",detail:`${geolocation} localidades sin coordenadas. Navegación externa disponible; optimización vial interna sin activar.`},
  {key:"inventory",label:"Inventario y mantenimiento",status:maintenance?"attention":"configured",detail:`${maintenance} activos requieren mantenimiento. Las existencias reflejan únicamente movimientos registrados.`},
  {key:"communications",label:"Entrega de comunicaciones",status:"pending",detail:`${readyMessages} mensajes preparados. Sin proveedor de envío ni confirmación automática de entrega.`},
  {key:"portal",label:"Portal privado de clientes",status:portalAccounts?"configured":"pending",detail:`${portalAccounts} cuentas vinculadas. Solo se comparten fotografías publicadas expresamente.`},
  {key:"recovery",label:"Recuperación del entorno alojado",status:"pending",detail:"Existe un ejercicio reproducible de recuperación con datos sintéticos. Falta verificar retención, copia independiente, objetos privados y restauración del entorno alojado."},
  {key:"capacity",label:"Capacidad comercial y operación",status:"pending",detail:"Faltan objetivos de disponibilidad y respuesta, prueba de carga representativa y procedimientos de recuperación aprobados. Este panel no certifica preparación comercial."},
 ]});
}
export const GET=companyRoute(get);
