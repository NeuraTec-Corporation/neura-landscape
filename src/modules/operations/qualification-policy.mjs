export function qualificationProblem(data,day,employeeIds,tasks){
 for(const t of tasks){
  if(!data.rules.some(r=>r.service_key===t.service_key&&r.required))continue;
  const candidates=t.employee_id?[t.employee_id].filter(id=>employeeIds.includes(id)):employeeIds;
  if(!data.qualifications.some(q=>!q.retired_at&&candidates.includes(q.employee_id)&&q.service_key===t.service_key&&q.valid_from<=day&&(!q.valid_until||q.valid_until>=day)))return `Falta una habilitación vigente para ${t.service_key} entre los responsables de la tarea.`;
 }
 return null;
}
export function accessPolicyWindow(data,propertyId,day,fallback){
 const policy=data.policies.find(p=>p.property_id===propertyId);
 if(!policy)return {configured:false,value:fallback};
 const weekday=new Date(`${day}T12:00:00Z`).getUTCDay(),row=data.windows.find(w=>w.property_id===propertyId&&w.weekday===weekday);
 return {configured:true,value:row?`${row.opens_at}–${row.closes_at}`:null};
}
