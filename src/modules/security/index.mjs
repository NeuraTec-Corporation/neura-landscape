import { randomUUID } from "node:crypto";
import { permits, SecurityError, validateGrants } from "./policy.mjs";
export { permits, SecurityError, validateGrants } from "./policy.mjs";

export async function resolveSecurity(db, companyId, subjectId, registry) {
	const member = (
		await db.query(
			`SELECT m.*,c.status company_status,c.operational_enabled,c.name company_name FROM security_memberships m JOIN security_companies c ON c.id=m.company_id WHERE m.company_id=$1 AND m.subject_id=$2`,
			[companyId, subjectId],
		)
	).rows[0];
	if (
		member?.status !== "active" ||
		member.company_status !== "active"
	)
		return null;
	const profiles = (
		await db.query(
			`SELECT p.* FROM security_assignments a JOIN security_profiles p ON p.company_id=a.company_id AND p.id=a.profile_id WHERE a.company_id=$1 AND a.subject_id=$2 AND p.status='active' ORDER BY p.name`,
			[companyId, subjectId],
		)
	).rows;
	if (!profiles.length || new Set(profiles.map((p) => p.scope)).size !== 1)
		return null;
	const valid = new Set(
		registry
			.filter((c) => c.scopes.includes(profiles[0].scope))
			.map((c) => c.key),
	);
	return {
		active: true,
		company_id: companyId,
		company_name: member.company_name,
		operational_enabled: member.operational_enabled,
		subject_id: subjectId,
		scope: profiles[0].scope,
		profiles: profiles.map(
			({ id, name, system_key, protected: protectedProfile }) => ({
				id,
				name,
				system_key,
				protected: protectedProfile,
			}),
		),
		root: profiles.some((p) => p.protected),
		grants: [
			...new Set(profiles.flatMap((p) => p.grants).filter((g) => valid.has(g))),
		].sort(),
	};
}

