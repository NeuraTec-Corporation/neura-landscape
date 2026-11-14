export const planningZone: string;
export function planningDay(value: string | Date): string;
export type PlanningCrew = { id: string; name: string; shift_start: string; shift_end: string; break_minutes: number; members: { employee_id: string; status: string }[] };
export type PlanningVisit = { id: string; crew_id: string; scheduled_at: string; status: string; planned_minutes: number | null; travel_minutes: number; deleted_at?: string | null; assignment_review_required?: boolean; personnel?: { employee_id: string }[] };
export type DailyCapacity = { id: string; name: string; capacity: number; work: number; travel: number; reserved: number; remaining: number; utilization: number; activeMembers: number; visits: number; review: number; warnings: string[] };
export function dailyCapacity(crews: PlanningCrew[], visits: PlanningVisit[], day: string, candidate?: PlanningVisit): DailyCapacity[];
