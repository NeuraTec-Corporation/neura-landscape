export const frequencies: string[];
export function contracts(db: unknown): Promise<Record<string, unknown>[]>;
export function saveContract(
	db: unknown,
	input: unknown,
): Promise<{ id: string }>;
export function removeEntity(
	db: unknown,
	entity: string,
	id: unknown,
	revision: unknown,
): Promise<{ id: string }>;
export function serviceControl(
	db: unknown,
	month: string,
): Promise<Record<string, unknown>[]>;
