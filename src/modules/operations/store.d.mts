import type { PGlite } from "@electric-sql/pglite";
export function database(): Promise<PGlite>;
export function globalDatabase(): Promise<PGlite>;
export function snapshot(
	db: PGlite,
): Promise<Record<string, Record<string, unknown>[]>>;
export function mutate(
	db: PGlite,
	input: Record<string, unknown>,
): Promise<{ id: string }>;
