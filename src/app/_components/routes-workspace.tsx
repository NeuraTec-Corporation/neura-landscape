"use client";
import { useEffect,useState } from "react";
import { today } from "./management-shared";
import { PagedCollection } from "./paged-collection";
import { GoogleRouteMap } from "./google-route-map";
import type { planRoadItinerary } from "@/integrations/road-planning.mjs";
type RoadPlan=Awaited<ReturnType<typeof planRoadItinerary>>;
type Stop={id:string;crew_id:string;crew_name:string;scheduled_at:string;property_name:string;address:string;city:string;region:string;latitude:number|null;longitude:number|null;planned_minutes:number;travel_minutes:number;service_hours:string};
const coordinates=(s:Stop)=>s.latitude!==null&&s.longitude!==null?`${s.latitude},${s.longitude}`:null;
export function RoutesWorkspace(){
 const [mapConfigured,setMapConfigured]=useState(false),[roadConfigured,setRoadConfigured]=useState(false),[base,setBase]=useState({latitude:"",longitude:""}),[plan,setPlan]=useState<RoadPlan|null>(null),[planning,setPlanning]=useState(false);
 const [day,setDay]=useState(today),[crew,setCrew]=useState(""),[origin,setOrigin]=useState(""),[visits,setVisits]=useState<Stop[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(false);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setPlan(null);setError("");fetch(`/api/routes?day=${encodeURIComponent(day)}`,{cache:"no-store",signal:controller.signal}).then(async r=>{const v=await r.json();if(!r.ok)throw Error(v.error);setVisits(v.visits);setMapConfigured(v.mapConfigured);setRoadConfigured(v.roadOptimization);}).catch(e=>{if(e.name!=="AbortError"){setVisits([]);setError(e.message);}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[day]);
 const crews=[...new Map(visits.map(v=>[v.crew_id,{id:v.crew_id,name:v.crew_name}])).values()],stops=visits.filter(v=>v.crew_id===crew),missing=stops.filter(s=>!coordinates(s));
 // Mobile Maps URLs support at most three intermediate waypoints; do not omit stops silently.
 const ordered=plan&&!plan.blocked?plan.stops.map(p=>stops.find(s=>s.id===p.id)).filter((s):s is Stop=>Boolean(s)):stops;
 const legs=Array.from({length:Math.ceil(ordered.length/4)},(_,i)=>ordered.slice(i*4,i*4+4));
 function url(items:Stop[],index:number){const p=new URLSearchParams({api:"1",travelmode:"driving",destination:coordinates(items.at(-1) as Stop)||""}),start=index?coordinates(ordered[index*4-1]):plan?`${base.latitude},${base.longitude}`:origin.trim();if(start)p.set("origin",start);if(items.length>1)p.set("waypoints",items.slice(0,-1).map(s=>coordinates(s)).join("|"));return `https://www.google.com/maps/dir/?${p}`;}
 async function propose(){setPlanning(true);setPlan(null);setError("");try{const r=await fetch("/api/routes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"plan",day,crew_id:crew,origin:{latitude:Number(base.latitude),longitude:Number(base.longitude)}})}),data=await r.json();if(!r.ok)throw Error(data.error);setPlan(data.plan);}catch(e){setError(e instanceof Error?e.message:"No se pudo calcular.");}finally{setPlanning(false);}}
 const time=(n:number)=>`${Math.floor(n/60).toString().padStart(2,"0")}:${Math.ceil(n%60).toString().padStart(2,"0")}`;
 return <div className="manage-workspace">
  <section className="panel"><h2>Recorrido diario de cuadrillas</h2><p>Visualiza las paradas y calcula una propuesta usando tiempos por carretera, horarios de acceso, duración del servicio y regreso a la base.</p>
   <div className="manage-grid"><label>Fecha de servicio<input type="date" disabled={planning} value={day} onChange={e=>{setPlan(null);setDay(e.target.value);}}/></label><label>Cuadrilla<select disabled={planning} value={crew} onChange={e=>{setPlan(null);setCrew(e.target.value);}}><option value="">Selecciona…</option>{crews.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>
   {loading?<p role="status">Consultando recorrido…</p>:null}{error?<p role="alert" className="notice error">{error}</p>:null}
   {missing.length?<p role="alert">{missing.length} paradas sin coordenadas. Completa su ubicación en Propiedades para calcular el recorrido.</p>:null}
   <details><summary>Base y cálculo por carretera</summary><p>Coordenadas de salida y retorno. El turno y el descanso se toman de la cuadrilla. Las horas se expresan en America/New_York.</p><div className="manage-grid">
    <label>Latitud de la base<input type="number" disabled={planning} step="any" min="-90" max="90" value={base.latitude} onChange={e=>{setPlan(null);setBase({...base,latitude:e.target.value});}}/></label>
    <label>Longitud de la base<input type="number" disabled={planning} step="any" min="-180" max="180" value={base.longitude} onChange={e=>{setPlan(null);setBase({...base,longitude:e.target.value});}}/></label></div>
    <button type="button" disabled={planning||loading||!roadConfigured||!crew||!stops.length||missing.length>0||!base.latitude||!base.longitude} onClick={propose}>{planning?"Calculando…":"Proponer recorrido por carretera"}</button>
    <small>Máximo 14 visitas por cálculo. Una base y 5 visitas consumen 36 elementos del límite diario de 250, compartido por las empresas. Sin tráfico en vivo; no garantiza el óptimo global. La propuesta no modifica la agenda.</small>
   </details>
  </section>
  <GoogleRouteMap stops={stops} configured={mapConfigured}/>
  {plan&&!plan.blocked?<section className="panel"><h2>Propuesta de recorrido</h2><div className="manage-grid"><p><strong>{plan.stops.length} de {stops.length}</strong><br/>Visitas que caben en el turno</p><p><strong>{Math.ceil(plan.totalTravelMinutes??0)} min</strong><br/>Traslado con retorno</p><p><strong>{time(plan.endsAt??0)}</strong><br/>Regreso previsto a la base</p></div>
   <ol>{plan.stops.map(p=><li key={p.id}><strong>{stops.find(s=>s.id===p.id)?.property_name}</strong> · {time(p.startMinutes)}–{time(p.endMinutes)} · {Math.ceil(p.travelMinutes)} min de traslado{p.waitMinutes>0?` · ${Math.ceil(p.waitMinutes)} min de espera`:""}</li>)}</ol>
   {plan.unplaced?.length?<div className="notice error"><h3>Visitas que no caben</h3>{plan.unplaced.map(p=><p key={p.id}>{stops.find(s=>s.id===p.id)?.property_name}: {p.reason}</p>)}</div>:null}
   <p>Revisa esta propuesta en Agenda antes de cambiar compromisos, personas o recursos. Los enlaces siguientes abren solo las visitas incluidas; las que no caben permanecen señaladas arriba.</p>
  </section>:null}
  <section className="panel"><h2>Navegación</h2><label>Punto de salida para navegación manual (opcional)<input value={origin} maxLength={200} onChange={e=>setOrigin(e.target.value)} placeholder="Dirección de la base; vacío para elegir en Maps"/></label>
   {ordered.length&&!missing.length?<div className="manage-actions">{legs.map((leg,i)=><a key={leg[0].id} className="button-link" target="_blank" rel="noopener noreferrer" href={url(leg,i)}>Abrir tramo {i+1} · paradas {i*4+1}–{i*4+leg.length}</a>)}{plan?<a className="button-link" href={`https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${encodeURIComponent(coordinates(ordered.at(-1) as Stop)||"")}&destination=${encodeURIComponent(`${base.latitude},${base.longitude}`)}`} target="_blank" rel="noopener noreferrer">Regresar a la base</a>:null}</div>:null}
   <small>Las ubicaciones se envían a Google al cargar el mapa, calcular el recorrido o abrir la navegación. Sin propuesta, se conserva el orden programado.</small></section>
  <section className="panel"><PagedCollection label="Paradas programadas" table={<table><thead><tr><th>Parada</th><th>Hora programada</th><th>Localidad</th><th>Trabajo</th><th>Traslado registrado</th><th>Ubicación</th></tr></thead><tbody/></table>}>{stops.map((s,i)=><tr key={s.id}><td>{i+1}</td><td>{new Date(s.scheduled_at).toLocaleTimeString("es-US",{timeZone:"America/New_York",hour:"2-digit",minute:"2-digit"})}</td><td>{s.property_name}<br/>{s.address}, {s.city}</td><td>{s.planned_minutes} min</td><td>{s.travel_minutes} min</td><td>{coordinates(s)?<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinates(s) as string)}`} target="_blank" rel="noopener noreferrer">Ver en mapa</a>:"Ubicación pendiente"}</td></tr>)}</PagedCollection></section>
 </div>;
}
