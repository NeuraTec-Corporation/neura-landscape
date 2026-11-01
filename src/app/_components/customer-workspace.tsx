"use client";
import { useEffect, useId, useState } from "react";
import { PhoneField } from "@/shared/ui";
function validationLocation(path: string) {
  const parts = path.split('.');
  const section = parts[0] === 'contacts' ? 'contactos' : parts[0] === 'addresses' ? 'direcciones' : 'identidad';
  const labels: Record<string,string> = {first_name:'Nombre',last_name:'Apellido',company_name:'Razón social',kind:'Tipo de cuenta',status:'Estado',language:'Idioma',timezone:'Zona horaria',notes:'Notas',phone_mobile:'Móvil',phone_home:'Teléfono de casa',phone_office:'Teléfono de oficina',email:'Correo',roles:'Responsabilidades',relationship:'Relación',preferred_phone:'Teléfono preferido',preferred_channel:'Canal preferido',contact_from:'Hora inicial',contact_to:'Hora final',consent_sms:'Autorización de SMS',consent_whatsapp:'Autorización de WhatsApp',consent_email:'Autorización de correo',line1:'Calle y número',line2:'Unidad',city:'Ciudad',region:'Estado / provincia',postal_code:'Código postal',country:'País',latitude:'Latitud',longitude:'Longitud',contacts:'Contactos y responsables',addresses:'Direcciones'};
  const prefix = parts.length > 1 && /^\d+$/.test(parts[1]) ? `${parts[0] === 'contacts' ? 'Contacto' : 'Dirección'} ${Number(parts[1])+1} · ` : '';
  return {section,label:prefix+(labels[parts.at(-1) ?? ''] ?? 'Datos del expediente')};
}
import type {
	CustomerDraft,
	CustomerRecord,
	CustomerSummary,
	Contact,
	Address,
} from "@/modules/customers/index.mjs";

