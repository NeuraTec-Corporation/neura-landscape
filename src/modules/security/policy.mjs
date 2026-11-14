// Framework/provider-independent authorization contract, v0.1.
export class SecurityError extends Error {
	constructor(message, status = 422) {
		super(message);
		this.status = status;
	}
}
export function permits(access, capability, companyId = access?.company_id) {
	return Boolean(
		access?.active &&
			access.company_id === companyId &&
			access.grants?.includes(capability),
	);
}
export function validateGrants(registry, grants, scope) {
	if (
		!Array.isArray(grants) ||
		grants.length > 200 ||
		!["company", "assigned"].includes(scope)
	)
		throw new SecurityError("Permisos o alcance inválidos.");
	const unique = [...new Set(grants)];
	for (const key of unique) {
		const capability = registry.find((item) => item.key === key);
		if (!capability?.scopes.includes(scope))
			throw new SecurityError("El permiso no existe o no admite ese alcance.");
		for (const required of capability.requires || [])
			if (!unique.includes(required))
				throw new SecurityError(
					`El permiso requiere: ${registry.find((c) => c.key === required)?.label || required}.`,
				);
		const resource = key.split(".")[0];
		if (!key.endsWith(".read") && !unique.includes(`${resource}.read`))
			throw new SecurityError(
				"Para gestionar un módulo debes permitir su consulta.",
			);
	}
	return unique.sort();
}
