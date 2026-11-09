export function authConfigured(): boolean;
export function authentication(): Promise<import("better-auth").Auth>;
export function memberForSession(
	db: unknown,
	session: unknown,
	bootstrapEmail?: string,
	env?: Record<string,string|undefined>,
): Promise<Member | null>;
export function canUse(role: string, path: string, method?: string): boolean;
export type Member = {
	login_code?: string;
	account_kind?: "company"|"platform";
 security?: import("../security/index.mjs").SecurityAccess;
	email: string;
	name: string;
	role: string;
	status: string;
	revision: number;
};

export function canManage(role: string, area: string, method: string): boolean;
