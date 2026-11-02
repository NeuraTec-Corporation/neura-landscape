export const categories: Record<string, string>;
export function catalogOptions(db: unknown): Promise<Record<string, unknown>[]>;
export function saveOption(
	db: unknown,
	input: unknown,
): Promise<{ key: string }>;
