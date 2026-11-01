import { randomUUID } from "node:crypto";
import { customerSchema } from "./contract.mjs";
export class CustomerError extends Error {
	constructor(message, status = 400, fields = {}) {
		super(message);
		this.status = status;
		this.fields = fields;
	}
}
export async function listCustomers(db) {
	const rows = (
		await db.query(
			"SELECT c.id,c.name,p.status,p.kind,p.revision,p.updated_at,(SELECT email FROM customer_contacts cc WHERE cc.customer_id=c.id AND cc.roles ? 'primary' ORDER BY cc.id LIMIT 1) email,(SELECT phone_mobile FROM customer_contacts cc WHERE cc.customer_id=c.id AND cc.roles ? 'primary' ORDER BY cc.id LIMIT 1) phone FROM customers c LEFT JOIN customer_profiles p ON p.customer_id=c.id ORDER BY c.name",
		)
	).rows;
	return rows;
}
export async function getCustomer(db, id) {
	const base = (
		await db.query(
			"SELECT c.id,c.name,p.* FROM customers c LEFT JOIN customer_profiles p ON p.customer_id=c.id WHERE c.id=$1",
			[id],
		)
	).rows[0];
	if (!base) throw new CustomerError("Cliente no encontrado.", 404);
	const contacts = (
		await db.query(
			"SELECT * FROM customer_contacts WHERE customer_id=$1 ORDER BY id",
			[id],
		)
	).rows;
	const addresses = (
		await db.query(
			"SELECT * FROM customer_addresses WHERE customer_id=$1 ORDER BY id",
			[id],
		)
	).rows;
	const reminders = (
		await db.query(
			"SELECT * FROM customer_reminders WHERE customer_id=$1 ORDER BY due_at",
			[id],
		)
	).rows;
	const audit = (
		await db.query(
			"SELECT action,revision,occurred_at FROM customer_audit WHERE customer_id=$1 ORDER BY id DESC LIMIT 30",
			[id],
		)
	).rows;
	return { ...base, contacts, addresses, reminders, audit };
}
export async function saveCustomer(db, input) {
	const parsed = customerSchema.safeParse(input);
	if (!parsed.success)
		throw new CustomerError(
			"Revisa los campos marcados.",
			422,
			Object.fromEntries(
				parsed.error.issues.map((x) => [x.path.join("."), x.message]),
			),
		);
	const v = parsed.data;
	const id = v.id || randomUUID();
	const name =
		v.kind === "company" ? v.company_name : `${v.first_name} ${v.last_name}`;
	return db.transaction(async (tx) => {
		if (v.id) {
			const existing = (
				await tx.query(
					"SELECT revision FROM customer_profiles WHERE customer_id=$1 FOR UPDATE",
					[id],
				)
			).rows[0];
			const customer = (
				await tx.query("SELECT id FROM customers WHERE id=$1", [id])
			).rows[0];
			if (!customer) throw new CustomerError("Cliente no encontrado.", 404);
			if (existing && existing.revision !== v.revision)
				throw new CustomerError(
					"Otro cambio actualizó este cliente. Recarga antes de guardar.",
					409,
				);
		}
		for (const c of v.contacts) {
			if (c.email) {
				const duplicate = (
					await tx.query(
						"SELECT customer_id FROM customer_contacts WHERE lower(email)=$1 AND customer_id<>$2 LIMIT 1",
						[c.email, id],
					)
				).rows[0];
				if (duplicate)
					throw new CustomerError(
						"Este correo ya está asociado a otro cliente.",
						409,
						{ contacts: "Posible duplicado por correo." },
					);
			}
		}
		const revision = v.id ? (v.revision || 0) + 1 : 1;
		await tx.query(
			"INSERT INTO customers(id,name) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET name=excluded.name",
			[id, name],
		);
		await tx.query(
			"INSERT INTO customer_profiles(customer_id,kind,first_name,last_name,company_name,status,marital_status,language,timezone,notes,revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(customer_id) DO UPDATE SET kind=excluded.kind,first_name=excluded.first_name,last_name=excluded.last_name,company_name=excluded.company_name,status=excluded.status,marital_status=excluded.marital_status,language=excluded.language,timezone=excluded.timezone,notes=excluded.notes,revision=excluded.revision,updated_at=now()",
			[
				id,
				v.kind,
				v.first_name,
				v.last_name,
				v.company_name,
				v.status,
				v.marital_status,
				v.language,
				v.timezone,
				v.notes,
				revision,
			],
		);
		await tx.query("DELETE FROM customer_contacts WHERE customer_id=$1", [id]);
		for (const c of v.contacts)
			await tx.query(
				"INSERT INTO customer_contacts(id,customer_id,first_name,last_name,relationship,roles,phone_mobile,phone_home,phone_office,email,preferred_channel,preferred_phone,contact_from,contact_to,consent_sms,consent_whatsapp,consent_email) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)",
				[
					c.id || randomUUID(),
					id,
					c.first_name,
					c.last_name,
					c.relationship,
					JSON.stringify(c.roles),
					c.phone_mobile,
					c.phone_home,
					c.phone_office,
					c.email,
					c.preferred_channel,
					c.preferred_phone,
					c.contact_from,
					c.contact_to,
					c.consent_sms,
					c.consent_whatsapp,
					c.consent_email,
				],
			);
		await tx.query("DELETE FROM customer_addresses WHERE customer_id=$1", [id]);
		for (const a of v.addresses)
			await tx.query(
				"INSERT INTO customer_addresses VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
				[
					a.id || randomUUID(),
					id,
					a.label,
					a.line1,
					a.line2,
					a.city,
					a.region,
					a.postal_code,
					a.country,
					a.latitude,
					a.longitude,
					a.place_id,
				],
			);
		await tx.query(
			"INSERT INTO customer_audit(customer_id,action,revision) VALUES($1,$2,$3)",
			[id, v.id ? "updated" : "created", revision],
		);
		return { id, revision };
	});
}
export async function customerReminder(db, input) {
	if (
		!input ||
		typeof input.title !== "string" ||
		!input.title.trim() ||
		input.title.length > 300
	)
		throw new CustomerError("Describe el recordatorio.");
	if (!["call", "sms", "whatsapp", "email"].includes(input.channel))
		throw new CustomerError("Canal inválido.");
	const due = new Date(input.due_at);
	if (!Number.isFinite(due.getTime()) || due.getTime() <= Date.now())
		throw new CustomerError("Selecciona una fecha futura.");
	const id = randomUUID();
	await db.query(
		"INSERT INTO customer_reminders(id,customer_id,title,due_at,channel) VALUES($1,$2,$3,$4,$5)",
		[
			id,
			input.customer_id,
			input.title.trim(),
			due.toISOString(),
			input.channel,
		],
	);
	return { id };
}
