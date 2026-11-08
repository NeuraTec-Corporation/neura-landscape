import { identityMode } from "@/modules/identity/configuration.mjs";
import {assignedProperty} from "@/modules/identity/assignments.mjs";
import { allowedRequest } from "./_access";
import {
	authentication,
	memberForSession,
	canUse,
	type Member,
} from "@/modules/identity/auth.mjs";
import { database } from "@/modules/operations/index.mjs";
export async function principal(request: Request): Promise<Member | null> {
	if (!allowedRequest(request)) return null;
	const mode = identityMode();
 if (mode === "blocked") return null;
 if (mode === "evaluation")
		return {
			email: "",
			name: "Evaluación protegida",
			role: "it_admin",
			status: "active",
			revision: 1,
		};
	try {
		const auth = await authentication();
		const session = await auth.api.getSession({ headers: request.headers });
		return await memberForSession(
			await database(),
			session,
			process.env.LANDSCAPE_IT_ADMIN_EMAIL,
		);
	} catch {
		return null;
	}
}
export async function authorizedRequest(request: Request) {
	const member = await principal(request);
	return Boolean(
		member &&
			canUse(member.role, new URL(request.url).pathname, request.method),
	);
}
export async function propertyAllowed(request: Request, propertyId: string) {
	const member = await principal(request);
	if (!member) return false;
	if (!["worker", "crew_lead"].includes(member.role))
		return canUse(member.role, new URL(request.url).pathname, request.method);
	if (request.method !== "GET") return false;
return assignedProperty(await database(),member.email,propertyId);
}
