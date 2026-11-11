import { permissionRegistry } from "./_security-manifest.mjs";
import { permits } from "../modules/security/index.mjs";
export function capability(member, key) {
	return Boolean(
		member?.security &&
			permits(member.security, key, member.security.company_id),
	);
}
const routes = {
	"/api/customers": "customers",
	"/api/properties": "properties",
	"/api/contracts": "contracts",
	"/api/survey": "survey",
	"/api/photos": "survey",
	"/api/users": "security",
	"/api/security": "security",
	"/api/operator": "settings",
	"/api/my-work": "my_work",
};
export function routeAllowed(member, path, method) {
	if (path === "/api/me") return true;
	if (path === "/api/addresses")
		return (
			method === "GET" &&
			(capability(member, "customers.read") ||
				capability(member, "properties.read"))
		);
	if (path === "/api/operations" && method === "POST")
		return Boolean(member.security?.root);
	if (path === "/api/operations")
		return (
			method === "GET" &&
			[
				"customers",
				"properties",
				"contracts",
				"workforce",
				"visits",
				"costs",
			].every((r) => capability(member, `${r}.read`))
		);
	const resource = routes[path];
	if (!resource) return false;
	if (method === "GET") return capability(member, `${resource}.read`);
	return permissionRegistry.some(
		(p) =>
			p.resource === resource &&
			p.action !== "read" &&
			capability(member, p.key),
	);
}
export function mutationAllowed(member, resource, input, method = "POST") {
	if (resource === "estimates" && input.action === "bind")
		return (
			capability(member, "estimates.approve") &&
			capability(member, "contracts.create") &&
			capability(member, "contracts.update")
		);
	let action;
	if(resource==="visits"&&input.action==="reassign_pending") action="update";
	else if (
		method === "DELETE" ||
		input.action === "delete" ||
		input.action === "archive" ||
		input.action === "void"
	)
		action = "delete";
	else if (
		resource === "estimates" &&
		["issue", "accept", "withdraw", "decline", "bind"].includes(
			String(input.action),
		)
	)
		action = "approve";
	else if (
		resource === "finance" &&
		["payment", "reverse_payment"].includes(String(input.action))
	)
		action = "pay";
	else if (resource === "finance" && input.action === "issue")
		action = "approve";
	else if (
		resource === "visits" &&
		["start", "complete", "cancel", "note"].includes(String(input.action))
	)
		action = "execute";
	else if (
		["costs", "settings", "catalogs", "security"].includes(resource) ||
		input.action === "reminder" ||
		input.action === "rate"
	)
		action = "update";
	else action = input.id ? "update" : "create";
	if (!permissionRegistry.some((p) => p.key === `${resource}.${action}`))
		return false;
	return capability(member, `${resource}.${action}`);
}
export function manageAllowed(member, area, method) {
	const resource = area === "settings" ? "integrations" : area;
	if (
		![
			"workforce",
			"estimates",
			"visits",
			"costs",
			"finance",
			"dashboard",
			"settings",
		].includes(area)
	)
		return false;
	if (method === "GET")
		return area === "settings"
			? capability(member, "settings.read") ||
					capability(member, "integrations.read")
			: capability(member, `${resource}.read`);
	return permissionRegistry.some(
		(p) =>
			p.resource === resource &&
			p.action !== "read" &&
			capability(member, p.key),
	);
}
