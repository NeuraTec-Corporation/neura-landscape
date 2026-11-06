import { saveCustomer } from "../customers/index.mjs";
import { saveProperty } from "./properties.mjs";
import { saveSurveyItem } from "./survey.mjs";
import { ManageError, audit } from "./manage.mjs";
export const SAMPLE_BATCH = "ux01-customers-v1";
export function canLoadSamples(role) {
	return ["it_admin", "owner"].includes(role);
}
export async function sampleStatus(db) {
	const batch = (
		await db.query(
			"SELECT id,created_at,manifest FROM sample_data_batches WHERE id=$1",
			[SAMPLE_BATCH],
		)
	).rows[0];
	const counts = (
		await db.query(
			"SELECT entity,count(*)::int n FROM sample_data_records WHERE batch_id=$1 GROUP BY entity",
			[SAMPLE_BATCH],
		)
	).rows;
	return {
		loaded: Boolean(batch),
		batch: batch || null,
		customers: counts.find((c) => c.entity === "customer")?.n || 0,
		properties: counts.find((c) => c.entity === "property")?.n || 0,
	};
}
export async function loadSampleCustomers(
	db,
	{ confirmed, actor, environment },
) {
	if (!confirmed)
		throw new ManageError("Confirma la carga de datos sintéticos.");
	if (environment === "production")
		throw new ManageError(
			"Los datos de prueba solo se cargan en Preview o desarrollo.",
			403,
		);
	return db.transaction(async (tx) => {
		const created = (
			await tx.query(
				"INSERT INTO sample_data_batches(id,created_by,manifest) VALUES($1,$2,$3::jsonb) ON CONFLICT(id) DO NOTHING RETURNING id",
				[
					SAMPLE_BATCH,
					actor,
					JSON.stringify({
						version: 1,
						people: 28,
						companies: 5,
						properties: 78,
						synthetic: true,
					}),
				],
			)
		).rows;
		if (!created.length) return { ...(await sampleStatus(tx)), replayed: true };
		const scoped = {
			query: (s, p) => tx.query(s, p),
			transaction: (fn) => fn(tx),
		};
		const words = [
			"Uno",
			"Dos",
			"Tres",
			"Cuatro",
			"Cinco",
			"Seis",
			"Siete",
			"Ocho",
			"Nueve",
			"Diez",
			"Once",
			"Doce",
			"Trece",
			"Catorce",
			"Quince",
			"Dieciséis",
			"Diecisiete",
			"Dieciocho",
			"Diecinueve",
			"Veinte",
			"Veintiuno",
			"Veintidós",
			"Veintitrés",
			"Veinticuatro",
			"Veinticinco",
			"Veintiséis",
			"Veintisiete",
			"Veintiocho",
		];
		const towns = [
			["Lodi", "07644"],
			["Garfield", "07026"],
			["Hackensack", "07601"],
			["Paramus", "07652"],
		];
		let propertyNo = 0;
		for (let i = 0; i < 33; i++) {
			const company = i >= 28,
				[city, zip] = towns[i % towns.length],
				label = company
					? `Empresa de Prueba ${i - 27}`
					: `Cliente Prueba ${words[i]}`;
			const customer = await saveCustomer(scoped, {
				kind: company ? "company" : "person",
				first_name: company ? "" : "Cliente",
				last_name: company ? "" : `Prueba ${words[i]}`,
				company_name: company ? label : "",
				status: i % 11 === 0 ? "prospect" : "active",
				marital_status: "",
				language: i % 3 === 0 ? "en" : "es",
				timezone: "America/New_York",
				notes:
					"DATOS SINTÉTICOS UX01. Sin relación con personas ni direcciones reales.",
				contacts: [
					{
						first_name: "Contacto",
						last_name: "Prueba",
						relationship: company ? "representative" : "self",
						roles: ["primary", "signer", "notifications"],
						phone_mobile: "",
						phone_home: "",
						phone_office: "",
						email: `ux01-cliente-${String(i + 1).padStart(2, "0")}@example.invalid`,
						preferred_channel: "email",
						preferred_phone: "mobile",
						contact_from: "09:00",
						contact_to: "17:00",
						consent_sms: false,
						consent_whatsapp: false,
						consent_email: false,
					},
				],
				addresses: [
					{
						label: company ? "office" : "home",
						line1: `Referencia sintética ${i + 1} — no navegable`,
						line2: "",
						city,
						region: "NJ",
						postal_code: zip,
						country: "US",
						latitude: null,
						longitude: null,
						place_id: "",
					},
				],
			});
			await tx.query(
				"INSERT INTO sample_data_records VALUES($1,'customer',$2)",
				[SAMPLE_BATCH, customer.id],
			);
			const count = company ? [5, 6, 7, 8, 10][i - 28] : i % 2 === 0 ? 1 : 2;
			for (let p = 0; p < count; p++) {
				propertyNo++;
				const property = await saveProperty(scoped, {
					customer_id: customer.id,
					name:
						(company ? "Sucursal de prueba " : "Residencia de prueba ") +
						(p + 1),
					code: `LOC-PRUEBA-${new Date().getUTCFullYear()}-${String(propertyNo).padStart(4, "0")}`,
					kind: company ? "commercial" : "residential",
					status: "active",
					line1: `Ubicación sintética ${propertyNo} — no navegable`,
					line2: "",
					city,
					region: "NJ",
					postal_code: zip,
					country: "US",
					latitude: null,
					longitude: null,
					contact_name: "Contacto Prueba",
					contact_phone: "",
					lawn_sqft: 300 + i * 25 + p * 50,
					garden_sqft: 50 + p * 10,
					paved_sqft: 100 + p * 20,
					access_instructions:
						"Ejemplo sintético. No desplazarse a esta referencia.",
					service_hours: "09:00–17:00",
					notes:
						"DATOS SINTÉTICOS UX01. Medidas de ejemplo, no verificadas. Sin envíos ni facturación.",
				});
				await tx.query(
					"INSERT INTO sample_data_records VALUES($1,'property',$2)",
					[SAMPLE_BATCH, property.id],
				);
				await saveSurveyItem(scoped, "zone", {
					property_id: property.id,
					name: "Césped de ejemplo",
					kind: "lawn",
					area: 300 + i * 25 + p * 50,
					unit: "sqft",
					measurement_status: "estimated",
					latitude: null,
					longitude: null,
					notes: "Medida sintética de prueba, no verificada.",
				});
			}
		}
		await audit(tx, "sample_data", SAMPLE_BATCH, "loaded", {
			customers: 33,
			properties: propertyNo,
			actor,
		});
		return { ...(await sampleStatus(tx)), replayed: false };
	});
}
