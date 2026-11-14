import { NextResponse, type NextRequest } from "next/server";
import { canonicalPageRedirect } from "./modules/identity/canonical.mjs";

export function proxy(request: NextRequest) {
	const target = canonicalPageRedirect(request.url, request.method);
	return target ? NextResponse.redirect(target, 307) : NextResponse.next();
}
export const config = { matcher: ["/", "/:section"] };
