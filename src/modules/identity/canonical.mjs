import { identityMode, identityReadiness } from "./configuration.mjs";

export function canonicalPageRedirect(requestUrl, method, env = process.env) {
	if (
		env.VERCEL !== "1" ||
		identityMode(env) !== "google" ||
		!["GET", "HEAD"].includes(method)
	)
		return null;
	const origin = identityReadiness(env).origin;
	if (!origin) return null;
	const url = new URL(requestUrl);
	if (
		url.origin === origin ||
		url.pathname.startsWith("/api/") ||
		url.pathname.startsWith("/_next/") ||
		url.pathname.includes(".")
	)
		return null;
	const hosts = [
		env.VERCEL_URL,
		env.VERCEL_BRANCH_URL,
		env.VERCEL_PROJECT_PRODUCTION_URL,
		env.APP_HOST,
	].filter(Boolean);
	if (!hosts.includes(url.host)) return null;
	// Construct from the configured origin, never from forwarded headers or user input.
	const target = new URL(origin);
	target.pathname = url.pathname;
	for (const [key, value] of url.searchParams) {
		if (!key.startsWith("_vercel_")) target.searchParams.append(key, value);
	}
	return target.href;
}
