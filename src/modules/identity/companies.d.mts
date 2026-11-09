import type { PGlite } from "@electric-sql/pglite";
export type Company = {
	id: string;
	name: string;
	status: string;
	operational_enabled: boolean;
	version: number;
	prefix: string | null;
};
export function selectCompany(
	companies: Company[],
	explicit: string | null,
	cookie?: string,
): Company | undefined;
export function platformIT(db: unknown, subject: string): Promise<boolean>;
export function availableCompanies(
	db: unknown,
	subject: string,
): Promise<Company[]>;
export function synchronizeIT(
	db: unknown,
	companyId: string,
	subject: string,
): Promise<boolean>;
export function storageForCompany(
	db: unknown,
	companyId: string,
): Promise<PGlite>;
export function saveCompany(
	db: unknown,
	subject: string,
	input: Record<string, unknown>,
	templates: unknown[],
): Promise<{ id: string }>;
export function assignCompany(
	db: unknown,
	subject: string,
	input: Record<string, unknown>,
): Promise<{ ok: boolean }>;
