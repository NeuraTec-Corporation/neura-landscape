// Vendor-independent road matrix port. Geographic proximity is never substituted
// for road travel time. This heuristic is feasible, not a proof of global optimum.
export async function planRoadItinerary(input,provider){
 if(!provider?.enabled)return {blocked:true,reason:'Matriz vial de proveedor sin configurar.',stops:[]};
 const {origin,stops,startsAt,endsAt,breakMinutes=0}=input;
 const point=p=>p&&Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180;
 if(!point(origin)||!Array.isArray(stops)||stops.length<1||stops.length>50||!Number.isFinite(startsAt)||!Number.isFinite(endsAt)||endsAt<=startsAt||!Number.isFinite(breakMinutes)||breakMinutes<0)throw Error('Invalid route input');
 const ids=new Set();for(const s of stops){if(!point(s)||typeof s.id!=='string'||ids.has(s.id)||!Number.isFinite(s.durationMinutes)||s.durationMinutes<=0||!Number.isFinite(s.opensAt)||!Number.isFinite(s.closesAt)||s.closesAt<s.opensAt)throw Error('Invalid service stop');ids.add(s.id);}
 const points=[origin,...stops],matrix=await provider.matrix(points);
 if(!matrix||matrix.length!==points.length||matrix.some(row=>row.length!==points.length||row.some(n=>n!==null&&(!Number.isFinite(n)||n<0))))throw Error('Invalid road matrix');
 const remaining=new Set(stops.map((_,i)=>i+1)),planned=[],unplaced=[];let current=0,time=startsAt+breakMinutes,totalTravel=0;
 while(remaining.size){
  const choices=[...remaining].map(index=>{const stop=stops[index-1],travel=matrix[current][index];if(travel===null)return null;const start=Math.max(time+travel,stop.opensAt),end=start+stop.durationMinutes,back=matrix[index][0];return back!==null&&end<=stop.closesAt&&end+back<=endsAt?{index,stop,travel,start,end,back}:null;}).filter(Boolean).sort((a,b)=>a.travel-b.travel||a.stop.closesAt-b.stop.closesAt||a.stop.id.localeCompare(b.stop.id));
  const choice=choices[0];if(!choice)break;
  planned.push({id:choice.stop.id,arrivalMinutes:time+choice.travel,startMinutes:choice.start,endMinutes:choice.end,travelMinutes:choice.travel,waitMinutes:choice.start-time-choice.travel});time=choice.end;totalTravel+=choice.travel;current=choice.index;remaining.delete(current);
 }
 for(const index of remaining)unplaced.push({id:stops[index-1].id,reason:'No cabe con los tiempos viales, acceso, servicio y retorno registrados.'});
 const back=matrix[current][0]??0;return {blocked:false,algorithm:'nearest-feasible-road-time-with-return',globallyOptimal:false,stops:planned,unplaced,totalTravelMinutes:totalTravel+back,returnMinutes:back,endsAt:time+back};
}
