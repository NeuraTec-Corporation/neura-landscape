export function allowedRequest(request: Request) {
	const host = request.headers.get("host") ?? "";
	const origin = request.headers.get("origin");
	const local = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
	const deployment =
		process.env.VERCEL === "1" &&
		(host === process.env.VERCEL_URL ||
			host === process.env.VERCEL_PROJECT_PRODUCTION_URL ||
			host === process.env.APP_HOST);
	if (!local && !deployment) return false;
	if (!origin) return true;
	try {
		const url = new URL(origin);
		return (
			url.host === host &&
			(local ? url.protocol === "http:" : url.protocol === "https:")
		);
	} catch {
		return false;
	}
}
