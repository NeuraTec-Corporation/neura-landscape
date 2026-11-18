import { randomUUID } from "node:crypto";
// Trusted persistence adapter for the pinned Better Auth schema. Call inside a
// transaction after authorization; hashing belongs to Better Auth's password port.
export async function writeCredential(tx, member, encoded) {
	let user = (
		await tx.query('SELECT id FROM "user" WHERE email=$1 FOR UPDATE', [
			member.email,
		])
	).rows[0];
	if (!user) {
		user = { id: randomUUID() };
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
	return user.id;
}
