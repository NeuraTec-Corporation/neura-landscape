import type { Member } from "@/modules/identity/auth.mjs";
export function capability(
	member: Member | null | undefined,
	key: string,
): boolean;
export function routeAllowed(
	member: Member,
	path: string,
	method: string,
): boolean;
export function mutationAllowed(
	member: Member,
	resource: string,
	input: Record<string, unknown>,
	method?: string,
): boolean;
export function manageAllowed(
	member: Member,
	area: string,
	method: string,
): boolean;
