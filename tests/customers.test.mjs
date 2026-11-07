import assert from "node:assert/strict";
import { test } from "node:test";
import { migrate } from "../src/modules/operations/migrations.mjs";
import { PGlite } from "@electric-sql/pglite";
import {
	customerSchema,
	listCustomers,
	getCustomer,
	saveCustomer,
	customerReminder,
} from "../src/modules/customers/index.mjs";
const profile = () => ({
	kind: "person",
	first_name: "  Ana María ",
	last_name: "pérez",
	company_name: "",
	status: "active",
	marital_status: "married",
	language: "es",
	timezone: "America/New_York",
	notes: "Acceso lateral",
	contacts: [
		{
			first_name: "Ana María",
			last_name: "Pérez",
			relationship: "self",
			roles: ["primary", "signer"],
			phone_mobile: "+1 201 555 0123",
			phone_home: "",
			phone_office: "",
			email: "Ana@example.invalid",
			preferred_channel: "call",
			preferred_phone: "mobile",
			contact_from: "09:00",
			contact_to: "17:00",
			consent_sms: false,
			consent_whatsapp: false,
			consent_email: false,
		},
		{
			first_name: "Luis",
			last_name: "Pérez",
			relationship: "spouse",
			roles: ["billing", "notifications"],
			phone_mobile: "+1 201 555 0124",
			phone_home: "",
			phone_office: "",
			email: "Luis@example.invalid",
			preferred_channel: "email",
			preferred_phone: "mobile",
			contact_from: "10:00",
			contact_to: "16:00",
			consent_sms: false,
			consent_whatsapp: false,
			consent_email: true,
		},
	],
	addresses: [
		{
			label: "home",
			line1: "12 Test Street",
			line2: "",
			city: "Newark",
			region: "NJ",
			postal_code: "07102",
			country: "US",
			latitude: 40.7357,
			longitude: -74.1724,
			place_id: "",
		},
	],
});
test("customer contract validates identity, relationships, phones, hours and consent", () => {
	const result = customerSchema.parse(profile());
	assert.equal(result.first_name, "ANA MARÍA");
	assert.equal(result.contacts[0].phone_mobile, "+12015550123");
	assert.equal(result.contacts[0].email, "ana@example.invalid");
	assert.equal(result.addresses[0].city, "NEWARK");
	const bad = profile();
	bad.contacts[0].phone_mobile = "123";
	assert.equal(customerSchema.safeParse(bad).success, false);
	const duplicateRole = profile();
	duplicateRole.contacts[1].roles.push("signer");
	assert.equal(customerSchema.safeParse(duplicateRole).success, false);
	const consent = profile();
	consent.contacts[0].preferred_channel = "sms";
	assert.equal(customerSchema.safeParse(consent).success, false);
	const hours = profile();
	hours.contacts[0].contact_to = "08:00";
	assert.equal(customerSchema.safeParse(hours).success, false);
	const noLast = profile();
	noLast.last_name = "";
	assert.equal(customerSchema.safeParse(noLast).success, false);
	const coords = profile();
	coords.addresses[0].longitude = null;
	assert.equal(customerSchema.safeParse(coords).success, false);
});
test("customer dossier saves relational contacts, addresses, revision, reminder and audit", async () => {
	const db = new PGlite();
	try {
		await migrate(db);
		const created = await saveCustomer(db, profile());
		let record = await getCustomer(db, created.id);
		assert.equal(record.name, "ANA MARÍA PÉREZ");
		assert.equal(record.contacts.length, 2);
		assert.equal(record.addresses[0].city, "NEWARK");
		assert.equal(record.audit.length, 1);
		const changed = { ...record, notes: "Nueva instrucción" };
		await saveCustomer(db, changed);
		await assert.rejects(saveCustomer(db, changed), (e) => e.status === 409);
		record = await getCustomer(db, created.id);
		assert.equal(record.revision, 2);
		assert.equal(record.audit.length, 2);
		await assert.rejects(saveCustomer(db, profile()), (e) => e.status === 409);
		assert.equal((await listCustomers(db)).length, 1);
		await customerReminder(db, {
			customer_id: created.id,
			title: "Llamar para renovación",
			due_at: new Date(Date.now() + 86400000).toISOString(),
			channel: "call",
		});
		record = await getCustomer(db, created.id);
		assert.equal(record.reminders.length, 1);
		assert.equal(record.reminders[0].status, "pending");
		await assert.rejects(
			customerReminder(db, {
				customer_id: created.id,
				title: "Pasado",
				due_at: "2000-01-01",
				channel: "call",
			}),
		);
		assert.equal(
			(await db.query("SELECT count(*)::int n FROM customer_contacts")).rows[0]
				.n,
			2,
		);
	} finally {
		await db.close();
	}
});
