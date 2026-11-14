import type { PGlite } from "@electric-sql/pglite";
export function requestTenant():
	| {
			db: PGlite;
			member: import("../identity/auth.mjs").Member;
			request: Request;
	  }
	| undefined;
export function withTenant<T>(value: unknown, fn: () => T): T;
export function bootstrapCompanyStorage(
	tx: unknown,
	schema: string,
): Promise<void>;
export function assertCompanyStorage(
	db: unknown,
	schema: string,
): Promise<void>;
export function companyDatabase(db: unknown, schema: string): PGlite;
