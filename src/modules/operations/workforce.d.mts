export function workforce(db: unknown): Promise<unknown>;
export function saveEmployee(
	db: unknown,
	input: unknown,
): Promise<{ id: string }>;
export function saveCrew(db: unknown, input: unknown): Promise<{ id: string }>;
export function removeWorkforce(
	db: unknown,
	entity: string,
	input: unknown,
): Promise<{ id: string }>;
