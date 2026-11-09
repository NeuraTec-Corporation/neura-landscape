import { SecurityError, enrollMembership } from "../security/index.mjs";
import { writeCredential } from "./credentials.mjs";
export const evaluationAccountsAllowed = (env = process.env) =>
	env.VERCEL === "1" &&
	env.VERCEL_ENV === "preview" &&
	env.LANDSCAPE_EVALUATION_USERS === "true";
export function operatorPrefix(value) {
	const letters = String(value || "")
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toUpperCase()
		.replace(/[^A-Z]/g, "");
	if (!letters)
		throw new SecurityError(
			"Configura el identificador de la empresa para generar usuarios.",
		);
	return letters.slice(0, 3).padEnd(3, "X");
}
export async function assignUserCode(
	tx,
	companyId,
	subjectId,
	evaluationOnly = false,
) {
	await tx.query("SELECT id FROM security_companies WHERE id=$1 FOR UPDATE", [
		companyId,
	]);
	const old = (
		await tx.query(
			"SELECT code,evaluation_only FROM security_login_codes WHERE company_id=$1 AND subject_id=$2",
			[companyId, subjectId],
		)
	).rows[0];
	if (old) return old.code;
	let settings = (
		await tx.query(
			"SELECT prefix,last_sequence FROM security_company_logins WHERE company_id=$1",
			[companyId],
		)
	).rows[0];
	if (!settings) {
		const operator = (
			await tx.query("SELECT code FROM operator_settings WHERE id=1")
		).rows[0];
		const company = (
			await tx.query("SELECT name FROM security_companies WHERE id=$1", [
				companyId,
			])
		).rows[0];
		const prefix = operatorPrefix(
			process.env.LANDSCAPE_LOGIN_PREFIX || operator?.code || company?.name,
		);
		if (
			(
				await tx.query(
					"SELECT company_id FROM security_company_logins WHERE prefix=$1",
					[prefix],
				)
			).rows.length
		)
			throw new SecurityError(
				"El prefijo de usuarios ya pertenece a otra empresa.",
				409,
			);
		await tx.query(
			"INSERT INTO security_company_logins(company_id,prefix) VALUES($1,$2)",
			[companyId, prefix],
		);
		settings = { prefix, last_sequence: 0 };
	}
	const next = (
		await tx.query(
			"UPDATE security_company_logins SET last_sequence=last_sequence+1 WHERE company_id=$1 RETURNING last_sequence",
			[companyId],
		)
	).rows[0].last_sequence;
	const code = settings.prefix + String(next).padStart(3, "0");
	await tx.query(
		"INSERT INTO security_login_codes(company_id,subject_id,code,evaluation_only) VALUES($1,$2,$3,$4)",
		[companyId, subjectId, code, evaluationOnly],
	);
	return code;
}
export async function ensureMemberCode(db, companyId, subjectId) {
	const old = (
		await db.query(
			"SELECT code FROM security_login_codes WHERE company_id=$1 AND subject_id=$2",
			[companyId, subjectId],
		)
	).rows[0];
	return (
		old?.code ||
		db.transaction((tx) => assignUserCode(tx, companyId, subjectId))
	);
}
export async function editUserCode(tx, companyId, subjectId, value) {
	const code = String(value).trim().toUpperCase();
	if (
		!/^[A-Z]{3}[0-9]{3,10}$/.test(code) ||
		Number(code.slice(3)) < 1 ||
		Number(code.slice(3)) > 2147483647
	)
		throw new SecurityError(
			"Usa tres letras y un secuencial positivo, por ejemplo ROJ001.",
		);
	await tx.query("SELECT id FROM security_companies WHERE id=$1 FOR UPDATE", [
		companyId,
	]);
	const current = (
		await tx.query(
			"SELECT code,account_kind FROM security_login_codes WHERE company_id=$1 AND subject_id=$2 FOR UPDATE",
			[companyId, subjectId],
		)
	).rows[0];
	if (!current) throw new SecurityError("El usuario no está disponible.", 404);
	if (current.code === code) return code;
	const prefix =
		current.account_kind === "platform"
			? "NEU"
			: (
					await tx.query(
						"SELECT prefix FROM security_company_logins WHERE company_id=$1",
						[companyId],
					)
				).rows[0]?.prefix;
	if (code.slice(0, 3) !== prefix)
		throw new SecurityError(
			`Este usuario debe conservar el prefijo ${prefix}.`,
		);
	if (
		(
			await tx.query(
				"SELECT subject_id FROM security_login_codes WHERE code=$1 AND (company_id<>$2 OR subject_id<>$3)",
				[code, companyId, subjectId],
			)
		).rows.length
	)
		throw new SecurityError(
			"El código de usuario ya está asignado. Usa otro.",
			409,
		);
	if (current.code === code) return code;
	await tx.query(
		"UPDATE security_login_codes SET code=$3 WHERE company_id=$1 AND subject_id=$2",
		[companyId, subjectId, code],
	);
	if (current.account_kind !== "platform")
		await tx.query(
			"UPDATE security_company_logins SET last_sequence=greatest(last_sequence,$2) WHERE company_id=$1",
			[companyId, Number(code.slice(3))],
		);
	return code;
}
export async function emailForUserCode(db, companyId, code, env = process.env) {
	const row = (
		await db.query(
			"SELECT c.subject_id,c.evaluation_only FROM security_login_codes c JOIN app_members m ON m.email=c.subject_id JOIN security_memberships s ON s.subject_id=c.subject_id AND s.company_id=c.company_id JOIN security_companies o ON o.id=c.company_id WHERE c.company_id=$1 AND c.code=$2 AND m.status='active' AND ((s.status='active' AND o.status='active' AND o.operational_enabled=true) OR EXISTS(SELECT 1 FROM security_platform_admins p WHERE p.subject_id=c.subject_id AND p.status='active'))",
			[companyId, String(code).trim().toUpperCase()],
		)
	).rows[0];
	if (!row || (row.evaluation_only && !evaluationAccountsAllowed(env)))
		return null;
	return row.subject_id;
}
export async function provisionEvaluationUsers(
	db,
	companyId,
	users,
	password,
	env = process.env,
) {
	if (!evaluationAccountsAllowed(env)) return [];
	if (
		typeof env.LANDSCAPE_EVALUATION_PASSWORD !== "string" ||
		env.LANDSCAPE_EVALUATION_PASSWORD.length < 7
	)
		throw new SecurityError("Falta la clave de evaluación.", 503);
	const result = [];
	// Existing credentials and assignments are never reset on deployment or reload.
	for (const item of users) {
		const email = `${companyId}.${item.role}@access.neuratec.invalid`;
		if (
			(
				await db.query(
					"SELECT code FROM security_login_codes WHERE company_id=$1 AND subject_id=$2 AND evaluation_only=true",
					[companyId, email],
				)
			).rows.length
		)
			continue;
		const encoded = await password.hash(env.LANDSCAPE_EVALUATION_PASSWORD);
		await db.transaction(async (tx) => {
			await tx.query(
				"SELECT id FROM security_companies WHERE id=$1 FOR UPDATE",
				[companyId],
			);
			if (
				(
					await tx.query(
						"SELECT code FROM security_login_codes WHERE company_id=$1 AND subject_id=$2 AND evaluation_only=true",
						[companyId, email],
					)
				).rows.length
			)
				return;
			if (
				(
					await tx.query("SELECT email FROM app_members WHERE email=$1", [
						email,
					])
				).rows.length
			)
				throw new SecurityError(
					"La identidad reservada ya existe; no se sobrescribe.",
					409,
				);
			if (
				!(
					await tx.query(
						"SELECT id FROM security_profiles WHERE company_id=$1 AND id=$2 AND status='active'",
						[companyId, `default-${item.role}`],
					)
				).rows.length
			)
				return;
			await tx.query(
				"INSERT INTO app_members(email,name,role,status) VALUES($1,$2,$3,'active')",
				[email, item.name, item.role],
			);
			await enrollMembership(tx, companyId, email, [`default-${item.role}`]);
			let code = await assignUserCode(tx, companyId, email, true);
			if (item.kind === "platform") {
				await tx.query(
					"INSERT INTO security_platform_admins(subject_id) VALUES($1) ON CONFLICT DO NOTHING",
					[email],
				);
				await tx.query(
					"UPDATE security_login_codes SET account_kind='platform' WHERE company_id=$1 AND subject_id=$2",
					[companyId, email],
				);
				code = await editUserCode(tx, companyId, email, item.code);
			}
			await writeCredential(tx, { email, name: item.name }, encoded);
			if (["worker", "crew_lead"].includes(item.role)) {
				const crew = (
					await tx.query(
						"SELECT id FROM crews WHERE deleted_at IS NULL ORDER BY name,id LIMIT 1",
					)
				).rows[0];
				if (crew)
					await tx.query(
						"INSERT INTO app_crew_members(email,crew_id) VALUES($1,$2)",
						[email, crew.id],
					);
			}
			await tx.query(
				"INSERT INTO security_audit(company_id,actor,entity,entity_id,after_value) VALUES($1,'preview-provisioning','evaluation_user',$2,$3::jsonb)",
				[
					companyId,
					email,
					JSON.stringify({ code, profile: `default-${item.role}` }),
				],
			);
			await tx.query(
				"UPDATE security_companies SET version=version+1 WHERE id=$1",
				[companyId],
			);
			result.push({ code, name: item.name, role: item.role });
		});
	}
	return result;
}