const freshContact = (): Contact => ({
	id: crypto.randomUUID(),
	first_name: "",
	last_name: "",
	relationship: "self",
	roles: ["primary", "signer", "notifications"],
	phone_mobile: "",
	phone_home: "",
	phone_office: "",
	email: "",
	preferred_channel: "call",
	preferred_phone: "mobile",
	contact_from: "09:00",
	contact_to: "17:00",
	consent_sms: false,
	consent_whatsapp: false,
	consent_email: false,
});
const freshAddress = (): Address => ({
	id: crypto.randomUUID(),
	label: "home",
	line1: "",
	line2: "",
	city: "",
	region: "",
	postal_code: "",
	country: "US",
	latitude: null,
	longitude: null,
	place_id: "",
});
const fresh = (): CustomerDraft => ({
	kind: "person",
	first_name: "",
	last_name: "",
	company_name: "",
	status: "prospect",
	marital_status: "",
	language: "es",
	timezone: "America/New_York",
	notes: "",
	contacts: [freshContact()],
	addresses: [freshAddress()],
});
const statuses = {
	prospect: "Prospecto",
	active: "Activo",
	inactive: "Inactivo",
};
const roleLabels = {
	primary: "Contacto principal",
	signer: "Responsable del contrato",
	approver: "Autoriza trabajos",
	billing: "Facturación",
	notifications: "Recibe avisos",
};
function Field({
	label,
	value,
	onChange,
	type = "text",
	options,
	error,
	uppercase = false,
	required = false,
	placeholder = "",
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	type?: string;
	options?: [string, string][];
	error?: string;
	uppercase?: boolean;
	required?: boolean;
	placeholder?: string;
}) {
	const id = useId();
	return (
		<div className="crm-field">
			<label htmlFor={id}>
				{label}
				{required ? <span className="required"> *</span> : null}
			</label>
			{options ? (
				<select
					id={id}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					aria-invalid={!!error}
					aria-describedby={error ? `${id}-error` : undefined}
				>
					{options.map(([v, l]) => (
						<option key={v} value={v}>
							{l}
						</option>
					))}
				</select>
			) : (
				<input
					id={id}
					type={type}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onBlur={() => {
						if (uppercase)
							onChange(
								value
									.normalize("NFC")
									.trim()
									.replace(/\s+/g, " ")
									.toLocaleUpperCase("es"),
							);
					}}
					maxLength={300}
					placeholder={placeholder}
					aria-invalid={!!error}
					aria-describedby={error ? `${id}-error` : undefined}
				/>
			)}{" "}
			{error ? (
				<small id={`${id}-error`} className="field-error">
					{error}
				</small>
			) : null}
		</div>
	);
}
function AddressLookup({
	address,
	onChange,
}: {
	address: Address;
	onChange: (v: Address) => void;
}) {
	const [query, setQuery] = useState("");
	const [suggestions, setSuggestions] = useState<
		{ id: string; label: string }[]
	>([]);
	const [note, setNote] = useState("");
	useEffect(() => {
		if (query.length < 4) {
			setSuggestions([]);
			return;
		}
		const controller = new AbortController();
		const timer = setTimeout(() => {
			fetch(`/api/addresses?q=${encodeURIComponent(query)}`, {
				signal: controller.signal,
			})
				.then((r) => r.json())
				.then((result) => {
					setSuggestions(result.suggestions ?? []);
					setNote(
						result.enabled === false
							? "Búsqueda de direcciones no disponible. Puedes completar los campos manualmente."
							: "",
					);
				})
				.catch((e) => {
					if (e.name !== "AbortError")
						setNote(
							"No se pudo buscar la dirección. Completa los campos manualmente.",
						);
				});
		}, 350);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	}, [query]);
	return (
		<div className="address-lookup">
			<Field
				label="Buscar dirección"
				value={query}
				onChange={setQuery}
				placeholder="Escribe calle, ciudad o código postal"
			/>
			{note ? <small>{note}</small> : null}
			{suggestions.length ? (
				<ul aria-label="Direcciones sugeridas">
					{suggestions.map((s) => (
						<li key={s.id}>
							<button
								type="button"
								onClick={async () => {
									try {
										const r = await fetch(
											`/api/addresses?place=${encodeURIComponent(s.id)}`,
										);
										const value = await r.json();
										if (!r.ok) throw new Error();
										onChange({ ...address, ...value.address });
										setSuggestions([]);
										setQuery("");
										setNote(
											"Dirección seleccionada. Revisa los datos antes de guardar.",
										);
									} catch {
										setNote("No se pudo recuperar la dirección.");
									}
								}}
							>
								{s.label}
							</button>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}
export function CustomerWorkspace() {
	const [items, setItems] = useState<CustomerSummary[]>([]);
	const [record, setRecord] = useState<CustomerRecord | null>(null);
	const [draft, setDraft] = useState<CustomerDraft | null>(null);
	const [tab, setTab] = useState("identidad");
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState("all");
	const [page, setPage] = useState(1);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [fields, setFields] = useState<Record<string, string>>({});
	const [reminder, setReminder] = useState({
		title: "",
		due_at: "",
		channel: "call",
	});
	async function refresh() {
		const r = await fetch("/api/customers", { cache: "no-store" });
		const data = await r.json();
		if (!r.ok) throw new Error(data.error);
		setItems(data);
	}
	useEffect(() => {
		let active = true;
		fetch("/api/customers", { cache: "no-store" })
			.then(async (r) => {
				const data = await r.json();
				if (!r.ok) throw new Error(data.error);
				if (active) setItems(data);
			})
			.catch((e) => {
				if (active) setError(e.message);
			});
		return () => {
			active = false;
		};
	}, []);
	async function open(id: string) {
		setBusy(true);
		setError("");
		setNotice("");
		setFields({});
		try {
			const r = await fetch(`/api/customers?id=${encodeURIComponent(id)}`);
			const value = await r.json();
			if (!r.ok) throw new Error(value.error);
			setRecord(value);
			setDraft({
				...fresh(),
				...value,
				first_name: value.first_name ?? value.name,
				last_name: value.last_name ?? "",
				kind: value.kind ?? "person",
				status: value.status ?? "prospect",
				marital_status: value.marital_status ?? "",
				language: value.language ?? "es",
				timezone: value.timezone ?? "America/New_York",
				company_name: value.company_name ?? "",
				notes: value.notes ?? "",
				revision: value.revision ?? undefined,
				contacts: value.contacts.length ? value.contacts : [freshContact()],
				addresses: value.addresses.length ? value.addresses : [freshAddress()],
			});
			setTab("identidad");
		} catch (e) {
			setError(e instanceof Error ? e.message : "No se pudo abrir.");
		} finally {
			setBusy(false);
		}
	}
	function patch<K extends keyof CustomerDraft>(
		key: K,
		value: CustomerDraft[K],
	) {
		setDraft((d) => (d ? { ...d, [key]: value } : d));
	}
	function contact(index: number, change: Partial<Contact>) {
		if (draft)
			patch(
				"contacts",
				draft.contacts.map((c, i) => (i === index ? { ...c, ...change } : c)),
			);
	}
	function address(index: number, change: Partial<Address>) {
		const locationChanged =
			["line1", "city", "region", "postal_code", "country"].some(
				(key) => key in change,
			) && !("latitude" in change);
		if (draft)
			patch(
				"addresses",
				draft.addresses.map((a, i) =>
					i === index
						? {
								...a,
								...(locationChanged
									? { latitude: null, longitude: null, place_id: "" }
									: {}),
								...change,
							}
						: a,
				),
			);
	}
	async function save() {
		if (!draft || busy) return;
		setBusy(true);
		setError("");
		setNotice("");
		setFields({});
		try {
			const r = await fetch("/api/customers", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(draft),
			});
			const result = await r.json();
			if (!r.ok) {
				setFields(result.fields ?? {});
				const first = Object.keys(result.fields ?? {})[0] ?? "";
				setTab(
					first.startsWith("contacts")
						? "contactos"
						: first.startsWith("addresses")
							? "direcciones"
							: "identidad",
				);
				throw new Error(result.error);
			}
			await refresh();
			await open(result.id);
			setNotice("Expediente guardado. Los cambios quedaron registrados.");
		} catch (e) {
			setError(e instanceof Error ? e.message : "No se pudo guardar.");
		} finally {
			setBusy(false);
		}
	}
	const visible = items.filter(
		(x) =>
			(filter === "all" || x.status === filter) &&
			[x.name, x.email, x.phone].some((v) =>
				(v ?? "").toLocaleLowerCase().includes(query.toLocaleLowerCase()),
			),
	);
	const pages = Math.max(1, Math.ceil(visible.length / 10));
	return (
		<section className="crm-workspace" aria-label="Gestión de clientes">
			{error ? (
				<div className="error" role="alert">
					{error}
					{Object.values(fields).length ? (
						<ul>
							{Object.entries(fields).map(([key, v]) => (
								<li key={key}><button type="button" className="validation-link" onClick={()=>{
                              const target=validationLocation(key).section;
                              setTab(target);
                              document.getElementById(`tab-${target}`)?.focus();
                            }}>{validationLocation(key).label}: {v}</button></li>
							))}
						</ul>
					) : null}
				</div>
			) : null}
			{notice ? (
				<div className="crm-notice" role="status">
					{notice}
				</div>
			) : null}
			{!draft ? (
				<>
					<div className="crm-kpis">
						{[
							[items.length, "Clientes registrados"],
							[
								items.filter((i) => i.status === "active").length,
								"Relaciones activas",
							],
							[
								items.filter((i) => !i.revision).length,
								"Expedientes por completar",
							],
						].map(([n, l]) => (
							<article key={l}>
								<span>{l}</span>
								<strong>{n}</strong>
							</article>
						))}
					</div>
					<div className="crm-directory">
						<div className="crm-toolbar">
							<div>
								<p className="eyebrow">CUSTOMER RELATIONSHIP MANAGEMENT</p>
								<h2>Directorio de clientes</h2>
								<p>
									Una cuenta. Todas las personas, propiedades y decisiones
									conectadas.
								</p>
							</div>
							<button
								type="button"
								onClick={() => {
									setDraft(fresh());
									setRecord(null);
									setTab("identidad");
									setFields({});
									setError("");
									setNotice("");
								}}
							>
								＋ Nuevo cliente
							</button>
						</div>
						<div className="crm-filters">
							<Field
								label="Buscar cliente"
								value={query}
								onChange={(v) => {
									setQuery(v);
									setPage(1);
								}}
								placeholder="Nombre, correo o teléfono"
							/>
							<Field
								label="Estado"
								value={filter}
								onChange={(v) => {
									setFilter(v);
									setPage(1);
								}}
								options={[
									["all", "Todos los estados"],
									["prospect", "Prospectos"],
									["active", "Activos"],
									["inactive", "Inactivos"],
								]}
							/>
						</div>
						<div className="crm-table-wrap">
							<table className="crm-table">
								<thead>
									<tr>
										<th>Cliente</th>
										<th>Contacto</th>
										<th>Estado</th>
										<th>Propiedades</th>
										<th>
											<span className="sr-only">Acciones</span>
										</th>
									</tr>
								</thead>
								<tbody>
									{visible
										.slice(
											(Math.min(page, pages) - 1) * 10,
											Math.min(page, pages) * 10,
										)
										.map((row) => (
											<tr key={row.id}>
												<td>
													<div className="customer-name">
														<span
															className="customer-avatar"
															aria-hidden="true"
														>
															{row.name.slice(0, 2)}
														</span>
														<div>
															<b>{row.name}</b>
															<small>
																{row.kind === "company"
																	? "Empresa"
																	: row.kind === "person"
																		? "Persona"
																		: "Perfil pendiente de completar"}
															</small>
														</div>
													</div>
												</td>
												<td>
													{row.email || "Sin correo"}
													<small>{row.phone || "Sin móvil registrado"}</small>
												</td>
												<td>
													<span
														className={`status-tag ${row.status ?? "prospect"}`}
													>
														{row.status
															? statuses[row.status]
															: "Por completar"}
													</span>
												</td>
												<td>{row.property_count}</td>
												<td>
													<button
														type="button"
														className="quiet-button"
														disabled={busy}
														onClick={() => open(row.id)}
													>
														Abrir expediente →
													</button>
												</td>
											</tr>
										))}
								</tbody>
							</table>
							{!visible.length ? (
								<div className="crm-empty">
									<h3>
										{query ? "No hay coincidencias" : "Tu cartera empieza aquí"}
									</h3>
									<p>
										Crea el primer expediente con sus contactos, dirección y
										preferencias.
									</p>
								</div>
							) : null}
						</div>
						<div className="crm-pagination">
							<span>
								{visible.length} resultados · Página {Math.min(page, pages)} de{" "}
								{pages}
							</span>
							<div>
								<button
									type="button"
									className="quiet-button"
									disabled={page <= 1}
									onClick={() => setPage((p) => p - 1)}
								>
									Anterior
								</button>
								<button
									type="button"
									className="quiet-button"
									disabled={page >= pages}
									onClick={() => setPage((p) => p + 1)}
								>
									Siguiente
								</button>
							</div>
						</div>
					</div>
				</>
			) : (
				<>
					<div className="crm-profile-heading">
						<div>
							<button
								type="button"
								className="back-button"
								onClick={() => {
									if (
										confirm(
											"¿Volver al directorio? Los cambios sin guardar se descartarán.",
										)
									) {
										setDraft(null);
										setError("");
										setNotice("");
									}
								}}
							>
								← Directorio de clientes
							</button>
							<h2>{record?.name || "Nuevo expediente"}</h2>
							<p>
								{record
									? `Revisión ${record.revision ?? 0} · Perfil y relaciones del cliente`
									: "Completa identidad, contactos y dirección para crear la cuenta."}
							</p>
						</div>
						<span className={`status-tag ${draft.status}`}>
							{statuses[draft.status]}
						</span>
					</div>
					<div
						className="crm-tabs"
						role="tablist"
						aria-label="Secciones del expediente"
					>
						{[
							["identidad", "01 · Identidad"],
							["contactos", "02 · Contactos y responsables"],
							["direcciones", "03 · Direcciones"],
							["comunicacion", "04 · Seguimiento"],
							["actividad", "05 · Actividad"],
						].map(([key, label]) => (
							<button
								key={key}
								type="button"
								role="tab"
								aria-selected={tab === key}
								aria-controls={`pane-${key}`}
								id={`tab-${key}`}
								onClick={() => setTab(key)}
							>
								{label}
							</button>
						))}
					</div>
					<div
						className="crm-profile-panel"
						role="tabpanel"
						id={`pane-${tab}`}
						aria-labelledby={`tab-${tab}`}
					>
						{tab === "identidad" ? (
							<>
								<div className="section-caption">
									<h3>Identidad del cliente</h3>
									<p>Persona o empresa titular de la relación comercial.</p>
								</div>
								<div className="crm-form-grid">
									<Field
										label="Tipo de cuenta"
										value={draft.kind}
										onChange={(v) => patch("kind", v as CustomerDraft["kind"])}
										options={[
											["person", "Persona"],
											["company", "Empresa"],
										]}
									/>
									<Field
										label="Estado comercial"
										value={draft.status}
										onChange={(v) =>
											patch("status", v as CustomerDraft["status"])
										}
										options={[
											["prospect", "Prospecto"],
											["active", "Activo"],
											["inactive", "Inactivo"],
										]}
									/>
									<Field
										label="Nombre"
										value={draft.first_name}
										onChange={(v) => patch("first_name", v)}
										uppercase
										required={draft.kind === "person"}
										error={fields.first_name}
									/>
									<Field
										label="Apellido"
										value={draft.last_name}
										onChange={(v) => patch("last_name", v)}
										uppercase
										required={draft.kind === "person"}
										error={fields.last_name}
									/>
									<Field
										label="Razón social"
										value={draft.company_name}
										onChange={(v) => patch("company_name", v)}
										uppercase
										required={draft.kind === "company"}
										error={fields.company_name}
									/>
									<Field
										label="Estado civil (opcional)"
										value={draft.marital_status}
										onChange={(v) =>
											patch(
												"marital_status",
												v as CustomerDraft["marital_status"],
											)
										}
										options={[
											["", "Sin registrar"],
											["single", "Soltero/a"],
											["married", "Casado/a"],
											["partner", "Unión de hecho"],
											["divorced", "Divorciado/a"],
											["widowed", "Viudo/a"],
											["undisclosed", "Prefiere no indicar"],
										]}
									/>
									<Field
										label="Idioma de atención"
										value={draft.language}
										onChange={(v) => patch("language", v as "es" | "en")}
										options={[
											["es", "Español"],
											["en", "English"],
										]}
									/>
									<Field
										label="Zona horaria"
										value={draft.timezone}
										onChange={(v) => patch("timezone", v)}
										error={fields.timezone}
									/>
								</div>
								<Field
									label="Notas de la relación"
									value={draft.notes}
									onChange={(v) => patch("notes", v)}
								/>
							</>
						) : null}
						{tab === "contactos" ? (
							<>
								<div className="section-caption">
									<h3>Personas, responsabilidades y comunicación</h3>
									<p>
										Indica quién contrata, quién autoriza y a quién debemos
										contactar. Puede ser el titular, su cónyuge, un hijo o un
										representante.
									</p>
								</div>
								{draft.contacts.map((c, i) => (
									<section className="contact-card" key={c.id ?? i}>
										<div className="contact-heading">
											<h4>Contacto {i + 1}</h4>
											{draft.contacts.length > 1 ? (
												<button
													className="quiet-button"
													type="button"
													onClick={() =>
														patch(
															"contacts",
															draft.contacts.filter((_, index) => index !== i),
														)
													}
												>
													Quitar contacto
												</button>
											) : (
												<button
													className="quiet-button"
													type="button"
													onClick={() =>
														contact(i, {
															first_name: draft.first_name,
															last_name: draft.last_name,
														})
													}
												>
													Usar datos del titular
												</button>
											)}
										</div>
										<div className="crm-form-grid">
											<Field
												label="Nombre"
												value={c.first_name}
												onChange={(v) => contact(i, { first_name: v })}
												uppercase
												required
												error={fields[`contacts.${i}.first_name`]}
											/>
											<Field
												label="Apellido"
												value={c.last_name}
												onChange={(v) => contact(i, { last_name: v })}
												uppercase
												required
												error={fields[`contacts.${i}.last_name`]}
											/>
											<Field
												label="Relación con el cliente"
												value={c.relationship}
												onChange={(v) =>
													contact(i, {
														relationship: v as Contact["relationship"],
													})
												}
												options={[
													["self", "Titular"],
													["spouse", "Cónyuge"],
													["child", "Hijo/a"],
													["representative", "Representante"],
													["other", "Otro contacto"],
												]}
											/>
											<Field
												label="Correo electrónico"
												type="email"
												value={c.email}
												onChange={(v) => contact(i, { email: v })}
												error={fields[`contacts.${i}.email`]}
											/>
											<PhoneField label="Teléfono móvil" value={c.phone_mobile} onChange={(v) => contact(i, { phone_mobile: v })} defaultCountry={draft.addresses.find(a=>a.label === "home")?.country || draft.addresses[0]?.country || "US"} error={fields[`contacts.${i}.phone_mobile`]} />
											<PhoneField label="Teléfono de casa" value={c.phone_home} onChange={(v) => contact(i, { phone_home: v })} defaultCountry={draft.addresses.find(a=>a.label === "home")?.country || draft.addresses[0]?.country || "US"} error={fields[`contacts.${i}.phone_home`]} />
											<PhoneField label="Teléfono de oficina" value={c.phone_office} onChange={(v) => contact(i, { phone_office: v })} defaultCountry={draft.addresses.find(a=>a.label === "home")?.country || draft.addresses[0]?.country || "US"} error={fields[`contacts.${i}.phone_office`]} />
											<Field
												label="Teléfono preferido para llamadas"
												value={c.preferred_phone}
												onChange={(v) =>
													contact(i, {
														preferred_phone: v as Contact["preferred_phone"],
													})
												}
												options={[
													["mobile", "Móvil"],
													["home", "Casa"],
													["office", "Oficina"],
												]}
												error={fields[`contacts.${i}.preferred_phone`]}
											/>
											<Field
												label="Canal preferido"
												value={c.preferred_channel}
												onChange={(v) =>
													contact(i, {
														preferred_channel:
															v as Contact["preferred_channel"],
													})
												}
												options={[
													["call", "Llamada"],
													["sms", "SMS"],
													["whatsapp", "WhatsApp"],
													["email", "Correo electrónico"],
												]}
											/>
											<Field
												label="Contactar desde"
												type="time"
												value={c.contact_from}
												onChange={(v) => contact(i, { contact_from: v })}
											/>
											<Field
												label="Contactar hasta"
												type="time"
												value={c.contact_to}
												onChange={(v) => contact(i, { contact_to: v })}
												error={fields[`contacts.${i}.contact_to`]}
											/>
										</div>
										<fieldset className="crm-checks">
											<legend>Responsabilidades</legend>
											{Object.entries(roleLabels).map(([role, label]) => (
												<label key={role}>
													<input
														type="checkbox"
														checked={c.roles.includes(
															role as Contact["roles"][number],
														)}
														onChange={(e) =>
															contact(i, {
																roles: e.target.checked
																	? [
																			...c.roles,
																			role as Contact["roles"][number],
																		]
																	: c.roles.filter((r) => r !== role),
															})
														}
													/>
													{label}
												</label>
											))}
										</fieldset>
										<fieldset className="crm-checks">
											<legend>Autorizaciones de comunicación</legend>
											{[
												["consent_sms", "Autoriza SMS"],
												["consent_whatsapp", "Autoriza WhatsApp"],
												["consent_email", "Autoriza correos"],
											].map(([key, label]) => (
												<label key={key}>
													<input
														type="checkbox"
														checked={Boolean(c[key as keyof Contact])}
														onChange={(e) =>
															contact(i, { [key]: e.target.checked })
														}
													/>
													{label}
												</label>
											))}
										</fieldset>
									</section>
								))}
								<button
									type="button"
									className="secondary-button"
									onClick={() =>
										patch("contacts", [
											...draft.contacts,
											{ ...freshContact(), relationship: "other", roles: [] },
										])
									}
								>
									＋ Añadir persona de contacto
								</button>
							</>
						) : null}
						{tab === "direcciones" ? (
							<>
								<div className="section-caption">
									<h3>Direcciones y ubicación</h3>
									<p>
										Separa la dirección de atención, facturación y servicio.
										Revisa los campos después de seleccionar una sugerencia.
									</p>
								</div>
								{draft.addresses.map((a, i) => (
									<section className="contact-card" key={a.id ?? i}>
										<AddressLookup
											address={a}
											onChange={(value) => address(i, value)}
										/>
										<div className="crm-form-grid">
											<Field
												label="Tipo de dirección"
												value={a.label}
												onChange={(v) =>
													address(i, { label: v as Address["label"] })
												}
												options={[
													["home", "Residencia"],
													["billing", "Facturación"],
													["service", "Servicio"],
													["office", "Oficina"],
												]}
											/>
											<Field
												label="País (código ISO)"
												value={a.country}
												onChange={(v) => address(i, { country: v })}
												uppercase
												required
											/>
											<Field
												label="Calle y número"
												value={a.line1}
												onChange={(v) => address(i, { line1: v })}
												uppercase
												required
												error={fields[`addresses.${i}.line1`]}
											/>
											<Field
												label="Unidad / apartamento"
												value={a.line2}
												onChange={(v) => address(i, { line2: v })}
												uppercase
											/>
											<Field
												label="Ciudad"
												value={a.city}
												onChange={(v) => address(i, { city: v })}
												uppercase
												required
											/>
											<Field
												label="Estado / provincia"
												value={a.region}
												onChange={(v) => address(i, { region: v })}
												uppercase
												required
											/>
											<Field
												label="Código postal"
												value={a.postal_code}
												onChange={(v) => address(i, { postal_code: v })}
												uppercase
												required
											/>
											<Field
												label="Latitud"
												type="number"
												value={a.latitude === null ? "" : String(a.latitude)}
												onChange={(v) =>
													address(i, { latitude: v === "" ? null : Number(v) })
												}
											/>
											<Field
												label="Longitud"
												type="number"
												value={a.longitude === null ? "" : String(a.longitude)}
												onChange={(v) =>
													address(i, { longitude: v === "" ? null : Number(v) })
												}
											/>
										</div>
										<div className="contact-heading">
											<a
												target="_blank"
												rel="noreferrer"
												href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.latitude !== null && a.longitude !== null ? `${a.latitude},${a.longitude}` : [a.line1, a.city, a.region, a.postal_code, a.country].join(", "))}`}
											>
												Abrir ubicación en Google Maps ↗
											</a>
											{draft.addresses.length > 1 ? (
												<button
													type="button"
													className="quiet-button"
													onClick={() =>
														patch(
															"addresses",
															draft.addresses.filter((_, index) => index !== i),
														)
													}
												>
													Quitar dirección
												</button>
											) : null}
										</div>
									</section>
								))}
								<button
									type="button"
									className="secondary-button"
									onClick={() =>
										patch("addresses", [...draft.addresses, freshAddress()])
									}
								>
									＋ Añadir dirección
								</button>
							</>
						) : null}
						{tab === "comunicacion" ? (
							<>
								<div className="section-caption">
									<h3>Seguimiento de la relación</h3>
									<p>
										Las preferencias y horarios se configuran por persona en
										Contactos. Los recordatorios siguientes son tareas internas;
										no afirman enviar SMS, WhatsApp ni correo.
									</p>
								</div>
								{record ? (
									<>
										<div className="crm-form-grid">
											<Field
												label="Próxima acción"
												value={reminder.title}
												onChange={(v) => setReminder({ ...reminder, title: v })}
											/>
											<Field
												label="Fecha y hora"
												type="datetime-local"
												value={reminder.due_at}
												onChange={(v) =>
													setReminder({ ...reminder, due_at: v })
												}
											/>
											<Field
												label="Canal previsto"
												value={reminder.channel}
												onChange={(v) =>
													setReminder({ ...reminder, channel: v })
												}
												options={[
													["call", "Llamada"],
													["sms", "SMS"],
													["whatsapp", "WhatsApp"],
													["email", "Correo"],
												]}
											/>
										</div>
										<button
											type="button"
											disabled={busy}
											onClick={async () => {
												if (!reminder.due_at) {
													setError("Selecciona la fecha del recordatorio.");
													return;
												}
												setBusy(true);
												try {
													const r = await fetch("/api/customers", {
														method: "POST",
														headers: { "Content-Type": "application/json" },
														body: JSON.stringify({
															...reminder,
															action: "reminder",
															customer_id: record.id,
															due_at: new Date(reminder.due_at).toISOString(),
														}),
													});
													const value = await r.json();
													if (!r.ok) throw new Error(value.error);
													await open(record.id ?? "");
													setTab("comunicacion");
													setNotice("Recordatorio interno programado.");
												} catch (e) {
													setError(
														e instanceof Error
															? e.message
															: "No se pudo guardar.",
													);
												} finally {
													setBusy(false);
												}
											}}
										>
											Programar seguimiento
										</button>
										<div className="crm-timeline">
											{record.reminders.map((r) => (
												<article key={r.id}>
													<span className="status-tag">
														{r.status === "pending"
															? "Pendiente"
															: r.status === "completed"
																? "Completado"
																: "Cancelado"}
													</span>
													<h4>{r.title}</h4>
													<p>
														{new Date(r.due_at).toLocaleString("es")} ·{" "}
														{r.channel}
													</p>
												</article>
											))}
										</div>
									</>
								) : (
									<p>
										Guarda el expediente para programar el primer seguimiento.
									</p>
								)}
							</>
						) : null}
						{tab === "actividad" ? (
							<>
								<div className="section-caption">
									<h3>Historial del expediente</h3>
									<p>
										Registro de creación y revisiones, sin sobrescribir
										silenciosamente una versión más reciente.
									</p>
								</div>
								<div className="crm-timeline">
									{record?.audit.length ? (
										record.audit.map((a) => (
											<article key={a.revision}>
												<span className="status-tag">
													Revisión {a.revision}
												</span>
												<h4>
													{a.action === "created"
														? "Cliente creado"
														: "Expediente actualizado"}
												</h4>
												<p>{new Date(a.occurred_at).toLocaleString("es")}</p>
											</article>
										))
									) : (
										<p>La actividad aparecerá después del primer guardado.</p>
									)}
								</div>
							</>
						) : null}
					</div>
					<div className="crm-savebar">
						<span>
							{record
								? "Los cambios se guardarán como una nueva revisión."
								: "Campos marcados con * obligatorios. Completa las tres primeras secciones."}
						</span>
						<button type="button" disabled={busy} onClick={save}>
							{busy
								? "Guardando…"
								: record
									? "Guardar cambios"
									: "Crear cliente"}
						</button>
					</div>
				</>
			)}
		</section>
	);
}
