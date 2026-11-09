import { CURRENT_COMPANY, permissionRegistry } from "../_security-manifest.mjs";
import {
	enrollMembership,
	resolveSecurity,
} from "@/modules/security/index.mjs";
import type { Member } from "@/modules/identity/auth.mjs";
import type { PGlite } from "@electric-sql/pglite";
import { ensureMemberCode } from "@/modules/identity/user-codes.mjs";

export async function runtimeMember(
	db: PGlite,
	member: Member,
): Promise<Member | null> {
	const subject = member.email || "protected-evaluation";
	// Compatibility enrollment for identities created by the trusted existing adapter.
	const enrolled = (
		await db.query(
			"SELECT subject_id FROM security_memberships WHERE company_id=$1 AND subject_id=$2",
			[CURRENT_COMPANY, subject],
		)
	).rows.length;
	if (!enrolled)
		await db.transaction(async (tx) => {
			await tx.query(
				"SELECT id FROM security_companies WHERE id=$1 FOR UPDATE",
				[CURRENT_COMPANY],
			);
			const exists = (
				await tx.query(
					"SELECT subject_id FROM security_memberships WHERE company_id=$1 AND subject_id=$2",
					[CURRENT_COMPANY, subject],
				)
			).rows.length;
			if (!exists)
				await enrollMembership(
					tx,
					CURRENT_COMPANY,
					subject,
					[`default-${member.role}`],
					member.status,
				);
		});
	const security = await resolveSecurity(
		db,
		CURRENT_COMPANY,
		subject,
		permissionRegistry,
	);
	if (!security?.operational_enabled) return null;
	const role =
		security.scope === "assigned"
			? member.role === "crew_lead"
				? "crew_lead"
				: "worker"
			: security.root
				? "it_admin"
				: member.role === "owner"
					? "owner"
					: member.role === "finance"
						? "finance"
						: "manager";
	const login_code = member.email
		? await ensureMemberCode(db, CURRENT_COMPANY, member.email)
		: undefined;
	const account_kind = member.email
		? (
				await db.query<{ account_kind: "company" | "platform" }>(
					"SELECT account_kind FROM security_login_codes WHERE company_id=$1 AND subject_id=$2",
					[CURRENT_COMPANY, member.email],
				)
			).rows[0]?.account_kind
		: undefined;
	return { ...member, role, security, login_code, account_kind };
}
export {
	capability,
	routeAllowed,
	mutationAllowed,
	manageAllowed,
} from "../_permission-policy.mjs";
