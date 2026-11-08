export type IdentityReadiness = {
	mode: "google" | "evaluation" | "blocked";
	ready: boolean;
	missing: string[];
	issues: string[];
	origin: string | null;
	callbackUrl: string | null;
};
export function identityMode(
	env?: Record<string, string | undefined>,
): IdentityReadiness["mode"];
export function identityReadiness(
	env?: Record<string, string | undefined>,
): IdentityReadiness;
