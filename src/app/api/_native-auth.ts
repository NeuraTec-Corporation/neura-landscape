import { authentication } from "@/modules/identity/auth.mjs";
import {
	ensureMemberCode,
	provisionEvaluationUsers,
} from "@/modules/identity/user-codes.mjs";
import { globalDatabase as database } from "@/modules/operations/index.mjs";
import { CURRENT_COMPANY } from "../_security-manifest.mjs";
import { evaluationUsers as users } from "../_evaluation-users.mjs";
let prepared: Promise<void> | undefined;
export async function nativeAuthentication() {
	const auth = await authentication();
	if (!prepared)
		prepared = (async () => {
			const db = await database();
			await provisionEvaluationUsers(
				db,
				CURRENT_COMPANY,
				users,
				(await auth.$context).password,
			);
			const existing = (
				await db.query<{ email: string }>(
					"SELECT m.email FROM app_members m JOIN security_memberships s ON s.subject_id=m.email AND s.company_id=$1 ORDER BY m.email",
					[CURRENT_COMPANY],
				)
			).rows;
			for (const member of existing)
				await ensureMemberCode(db, CURRENT_COMPANY, member.email);
		})().catch((error) => {
			prepared = undefined;
			throw error;
		});
	await prepared;
	return auth;
}
