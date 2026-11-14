import { CURRENT_COMPANY, permissionRegistry } from "../_security-manifest.mjs";
import {
	resolveSecurity,
	enrollMembership,
} from "@/modules/security/index.mjs";
import type { Member } from "@/modules/identity/auth.mjs";
import type { PGlite } from "@electric-sql/pglite";
import { synchronizeIT } from "@/modules/identity/companies.mjs";

export async function runtimeMember(
	db: PGlite,
	member: Member,
	companyId: string = CURRENT_COMPANY,
): Promise<Member | null> {
	const subject = member.email || "protected-evaluation";
	if (!member.email && companyId === CURRENT_COMPANY)
		await db.transaction((tx) =>
			enrollMembership(tx, companyId, subject, ["default-it_admin"]),
		);
	const root = member.email
		? await synchronizeIT(db, companyId, subject)
		: false;
	const security = await resolveSecurity(
		db,
		companyId,
		subject,
		permissionRegistry,
	);
	if (!security || (!root && !security.operational_enabled)) return null;
	// Protected tenant permissions can only originate in the platform registry.
	if (security.root && !root && member.email) return null;
	const keys = security.profiles.map((p) => p.system_key);
	const role = security.root
		? "it_admin"
		: keys.includes("owner")
			? "owner"
			: security.scope === "assigned"
				? keys.includes("crew_lead")
					? "crew_lead"
					: "worker"
				: keys.includes("finance")
					? "finance"
					: "manager";
	const code = (
		await db.query<{ code: string; account_kind: "company" | "platform" }>(
			"SELECT code,account_kind FROM security_login_codes WHERE subject_id=$1 AND (company_id=$2 OR account_kind='platform') ORDER BY account_kind DESC LIMIT 1",
			[subject, companyId],
		)
	).rows[0];
	const membership = (
		await db.query<{ display_name: string }>(
			"SELECT display_name FROM security_memberships WHERE company_id=$1 AND subject_id=$2",
			[companyId, subject],
		)
	).rows[0];
	return {
		...member,
		name: membership?.display_name || member.name,
		role,
		security,
		platform_it: root,
		login_code: code?.code,
		account_kind: root ? "platform" : "company",
	};
}

export {
	capability,
	routeAllowed,
	mutationAllowed,
	manageAllowed,
} from "../_permission-policy.mjs";
