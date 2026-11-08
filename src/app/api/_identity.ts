import { runtimeMember, routeAllowed, mutationAllowed } from "./_security";
import { identityMode } from "@/modules/identity/configuration.mjs";
import { assignedProperty } from "@/modules/identity/assignments.mjs";
import { allowedRequest } from "./_access";
import { nativeAuthentication } from "./_native-auth";
import {
	memberForSession,
	type Member,
} from "@/modules/identity/auth.mjs";
import { database } from "@/modules/operations/index.mjs";
export async function principal(request: Request): Promise<Member | null> {
	if (!allowedRequest(request)) return null;
	try {
		const mode = identityMode();
		if (mode === "blocked") return null;
		if (mode === "evaluation")
			return runtimeMember(await database(), {
				email: "",
				name: "Evaluación protegida",
				role: "it_admin",
				status: "active",
				revision: 1,
			});
		const auth = await nativeAuthentication();
		const session = await auth.api.getSession({ headers: request.headers });
		const member = await memberForSession(
			await database(),
			session,
			process.env.LANDSCAPE_IT_ADMIN_EMAIL,
		);
		return member ? runtimeMember(await database(), member) : null;
	} catch {
		return null;
	}
}
export async function authorizedRequest(request: Request) {
	const member = await principal(request);
	return Boolean(
		member &&
			routeAllowed(member, new URL(request.url).pathname, request.method),
	);
}
export async function authorizedMutation(
	request: Request,
	resource: string,
	input: Record<string, unknown>,
) {
	const member = await principal(request);
	return Boolean(
		member && mutationAllowed(member, resource, input, request.method),
	);
}
export async function propertyAllowed(request: Request, propertyId: string) {
	const member = await principal(request);
	if (
		!member ||
		!routeAllowed(member, new URL(request.url).pathname, request.method)
	)
		return false;
	if (member.security?.scope !== "assigned") return true;
	if (request.method !== "GET") return false;
	return assignedProperty(await database(), member.email, propertyId);
}
