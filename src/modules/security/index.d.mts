export type Capability = {
	key: string;
	resource: string;
	label: string;
	action: string;
	actionLabel: string;
	scopes: string[];
	requires?: string[];
};
export type SecurityAccess = {
	active: boolean;
	company_id: string;
	company_name: string;
	operational_enabled: boolean;
	subject_id: string;
	scope: string;
	root: boolean;
	authority_level: number;
	grants: string[];
	profiles: {
		id: string;
		name: string;
		system_key: string | null;
		protected: boolean;
	}[];
};
export type SecurityProfile = {
	company_id: string;
	id: string;
	name: string;
	description: string;
	status: string;
	scope: string;
	grants: string[];
	revision: number;
	protected: boolean;
	system_key: string | null;
};
export type SecurityContext = { companyId: string; subjectId: string };
export type SecuritySnapshot = {
	company: {
		id: string;
		name: string;
		status: string;
		operational_enabled: boolean;
		version: number;
	};
	profiles: SecurityProfile[];
	memberships: {
		subject_id: string;
		status: string;
		revision: number;
		profile_ids: string[];
	}[];
	history: {
		id: string;
		actor: string;
		entity: string;
		entity_id: string;
		created_at: string;
	}[];
	registry: Capability[];
};
export class SecurityError extends Error {
	status: number;
	constructor(message: string, status?: number);
}
export function permits(
	access: SecurityAccess | null | undefined,
	capability: string,
	companyId?: string,
): boolean;
export function validateGrants(
	registry: Capability[],
	grants: unknown,
	scope: string,
): string[];
export function resolveSecurity(
	db: unknown,
	companyId: string,
	subjectId: string,
	registry: Capability[],
): Promise<SecurityAccess | null>;
export function enrollMembership(
	tx: unknown,
	companyId: string,
	subjectId: string,
	profileIds: string[],
	status?: string,
): Promise<void>;
export function securityService(
	db: unknown,
	registry: Capability[],
): {
	snapshot(ctx: SecurityContext): Promise<SecuritySnapshot>;
	saveProfile(ctx: SecurityContext, input: unknown): Promise<SecurityProfile>;
	assign(
		ctx: SecurityContext,
		input: unknown,
		prepare?: (tx: unknown) => Promise<void>,
	): Promise<{ ok: boolean }>;
};
