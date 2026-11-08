// Server-only readiness metadata. Never returns credential values.
export function identityMode(env = process.env) {
	if (env.APP_AUTH_ENABLED === "true") return "google";
	const hosted = env.VERCEL === "1" || Boolean(env.VERCEL_ENV);
	if (hosted)
		return env.VERCEL_ENV === "preview" && env.APP_AUTH_ENABLED === "false"
			? "evaluation"
			: "blocked";
	return !env.APP_AUTH_ENABLED || env.APP_AUTH_ENABLED === "false"
		? "evaluation"
		: "blocked";
}
export function identityReadiness(env = process.env) {
	const missing = [
		"BETTER_AUTH_SECRET",
		"BETTER_AUTH_URL",
		"DATABASE_URL",
	].filter((key) => !env[key]?.trim());
	let origin = null;
	try {
		const url = new URL(env.BETTER_AUTH_URL || "");
		const local =
			["localhost", "127.0.0.1"].includes(url.hostname) &&
			env.VERCEL !== "1" &&
			!env.VERCEL_ENV;
		if (
			!url.username &&
			!url.password &&
			!url.search &&
			!url.hash &&
			url.pathname === "/" &&
			(url.protocol === "https:" || (local && url.protocol === "http:"))
		)
			origin = url.origin;
	} catch {}
	const issues = [];
	if (env.BETTER_AUTH_URL && !origin)
		issues.push(
			"La URL de acceso debe ser un origen HTTPS estable, sin rutas, consultas ni credenciales.",
		);
	if (env.BETTER_AUTH_SECRET && env.BETTER_AUTH_SECRET.trim().length < 32)
		issues.push("El secreto de sesión debe tener al menos 32 caracteres.");
	if (env.DATABASE_URL && !/^postgres(ql)?:\/\//.test(env.DATABASE_URL))
		issues.push("El acceso requiere PostgreSQL compartido.");
	return {
		googleReady: Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim()),
		mode: identityMode(env),
		ready: missing.length === 0 && issues.length === 0,
		missing,
		issues,
		origin,
		callbackUrl: origin ? `${origin}/api/auth/callback/google` : null,
	};
}
