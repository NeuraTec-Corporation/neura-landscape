export function availabilityProblem(data, day, employeeIds) {
 const weekday=new Date(`${day}T12:00:00Z`).getUTCDay();
 if(data.calendar&&!data.calendar.weekdays.includes(weekday))return "Día no laborable según el calendario de esta empresa.";
 const absence=data.absences.find(a=>employeeIds.includes(a.employee_id)&&a.starts_on<=day&&a.ends_on>=day);
 return absence?`Personal no disponible: ${absence.employee_name||absence.employee_id}.`:null;
}
