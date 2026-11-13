/** Compare matching cohorts only. Missing measurements never become zero. */
export function operatingComparison(visits,resources){
 const byVisit=new Map();for(const r of resources){if(!byVisit.has(r.visit_id))byVisit.set(r.visit_id,[]);byVisit.get(r.visit_id).push(r);}
 const rows=[],production=new Map();
 const summary={closed:0,time_compared:0,planned_person_minutes:0,actual_person_minutes:0,cost_compared:0,planned_cost_cents:0,actual_cost_cents:0,resource_plan_pending:0,resource_actual_pending:0};
 for(const v of visits){
  const closed=["completed","cancelled"].includes(v.status),lines=byVisit.get(v.id)||[],people=v.personnel||[];
  const plannedTime=people.length&&v.planned_minutes>0?people.length*Number(v.planned_minutes):null;
  const actualTime=closed&&people.length&&people.every(p=>p.actual_minutes!==null&&p.actual_minutes!==undefined)?people.reduce((s,p)=>s+Number(p.actual_minutes),0):null;
  const plannedResources=v.resources_prepared&&lines.every(r=>r.unit_cost_cents!==null)?lines.reduce((s,r)=>s+Math.round(Number(r.planned_quantity)*r.unit_cost_cents),0):null;
  const actualResources=closed&&v.resources_prepared&&lines.every(r=>r.actual_quantity!==null&&r.actual_unit_cost_cents!==null)?lines.reduce((s,r)=>s+Math.round(Number(r.actual_quantity)*r.actual_unit_cost_cents),0):null;
  const plannedLabor=v.planned_labor_hourly_cents!==null&&v.planned_labor_hourly_cents!==undefined&&v.planned_minutes>0?Math.round(Number(v.planned_minutes)*v.planned_labor_hourly_cents/60):null;
  const plannedCost=plannedLabor!==null&&plannedResources!==null?plannedLabor+plannedResources:null;
  const actualCost=closed&&v.labor_cents!==null&&v.labor_cents!==undefined&&actualResources!==null?Number(v.labor_cents)+actualResources:null;
  if(plannedResources===null)summary.resource_plan_pending++;
  if(closed){
   summary.closed++;if(actualResources===null)summary.resource_actual_pending++;
   if(plannedTime!==null&&actualTime!==null){summary.time_compared++;summary.planned_person_minutes+=plannedTime;summary.actual_person_minutes+=actualTime;}
   if(plannedCost!==null&&actualCost!==null){summary.cost_compared++;summary.planned_cost_cents+=plannedCost;summary.actual_cost_cents+=actualCost;}
   for(const task of v.tasks||[]){
    const key=`${task.service_key}:${task.unit}`;
    if(!production.has(key))production.set(key,{service_key:task.service_key,unit:task.unit,planned:0,actual:0,missing:0});
    const p=production.get(key);p.planned+=Number(task.quantity);
    if(task.completed_quantity===null||task.completed_quantity===undefined)p.missing++;else p.actual+=Number(task.completed_quantity);
   }
  }
  rows.push({id:v.id,customer_name:v.customer_name,property_name:v.property_name,crew_name:v.crew_name,scheduled_at:v.scheduled_at,status:v.status,planned_person_minutes:plannedTime,actual_person_minutes:actualTime,planned_resources_cents:plannedResources,actual_resources_cents:actualResources,planned_cost_cents:plannedCost,actual_cost_cents:actualCost,time_delta:plannedTime!==null&&actualTime!==null?actualTime-plannedTime:null,cost_delta:plannedCost!==null&&actualCost!==null?actualCost-plannedCost:null});
 }
 return {summary,rows,production:[...production.values()].map(p=>({...p,actual:p.missing?null:p.actual}))};
}
