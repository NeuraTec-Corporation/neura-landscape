export function authConfigured(): boolean;
export function authentication(): Promise<import("better-auth").Auth>;
export function memberForSession(
	db: unknown,
	session: unknown,
	bootstrapEmail?: string,
): Promise<Member | null>;
export function canUse(role: string, path: string, method?: string): boolean;
export type Member = {
	email: string;
	name: string;
	role: string;
	status: string;
	revision: number;
};
