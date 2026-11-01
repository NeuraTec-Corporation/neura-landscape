import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";
const upper = (max = 120) =>
	z
		.string()
		.trim()
		.max(max)
		.transform((v) =>
			v.normalize("NFC").replace(/\s+/g, " ").toLocaleUpperCase("es"),
		);
const required = upper().pipe(
	z
		.string()
		.min(1, "Campo obligatorio.")
		.refine(
			(v) =>
				[...v].every((c) => {
					const code = c.codePointAt(0);
					return code >= 32 && code !== 127;
				}),
			"Elimina los caracteres de control.",
		),
);
const personalName = required.refine(
	(v) => /^[\p{L}\p{M} .’'-]+$/u.test(v),
	"Usa letras para el nombre y apellido.",
);
const phone = z
	.string()
	.trim()
	.transform((value, ctx) => {
		if (!value) return "";
		const parsed = parsePhoneNumberFromString(value);
		if (!parsed?.isValid()) {
			ctx.addIssue({
				code: "custom",
				message: "Usa un teléfono válido con código de país, por ejemplo +1.",
			});
			return z.NEVER;
		}
		return parsed.number;
	});
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida.");
export const contactSchema = z
	.object({
		id: z.string().uuid().optional(),
		first_name: personalName,
		last_name: personalName,
		relationship: z.enum([
			"self",
			"spouse",
			"child",
			"representative",
			"other",
		]),
		roles: z
			.array(
				z.enum(["primary", "signer", "approver", "billing", "notifications"]),
			)
			.min(1)
			.max(5),
		phone_mobile: phone,
		phone_home: phone,
		phone_office: phone,
		email: z
			.union([z.literal(""), z.email()])
			.transform((v) => v.toLowerCase()),
		preferred_channel: z.enum(["call", "sms", "whatsapp", "email"]),
		preferred_phone: z.enum(["mobile", "home", "office"]),
		contact_from: time,
		contact_to: time,
		consent_sms: z.boolean(),
		consent_whatsapp: z.boolean(),
		consent_email: z.boolean(),
	})
	.superRefine((v, ctx) => {
		const issue = (path, message) =>
			ctx.addIssue({ code: "custom", path: [path], message });
		if (v.contact_from >= v.contact_to)
			issue("contact_to", "La hora final debe ser posterior a la inicial.");
		if (v.preferred_channel === "email" && !v.email)
			issue("email", "El canal preferido requiere correo.");
		if (v.preferred_channel === "call" && !v[`phone_${v.preferred_phone}`])
			issue("preferred_phone", "Completa el teléfono preferido para llamadas.");
		if (["sms", "whatsapp"].includes(v.preferred_channel) && !v.phone_mobile)
			issue("phone_mobile", "Este canal requiere móvil válido.");
		if (v.preferred_channel === "sms" && !v.consent_sms)
			issue("consent_sms", "Registra autorización para SMS.");
		if (v.preferred_channel === "whatsapp" && !v.consent_whatsapp)
			issue("consent_whatsapp", "Registra autorización para WhatsApp.");
	});
export const addressSchema = z
	.object({
		id: z.string().uuid().optional(),
		label: z.enum(["home", "billing", "service", "office"]),
		line1: required,
		line2: upper(),
		city: required,
		region: required,
		postal_code: required,
		country: z
			.string()
			.length(2)
			.transform((v) => v.toUpperCase()),
		latitude: z.number().min(-90).max(90).nullable(),
		longitude: z.number().min(-180).max(180).nullable(),
		place_id: z.string().max(300),
	})
	.superRefine((v, ctx) => {
		if ((v.latitude === null) !== (v.longitude === null))
			ctx.addIssue({
				code: "custom",
				path: ["latitude"],
				message: "Completa ambas coordenadas.",
			});
	});
export const customerSchema = z
	.object({
		id: z.string().uuid().optional(),
		revision: z.number().int().positive().optional(),
		kind: z.enum(["person", "company"]),
		first_name: upper(),
		last_name: upper(),
		company_name: upper(200),
		status: z.enum(["prospect", "active", "inactive"]),
		marital_status: z.enum([
			"",
			"single",
			"married",
			"partner",
			"divorced",
			"widowed",
			"undisclosed",
		]),
		language: z.enum(["es", "en"]),
		timezone: z
			.string()
			.max(80)
			.refine((v) => {
				try {
					new Intl.DateTimeFormat("en", { timeZone: v });
					return true;
				} catch {
					return false;
				}
			}, "Zona horaria inválida."),
		notes: z.string().trim().max(3000),
		contacts: z.array(contactSchema).min(1).max(20),
		addresses: z.array(addressSchema).min(1).max(20),
	})
	.superRefine((v, ctx) => {
		if (v.kind === "person" && (!v.first_name || !v.last_name))
			ctx.addIssue({
				code: "custom",
				path: ["first_name"],
				message: "Nombre y apellido son obligatorios.",
			});
		if (
			v.kind === "person" &&
			v.first_name &&
			!personalName.safeParse(v.first_name).success
		)
			ctx.addIssue({
				code: "custom",
				path: ["first_name"],
				message: "El nombre solo admite letras y puntuación de nombres.",
			});
		if (
			v.kind === "person" &&
			v.last_name &&
			!personalName.safeParse(v.last_name).success
		)
			ctx.addIssue({
				code: "custom",
				path: ["last_name"],
				message: "El apellido solo admite letras y puntuación de nombres.",
			});
		if (v.kind === "company" && !v.company_name)
			ctx.addIssue({
				code: "custom",
				path: ["company_name"],
				message: "Razón social obligatoria.",
			});
		for (const role of ["primary", "signer"])
			if (v.contacts.filter((c) => c.roles.includes(role)).length !== 1)
				ctx.addIssue({
					code: "custom",
					path: ["contacts"],
					message:
						"Debe existir exactamente un contacto principal y un responsable de contratación.",
				});
	});
