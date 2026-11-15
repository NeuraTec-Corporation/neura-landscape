import { companyRoute } from "../_company-route";
import { principal } from "../_identity";
import { capability } from "../_security";
import { database } from "@/modules/operations/index.mjs";
export const dynamic="force-dynamic";
async function get(request:Request){
 const actor=await principal(request);if(!actor||!capability(actor,"settings.read"))return Response.json({error:"Acceso no permitido."},{status:403});
 const db=await database();
 const count=async(sql:string)=>Number((await db.query<{n:number}>(sql)).rows[0].n);
 const [calendar,unpriced,simulated,review,geolocation,maintenance,readyMessages,portalAccounts,uncounted,assets,requiredSkills,qualifications,unreserved]=await Promise.all([
  count("SELECT count(*)::int n FROM working_calendar"),
  count("SELECT count(*)::int n FROM operating_resources WHERE deleted_at IS NULL AND unit_cost_cents IS NULL"),
  count("SELECT count(*)::int n FROM operating_resources WHERE deleted_at IS NULL AND rate_basis='evaluation'"),
  count("SELECT count(*)::int n FROM visits WHERE deleted_at IS NULL AND status='scheduled' AND assignment_review_required"),
  count("SELECT count(*)::int n FROM properties WHERE deleted_at IS NULL AND (latitude IS NULL OR longitude IS NULL)"),
  count("SELECT count(*)::int n FROM equipment_assets WHERE status<>'retired' AND (status='maintenance' OR maintenance_due<=(now() AT TIME ZONE 'America/New_York')::date OR EXISTS(SELECT 1 FROM maintenance_orders o WHERE o.asset_id=equipment_assets.id AND o.status='open' AND o.due_on<=(now() AT TIME ZONE 'America/New_York')::date))"),
  count("SELECT count(*)::int n FROM customer_messages WHERE status='ready'"),
  count("SELECT count(*)::int n FROM customer_portal_access WHERE active=true"),
  count("SELECT count(*)::int n FROM operating_resources r CROSS JOIN warehouses w WHERE r.category='materials' AND r.deleted_at IS NULL AND w.status='active' AND NOT EXISTS(SELECT 1 FROM stock_movements m WHERE m.resource_id=r.id AND m.warehouse_id=w.id)"),
  count("SELECT count(*)::int n FROM equipment_assets WHERE status<>'retired'"),
  count("SELECT count(*)::int n FROM service_qualification_rules WHERE required"),
  count("SELECT count(*)::int n FROM employee_qualifications WHERE retired_at IS NULL AND valid_from<=current_date AND (valid_until IS NULL OR valid_until>=current_date)"),
  count("SELECT count(DISTINCT v.id)::int n FROM visits v JOIN visit_resources r ON r.visit_id=v.id WHERE v.status='scheduled' AND v.deleted_at IS NULL AND r.category='equipment' AND NOT EXISTS(SELECT 1 FROM visit_asset_reservations z JOIN equipment_assets a ON a.id=z.asset_id WHERE z.visit_id=v.id AND a.resource_id=r.resource_id)"),
 ]);
 return Response.json({checked_at:new Date().toISOString(),commercialReady:false,checks:[
  {key:"rates",label:"Tarifas de recursos",status:unpriced?"pending":simulated?"evaluation":"configured",detail:`${unpriced} sin tarifa; ${simulated} con importes simulados. Los costos de evaluación no son tarifas comerciales.`},
  {key:"availability",label:"Disponibilidad y asignaciones",status:calendar&&!review?"configured":"pending",detail:`Calendario ${calendar?"confirmado":"sin confirmar"}; ${review} visitas requieren revisar personal; ${requiredSkills} servicios exigen habilitación y ${qualifications} habilitaciones están vigentes.`},
  {key:"maps",label:"Georreferenciación y carreteras",status:"pending",detail:`${geolocation} localidades sin coordenadas. Navegación externa disponible; optimización vial interna sin activar.`},
  {key:"inventory",label:"Inventario y mantenimiento",status:maintenance||unreserved?"attention":uncounted||!assets?"pending":"configured",detail:`${uncounted} saldos sin inventariar; ${assets} activos registrados; ${maintenance} requieren mantenimiento; ${unreserved} visitas con maquinaria sin reservar. Las reservas y existencias se controlan por almacén.`},
  {key:"communications",label:"Entrega de comunicaciones",status:"pending",detail:`${readyMessages} mensajes preparados. Sin proveedor de envío ni confirmación automática de entrega.`},
  {key:"portal",label:"Portal privado de clientes",status:portalAccounts?"configured":"pending",detail:`${portalAccounts} cuentas vinculadas. Solo se comparten fotografías publicadas expresamente.`},
  {key:"recovery",label:"Recuperación del entorno alojado",status:"pending",detail:"Existe un ejercicio reproducible de recuperación con datos sintéticos. Falta verificar retención, copia independiente, objetos privados y restauración del entorno alojado."},
  {key:"capacity",label:"Capacidad comercial y operación",status:"pending",detail:"Faltan objetivos de disponibilidad y respuesta, prueba de carga representativa y procedimientos de recuperación aprobados. Este panel no certifica preparación comercial."},
 ]});
}
export const GET=companyRoute(get);
