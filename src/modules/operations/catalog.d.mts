export const categories: Record<string, string>;
export function catalogOptions(db: unknown): Promise<Record<string, unknown>[]>;
export function saveOption(
	db: unknown,
	input: unknown,
): Promise<{ key: string }>;

export function catalogMetadata(
	db: unknown,
): Promise<{
	categories: Record<string, string>;
	extensible: Record<string, boolean>;
}>;
export function canManageCatalog(role: string, category: string): boolean;
