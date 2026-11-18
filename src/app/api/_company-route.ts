import { principal } from "./_identity";
import { globalDatabase } from "@/modules/operations/index.mjs";
import { storageForCompany } from "@/modules/identity/companies.mjs";
import { withTenant } from "@/modules/operations/tenant-database.mjs";

export function companyCookie(id: string) {
	return `landscape_company=${encodeURIComponent(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${process.env.VERCEL ? "; Secure" : ""}`;
}
// ALS owns the entire handler continuation. A header/cookie never grants access;
// principal validates fresh identity, membership and profiles first.
export function companyRoute(handler: (request: Request) => Promise<Response>) {
	return async (request: Request) => {
		const member = await principal(request);
		if (!member?.security)
			return Response.json({ error: "Acceso no permitido." }, { status: 403 });
		try {
			const db = await storageForCompany(
				await globalDatabase(),
				member.security.company_id,
			);
			const response = await withTenant({ db, member, request }, () =>
				handler(request),
			);
			response.headers.set("Cache-Control", "private, no-store");
			response.headers.set("Vary", "Cookie, X-Landscape-Company");
			return response;
		} catch {
			return Response.json(
				{ error: "No se pudo abrir la empresa. Recarga o consulta a IT." },
				{ status: 503, headers: { "Cache-Control": "no-store" } },
			);
		}
	};
}
