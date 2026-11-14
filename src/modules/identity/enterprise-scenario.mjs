import { saveCompany, platformIT } from "./companies.mjs";
import {
	distributePortfolio,
	portfolioCounts,
} from "../operations/distribute-portfolio.mjs";
import { assignUserCode } from "./user-codes.mjs";
import { enrollMembership } from "../security/index.mjs";
import { writeCredential } from "./credentials.mjs";
import { assertCompanyStorage } from "../operations/tenant-database.mjs";
const scenario = "enterprise-distribution-v1";
export async function provisionEnterpriseScenario(
	db,
	password,
	templates,
	env = process.env,
) {
	if (
		env.VERCEL !== "1" ||
		env.VERCEL_ENV !== "preview" ||
		env.LANDSCAPE_EVALUATION_USERS !== "true" ||
		env.LANDSCAPE_ENTERPRISE_SETUP !== "true"
	)
		return null;
	if (
		(
			await db.query("SELECT id FROM security_scenarios WHERE id=$1", [
				scenario,
			])
		).rows.length
	)
		return null;
	if (
		typeof env.LANDSCAPE_EVALUATION_PASSWORD !== "string" ||
		env.LANDSCAPE_EVALUATION_PASSWORD.length < 7
	)
		throw Error("Evaluation credential not configured");
	const encodings = await Promise.all(
		Array.from({ length: 7 }, () =>
			password.hash(env.LANDSCAPE_EVALUATION_PASSWORD),
		),
	);
	return db.transaction(async (tx) => {
		await tx.query("SELECT pg_advisory_xact_lock(703925)");
		if (
			(
				await tx.query("SELECT id FROM security_scenarios WHERE id=$1", [
					scenario,
				])
			).rows.length
		)
			return null;
		const root = (
			await tx.query(
				"SELECT subject_id FROM security_login_codes WHERE code='NEU001' AND account_kind='platform'",
			)
		).rows[0]?.subject_id;
		if (!root || !(await platformIT(tx, root)))
			throw Error("Canonical platform IT is required");
		await tx.exec(
			"LOCK TABLE customers,properties,contracts,visits,employees,crews,invoices,payments IN SHARE ROW EXCLUSIVE MODE",
		);
		const port = {
			query: (s, p) => tx.query(s, p),
			exec: (s) => tx.exec(s),
			transaction: (fn) => fn(tx),
		};
		const companies = (
			await tx.query("SELECT id,name,kind FROM security_companies ORDER BY id")
		).rows;
		if (companies.length !== 1 || companies[0].id !== "landscape")
			throw Error(
				"Setup expects the original single workspace; review existing companies first",
			);
		const platform = await saveCompany(
			port,
			root,
			{
				name: "NeuraTec Corporation",
				prefix: "NEU",
				kind: "platform",
				status: "active",
			},
			templates,
		);
		const evergreen = await saveCompany(
			port,
			root,
			{ name: "Evergreen Grounds Services", prefix: "EVE", status: "active" },
			templates,
		);
		await tx.query(
			"UPDATE security_companies SET name='Rojas Lawn Maintenance',version=version+1 WHERE id='landscape'",
		);
		const schema = (
			await tx.query(
				"SELECT schema_name FROM security_company_storage WHERE company_id=$1",
				[evergreen.id],
			)
		).rows[0].schema_name;
		await assertCompanyStorage(tx, schema);
		const distribution = await distributePortfolio(
			tx,
			schema,
			"landscape",
			evergreen.id,
		);
		// A single canonical native IT login belongs to NeuraTec, while its trusted
		// platform authority continues across operator companies. Google IT remains.
		await tx.query(
			"UPDATE security_login_codes SET company_id=$1 WHERE subject_id=$2 AND code='NEU001'",
			[platform.id, root],
		);
		await tx.query(
			"UPDATE security_company_logins SET last_sequence=1 WHERE company_id=$1",
			[platform.id],
		);
		const definitions = [
				{ company: "landscape", role: "company_admin", name: "Ana Cabrera" },
				{ company: evergreen.id, role: "owner", name: "Gabriel Serrano" },
				{ company: evergreen.id, role: "company_admin", name: "Lucía Morales" },
				{ company: evergreen.id, role: "manager", name: "Andrés Castillo" },
				{ company: evergreen.id, role: "finance", name: "Sofía Delgado" },
				{ company: evergreen.id, role: "crew_lead", name: "Diego Navarro" },
				{ company: evergreen.id, role: "worker", name: "Elena Rivera" },
			],
			users = [];
		for (const item of definitions) {
			const email = `${item.company}.${item.role}@access.neuratec.invalid`;
			if (
				(
					await tx.query("SELECT email FROM app_members WHERE email=$1", [
						email,
					])
				).rows.length
			)
				throw Error("Reserved setup identity already exists");
			const role = item.role === "company_admin" ? "manager" : item.role;
			await tx.query(
				"INSERT INTO app_members(email,name,role,status) VALUES($1,$2,$3,'active')",
				[email, item.name, role],
			);
			await enrollMembership(tx, item.company, email, [`default-${item.role}`]);
			const code = await assignUserCode(tx, item.company, email, true);
			await writeCredential(
				tx,
				{ email, name: item.name },
				encodings[users.length],
			);
			users.push({
				code,
				name: item.name,
				company_id: item.company,
				profile: item.role,
			});
		}
		// Each crew login is bound to deployable people from its own company only.
		for (const [company, namespace] of [
			["landscape", "public"],
			[evergreen.id, schema],
		]) {
			const crew = (
				await tx.query(
					`SELECT c.id FROM "${namespace}".crews c WHERE c.deleted_at IS NULL AND NOT c.reference_only ORDER BY EXISTS(SELECT 1 FROM "${namespace}".crew_employees m WHERE m.crew_id=c.id) DESC,c.name LIMIT 1`,
				)
			).rows[0];
			if (!crew) throw Error("Each operator needs a live crew");
			const subjects = (
				await tx.query(
					"SELECT a.subject_id FROM security_assignments a JOIN security_profiles p ON p.company_id=a.company_id AND p.id=a.profile_id WHERE a.company_id=$1 AND p.system_key IN ('crew_lead','worker')",
					[company],
				)
			).rows;
			for (const s of subjects) {
				await tx.query(
					`DELETE FROM "${namespace}".app_crew_members WHERE email=$1`,
					[s.subject_id],
				);
				await tx.query(
					`INSERT INTO "${namespace}".app_crew_members(email,crew_id) VALUES($1,$2)`,
					[s.subject_id, crew.id],
				);
			}
			await tx.query(
				"UPDATE security_companies SET version=version+1 WHERE id=$1",
				[company],
			);
		}
		const manifest = {
			version: 1,
			platform_company: platform.id,
			operators: [
				{ id: "landscape", name: "Rojas Lawn Maintenance" },
				{ id: evergreen.id, name: "Evergreen Grounds Services" },
			],
			distribution,
			users,
			platformCounts: await portfolioCounts(
				tx,
				(
					await tx.query(
						"SELECT schema_name FROM security_company_storage WHERE company_id=$1",
						[platform.id],
					)
				).rows[0].schema_name,
			),
		};
		await tx.query(
			"INSERT INTO security_setup_attempts(id,status,message) VALUES($1,'ready','Distribución empresarial completada y conservada.') ON CONFLICT(id) DO UPDATE SET status=excluded.status,message=excluded.message,updated_at=now()",
			[scenario],
		);
		await tx.query(
			"INSERT INTO security_scenarios(id,actor,manifest) VALUES($1,$2,$3::jsonb)",
			[scenario, root, JSON.stringify(manifest)],
		);
		for (const company of [platform.id, "landscape", evergreen.id])
			await tx.query(
				"INSERT INTO security_audit(company_id,actor,entity,entity_id,after_value) VALUES($1,$2,'enterprise_distribution',$3,$4::jsonb)",
				[
					company,
					root,
					scenario,
					JSON.stringify({
						scenario,
						operator_count: 2,
						new_users: users.length,
					}),
				],
			);
		return manifest;
	});
}
