// Shared account-wide counters. Reservations commit BEFORE provider calls and
// are not refunded on timeouts; retries never silently consume uncounted units.
export const limits={map:{day:100,month:3000},autocomplete:{day:100,month:3000},details:{day:50,month:1500},matrix:{day:250,month:7500}};
export class MapsError extends Error{constructor(message,status=422){super(message);this.status=status;}}
export function billingPeriods(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const get=k=>parts.find(p=>p.type===k).value,day=`${get('year')}-${get('month')}-${get('day')}`;
 return {day,month:day.slice(0,7),year:Number(get('year'))};
}
export async function reserveMaps(db,kind,units=1,now=new Date()){
 const cap=limits[kind];if(!cap||!Number.isSafeInteger(units)||units<1||units>cap.day)throw new MapsError('El tamaño de la consulta supera el límite gratuito del piloto.',429);
 const period=billingPeriods(now);
 return db.transaction(async tx=>{
  const used={};for(const interval of ['month','day']){
   const row=(await tx.query('INSERT INTO public.entity_sequences AS counters(entity,year,value) VALUES($1,$2,$3) ON CONFLICT(entity,year) DO UPDATE SET value=counters.value+EXCLUDED.value WHERE counters.value+EXCLUDED.value<=$4 RETURNING value',[`maps_v1_${kind}_${interval}_${period[interval]}`,period.year,units,cap[interval]])).rows[0];
   if(!row)throw new MapsError('Se alcanzó el límite de uso de Google del piloto. No se realizó otra consulta.',429);used[interval]=Number(row.value);
  }
  return {kind,units,used,limits:cap,billing_timezone:'America/Los_Angeles'};
 });
}
export const point=p=>p&&Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180;
export async function googleMatrix(points,{key,fetcher=fetch}={}){
 if(!key)throw new MapsError('Google Routes no está configurado.',503);
 if(!Array.isArray(points)||points.length<2||points.length>15||points.some(p=>!point(p)))throw new MapsError('Revisa las coordenadas y el tamaño del recorrido.');
 const waypoint=p=>({waypoint:{location:{latLng:{latitude:p.latitude,longitude:p.longitude}}}});
 const response=await fetcher('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'originIndex,destinationIndex,status,condition,duration,distanceMeters'},body:JSON.stringify({origins:points.map(waypoint),destinations:points.map(waypoint),travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE'}),signal:AbortSignal.timeout(15000),cache:'no-store'});
 if(!response.ok)throw new MapsError('Google Routes no pudo calcular el recorrido. Revisa la configuración o inténtalo más tarde.',502);
 const elements=await response.json();if(!Array.isArray(elements))throw new MapsError('Respuesta vial inválida.',502);
 const matrix=points.map(()=>points.map(()=>null)),seen=new Set();
 for(const e of elements){const i=e.originIndex??0,j=e.destinationIndex??0;if(!Number.isInteger(i)||!Number.isInteger(j)||i<0||j<0||i>=points.length||j>=points.length||seen.has(`${i}:${j}`))throw new MapsError('Respuesta vial incompleta o inválida.',502);seen.add(`${i}:${j}`);if(e.condition==='ROUTE_EXISTS'&&!e.status?.code){const match=String(e.duration).match(/^(\d+(?:\.\d+)?)s$/);if(!match)throw new MapsError('Duración vial inválida.',502);matrix[i][j]=Number(match[1])/60;}}
 if(seen.size!==points.length**2)throw new MapsError('Google no devolvió todos los trayectos. No se sustituyeron por distancias directas.',502);
 return matrix;
}
