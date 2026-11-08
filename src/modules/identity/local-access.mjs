import { createHash, randomBytes, randomUUID } from "node:crypto";
import { resolveSecurity, permits, SecurityError } from "../security/index.mjs";
const digest = (token) => createHash("sha256").update(token).digest("hex");
const invalid = () =>
	new SecurityError(
		"El enlace no es válido o ya venció. Solicita otro al administrador.",
		422,
	);

async function lock(db, companyId) {
	await db.query("SELECT id FROM security_companies WHERE id=$1 FOR UPDATE", [
		companyId,
	]);
}
async function authorizedTarget(db, registry, companyId, issuer, email) {
	// Credentials identify a person globally. A tenant administrator must never
	// take over an identity also belonging to another company.
	if (
		(
			await db.query(
				"SELECT company_id FROM security_memberships WHERE subject_id=$1 AND company_id<>$2 AND status='active'",
				[email, companyId],
			)
		).rows.length
	)
		throw new SecurityError(
			"Esta identidad pertenece a varias empresas; requiere recuperación de identidad de plataforma.",
			409,
		);
	const actor = await resolveSecurity(db, companyId, issuer, registry);
	const target = await resolveSecurity(db, companyId, email, registry);
	if (
		!permits(actor, "security.update", companyId) ||
		!target?.active ||
		!target.profiles.length
	)
		throw new SecurityError(
			"El acceso del usuario o administrador no está activo.",
			403,
		);
	if (
		!actor.root &&
		(target.root || target.grants.some((g) => !actor.grants.includes(g)))
	)
		throw new SecurityError(
			"No puedes administrar las credenciales de este perfil.",
			403,
		);
	const member = (
		await db.query(
			"SELECT email,name,revision FROM app_members WHERE email=$1 AND status='active'",
			[email],
		)
	).rows[0];
	if (!member) throw new SecurityError("Usuario no disponible.", 403);
	return member;
}
async function audit(tx, companyId, actor, email, event) {
	await tx.query(
		"INSERT INTO security_audit(company_id,actor,entity,entity_id,after_value) VALUES($1,$2,'credential',$3,$4::jsonb)",
		[companyId, actor, email, JSON.stringify({ event })],
	);
}
export function localAccessService(db, registry, password) {
	return {
		async issue({ companyId, subjectId }, email) {
			return db.transaction(async (tx) => {
				await lock(tx, companyId);
				const member = await authorizedTarget(
					tx,
					registry,
					companyId,
					subjectId,
					email,
				);
				const count = (
					await tx.query(
						"SELECT count(*)::int n FROM security_access_links WHERE company_id=$1 AND issuer=$2 AND created_at>now()-interval '1 minute'",
						[companyId, subjectId],
					)
				).rows[0].n;
				if (count >= 10)
					throw new SecurityError(
						"Espera un minuto antes de generar otro enlace.",
						429,
					);
				const token = randomBytes(32).toString("base64url"),
					id = randomUUID();
				await tx.query(
					"UPDATE security_access_links SET used_at=now() WHERE company_id=$1 AND subject_id=$2 AND used_at IS NULL",
					[companyId, email],
				);
				const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
				await tx.query(
					"INSERT INTO security_access_links(id,company_id,subject_id,issuer,member_revision,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
					[
						id,
						companyId,
						email,
						subjectId,
						member.revision,
						digest(token),
						expiresAt,
					],
				);
				await audit(tx, companyId, subjectId, email, "activation_link_issued");
				return { token, expiresAt: expiresAt.toISOString() };
			});
		},
		async redeem(token, newPassword) {
			if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
				throw invalid();
			if (
				typeof newPassword !== "string" ||
				newPassword.length < 12 ||
				newPassword.length > 128
			)
				throw new SecurityError(
					"La contraseña debe tener entre 12 y 128 caracteres.",
				);
			const hash = digest(token);
			const link = (
				await db.query(
					"SELECT * FROM security_access_links WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now()",
					[hash],
				)
			).rows[0];
			if (!link) throw invalid();
			// Password hashing belongs to Better Auth, never to the permission kernel.
			const encoded = await password.hash(newPassword);
			return db.transaction(async (tx) => {
				await lock(tx, link.company_id);
				const current = (
					await tx.query(
						"SELECT * FROM security_access_links WHERE id=$1 AND token_hash=$2 AND used_at IS NULL AND expires_at>now() FOR UPDATE",
						[link.id, hash],
					)
				).rows[0];
				if (!current) throw invalid();
				const member = await authorizedTarget(
					tx,
					registry,
					current.company_id,
					current.issuer,
					current.subject_id,
				);
				if (member.revision !== current.member_revision) throw invalid();
				let user = (
					await tx.query('SELECT id FROM "user" WHERE email=$1 FOR UPDATE', [
						member.email,
					])
				).rows[0];
				if (!user) {
					user = { id: randomUUID() };
					// Administrative identity proof is distinct from verified ownership of an email inbox.
					await tx.query(
						'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,false,now(),now())',
						[user.id, member.name, member.email],
					);
				}
				const account = (
					await tx.query(
						'SELECT id FROM account WHERE "userId"=$1 AND "providerId"=\'credential\' FOR UPDATE',
						[user.id],
					)
				).rows[0];
				if (account)
					await tx.query(
						'UPDATE account SET password=$2,"updatedAt"=now() WHERE id=$1',
						[account.id, encoded],
					);
				else
					await tx.query(
						'INSERT INTO account(id,"userId","accountId","providerId",password,"createdAt","updatedAt") VALUES($1,$2,$2,\'credential\',$3,now(),now())',
						[randomUUID(), user.id, encoded],
					);
				await tx.query(
					"INSERT INTO security_local_identities(email,user_id) VALUES($1,$2) ON CONFLICT(email) DO UPDATE SET user_id=excluded.user_id",
					[member.email, user.id],
				);
				await tx.query('DELETE FROM session WHERE "userId"=$1', [user.id]);
				await tx.query(
					"UPDATE security_access_links SET used_at=now() WHERE company_id=$1 AND subject_id=$2 AND used_at IS NULL",
					[current.company_id, member.email],
				);
				await audit(
					tx,
					current.company_id,
					current.issuer,
					member.email,
					"password_established_sessions_revoked",
				);
				return { ok: true };
			});
		},
	};
}