// Only the trusted application adapter may enroll identities. This is not a public signup API.
export async function enrollMembership(
	tx,
	companyId,
	subjectId,
	profileIds,
	status = "active",
) {
	await tx.query(
		`INSERT INTO security_memberships(company_id,subject_id,status) VALUES($1,$2,$3) ON CONFLICT(company_id,subject_id) DO NOTHING`,
		[companyId, subjectId, status],
	);
	for (const profileId of profileIds)
		await tx.query(
			`INSERT INTO security_assignments(company_id,subject_id,profile_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
			[companyId, subjectId, profileId],
		);
}

export function securityService(db, registry) {
	async function actor(tx, ctx, capability) {
		const access = await resolveSecurity(
			tx,
			ctx.companyId,
			ctx.subjectId,
			registry,
		);
		if (!permits(access, capability, ctx.companyId))
			throw new SecurityError("Acceso no permitido.", 403);
		return access;
	}
	async function audit(tx, ctx, entity, id, before, after) {
		await tx.query(
			`INSERT INTO security_audit(company_id,actor,entity,entity_id,before_value,after_value) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,
			[
				ctx.companyId,
				ctx.subjectId,
				entity,
				id,
				JSON.stringify(before ?? null),
				JSON.stringify(after ?? null),
			],
		);
	}
	async function lock(tx, ctx, version) {
		const company = (
			await tx.query(
				"SELECT * FROM security_companies WHERE id=$1 FOR UPDATE",
				[ctx.companyId],
			)
		).rows[0];
		if (!company || company.version !== version)
			throw new SecurityError(
				"La seguridad cambió. Recarga antes de guardar.",
				409,
			);
		return company;
	}
	async function protect(tx, ctx) {
		const next = await resolveSecurity(
			tx,
			ctx.companyId,
			ctx.subjectId,
			registry,
		);
		if (!permits(next, "security.update"))
			throw new SecurityError(
				"No puedes retirar tu propia administración de seguridad.",
				409,
			);
		const roots = (
			await tx.query(
				`SELECT a.subject_id FROM security_assignments a JOIN security_profiles p ON p.company_id=a.company_id AND p.id=a.profile_id JOIN security_memberships m ON m.company_id=a.company_id AND m.subject_id=a.subject_id WHERE a.company_id=$1 AND p.protected=true AND p.status='active' AND m.status='active' LIMIT 1`,
				[ctx.companyId],
			)
		).rows;
		if (!roots.length)
			throw new SecurityError(
				"Debe conservarse un administrador IT activo.",
				409,
			);
	}
	async function finish(tx, ctx) {
		await protect(tx, ctx);
		await tx.query(
			"UPDATE security_companies SET version=version+1 WHERE id=$1",
			[ctx.companyId],
		);
	}
	function delegable(access, grants) {
		if (!access.root && grants.some((g) => !access.grants.includes(g)))
			throw new SecurityError(
				"No puedes conceder permisos que no tienes.",
				403,
			);
	}
	async function setAssignments(
		tx,
		ctx,
		access,
		subjectId,
		profileIds,
		status,
	) {
		const old = (
			await tx.query(
				"SELECT * FROM security_memberships WHERE company_id=$1 AND subject_id=$2 FOR UPDATE",
				[ctx.companyId, subjectId],
			)
		).rows[0];
		if (!old)
			throw new SecurityError("El usuario no pertenece a esta empresa.", 404);
		if (
			!Array.isArray(profileIds) ||
			profileIds.length > 30 ||
			!["active", "disabled"].includes(status)
		)
			throw new SecurityError("Selecciona perfiles y estado válidos.");
		const current = (
			await tx.query(
				`SELECT p.* FROM security_assignments a JOIN security_profiles p ON p.company_id=a.company_id AND p.id=a.profile_id WHERE a.company_id=$1 AND a.subject_id=$2`,
				[ctx.companyId, subjectId],
			)
		).rows;
		if (!access.root && current.some((p) => p.protected))
			throw new SecurityError("Solo IT puede modificar este acceso.", 403);
		for (const profile of current) delegable(access, profile.grants);
		const profiles = [];
		for (const id of new Set(profileIds)) {
			const p = (
				await tx.query(
					`SELECT * FROM security_profiles WHERE company_id=$1 AND id=$2 AND status='active'`,
					[ctx.companyId, id],
				)
			).rows[0];
			if (!p)
				throw new SecurityError(
					"Un perfil no está disponible en esta empresa.",
				);
			if (p.protected && !access.root)
				throw new SecurityError(
					"Solo IT puede asignar el perfil protegido.",
					403,
				);
			delegable(access, p.grants);
			profiles.push(p);
		}
		if (status === "active" && !profiles.length)
			throw new SecurityError("Un usuario activo necesita al menos un perfil.");
		if (new Set(profiles.map((p) => p.scope)).size > 1)
			throw new SecurityError(
				"No combines perfiles de empresa y de asignaciones en el mismo acceso.",
			);
		await tx.query(
			"DELETE FROM security_assignments WHERE company_id=$1 AND subject_id=$2",
			[ctx.companyId, subjectId],
		);
		await tx.query(
			"UPDATE security_memberships SET status=$3,revision=revision+1 WHERE company_id=$1 AND subject_id=$2",
			[ctx.companyId, subjectId, status],
		);
		for (const p of profiles)
			await tx.query(
				"INSERT INTO security_assignments(company_id,subject_id,profile_id) VALUES($1,$2,$3)",
				[ctx.companyId, subjectId, p.id],
			);
		await audit(
			tx,
			ctx,
			"membership",
			subjectId,
			{ ...old, profiles: current.map((p) => p.id) },
			{ status, profiles: profiles.map((p) => p.id) },
		);
	}
	return {
		async snapshot(ctx) {
			await actor(db, ctx, "security.read");
			const company = (
				await db.query(
					"SELECT id,name,status,operational_enabled,version FROM security_companies WHERE id=$1",
					[ctx.companyId],
				)
			).rows[0];
			const profiles = (
				await db.query(
					"SELECT * FROM security_profiles WHERE company_id=$1 ORDER BY name",
					[ctx.companyId],
				)
			).rows;
			const memberships = (
				await db.query(
					`SELECT m.*,coalesce((SELECT json_agg(a.profile_id ORDER BY a.profile_id) FROM security_assignments a WHERE a.company_id=m.company_id AND a.subject_id=m.subject_id),'[]'::json) profile_ids FROM security_memberships m WHERE m.company_id=$1 ORDER BY m.subject_id`,
					[ctx.companyId],
				)
			).rows;
			const history = (
				await db.query(
					"SELECT id,actor,entity,entity_id,created_at FROM security_audit WHERE company_id=$1 ORDER BY id DESC LIMIT 20",
					[ctx.companyId],
				)
			).rows;
			return { company, profiles, memberships, history, registry };
		},
		async saveProfile(ctx, input) {
			return db.transaction(async (tx) => {
				await lock(tx, ctx, input.version);
				const access = await actor(tx, ctx, "security.update");
				const id = input.id || randomUUID();
				const old = (
					await tx.query(
						"SELECT * FROM security_profiles WHERE company_id=$1 AND id=$2 FOR UPDATE",
						[ctx.companyId, id],
					)
				).rows[0];
				if (input.id && !old)
					throw new SecurityError("Perfil no encontrado en esta empresa.", 404);
				if (old?.protected)
					throw new SecurityError(
						"El perfil de continuidad IT es protegido. Crea otro perfil para personalizar permisos.",
						409,
					);
				if (
					typeof input.name !== "string" ||
					input.name.trim().length < 2 ||
					input.name.trim().length > 100 ||
					typeof input.description !== "string" ||
					input.description.length > 1000 ||
					!["active", "retired"].includes(input.status)
				)
					throw new SecurityError(
						"Revisa nombre, descripción y estado del perfil.",
					);
				if (old) delegable(access, old.grants);
				const grants = validateGrants(registry, input.grants, input.scope);
				delegable(access, grants);
				if (
					old?.scope !== input.scope &&
					old &&
					(
						await tx.query(
							"SELECT subject_id FROM security_assignments WHERE company_id=$1 AND profile_id=$2 LIMIT 1",
							[ctx.companyId, id],
						)
					).rows.length
				)
					throw new SecurityError(
						"Un perfil asignado no puede cambiar de alcance. Crea otro perfil.",
						409,
					);
				await tx.query(
					`INSERT INTO security_profiles(company_id,id,name,description,status,scope,grants) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(company_id,id) DO UPDATE SET name=excluded.name,description=excluded.description,status=excluded.status,scope=excluded.scope,grants=excluded.grants,revision=security_profiles.revision+1`,
					[
						ctx.companyId,
						id,
						input.name.trim(),
						input.description,
						input.status,
						input.scope,
						JSON.stringify(grants),
					],
				);
				const after = (
					await tx.query(
						"SELECT * FROM security_profiles WHERE company_id=$1 AND id=$2",
						[ctx.companyId, id],
					)
				).rows[0];
				await audit(tx, ctx, "profile", id, old, after);
				await finish(tx, ctx);
				return after;
			});
		},
		async assign(ctx, input, prepare) {
			return db.transaction(async (tx) => {
				await lock(tx, ctx, input.version);
				const access = await actor(tx, ctx, "security.update");
				if (prepare) await prepare(tx);
				await setAssignments(
					tx,
					ctx,
					access,
					input.subjectId,
					input.profileIds,
					input.status,
				);
				await finish(tx, ctx);
				return { ok: true };
			});
		},
	};
}
