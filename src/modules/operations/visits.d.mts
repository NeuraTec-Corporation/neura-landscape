export function visitList(db: unknown): Promise<unknown>;
export function saveVisit(db: unknown, input: unknown): Promise<{ id: string }>;
export function changeVisit(
	db: unknown,
	input: unknown,
): Promise<{ id: string }>;
export function completeVisit(
	db: unknown,
	input: unknown,
): Promise<{ id: string }>;
export function saveVisitCosts(
	db: unknown,
	input: unknown,
): Promise<{ id: string }>;
