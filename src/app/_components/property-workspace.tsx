"use client";
import { CatalogSelect, useCatalogs } from "./catalogs";
import { DataDirectory } from "./data-directory";
import { SurveyWorkspace } from "./survey-workspace";
import { useEffect, useId, useState, useRef } from "react";
import { getCountries } from "libphonenumber-js";
import { PhoneField } from "@/shared/ui";
import type {
	PropertyDraft,
	PropertyRecord,
} from "@/modules/operations/index.mjs";
import type {
	CustomerRecord,
	CustomerSummary,
} from "@/modules/customers/index.mjs";
const fieldNames: Record<string, string> = {
	customer_id: "Cliente",
	name: "Nombre de localidad",
	code: "Código interno",
	kind: "Tipo",
	status: "Estado",
	line1: "Calle y número",
	line2: "Unidad",
	city: "Ciudad",
	region: "Estado / provincia",
	postal_code: "Código postal",
	country: "País",
	latitude: "Latitud",
	longitude: "Longitud",
	contact_name: "Contacto local",
	contact_phone: "Teléfono local",
	lawn_sqft: "Césped",
	garden_sqft: "Jardines",
	paved_sqft: "Zona pavimentada",
	access_instructions: "Acceso",
	service_hours: "Horario",
	notes: "Notas",
};
const regionNames = new Intl.DisplayNames(["es"], { type: "region" });
const countryOptions = getCountries()
	.map((code) => ({ code, name: regionNames.of(code) ?? code }))
	.sort((a, b) => a.name.localeCompare(b.name, "es"));
const fresh = (customer_id: string, country = "US"): PropertyDraft => ({
	customer_id,
	name: "",
	code: "",
	kind: "residential",
	status: "active",
	line1: "",
	line2: "",
	city: "",
	region: "",
	postal_code: "",
	country,
	latitude: null,
	longitude: null,
	contact_name: "",
	contact_phone: "",
	lawn_sqft: null,
	garden_sqft: null,
	paved_sqft: null,
	access_instructions: "",
	service_hours: "",
	notes: "",
});
function SiteField({
	name,
	value,
	change,
	error,
	type = "text",
	options,
	catalog,
	required = false,
	multiline = false,
	disabled = false,
}: {
	name: string;
	value: string;
	change: (value: string) => void;
	error?: string;
	type?: string;
	options?: [string, string][];
	catalog?: string;
	required?: boolean;
	multiline?: boolean;
	disabled?: boolean;
}) {
	catalog = catalog || (name === "status" ? "property_status" : undefined);
	const id = useId();
	const props = {
		id,
		value,
		disabled,
		"aria-invalid": !!error,
		"aria-describedby": error ? `${id}-error` : undefined,
	};
	return (
		<div className="crm-field">
			<label htmlFor={id}>
				{fieldNames[name] ?? name}
				{required ? " *" : ""}
			</label>
			{catalog ? (
				<CatalogSelect
					id={id}
					name={name}
					value={value}
					onChange={change}
					category={catalog}
					required={required}
					disabled={disabled}
				/>
			) : options ? (
				<select
					{...props}
					onChange={(e) => change(e.target.value)}
					required={required}
				>
					{options.map(([v, l]) => (
						<option key={v} value={v}>
							{l}
						</option>
					))}
				</select>
			) : multiline ? (
				<textarea
					{...props}
					onChange={(e) => change(e.target.value)}
					rows={3}
					maxLength={name === "notes" ? 3000 : 2000}
				/>
			) : (
				<input
					{...props}
					onChange={(e) => change(e.target.value)}
					type={type}
					step={type === "number" ? "any" : undefined}
					maxLength={200}
					required={required}
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
export function PropertyWorkspace({
	customerId,
	embedded = false,
	onSaved,
	knownCustomer,
}: {
	customerId?: string;
	embedded?: boolean;
	onSaved?: () => Promise<void>;
	knownCustomer?: CustomerRecord;
}) {
	const catalogs = useCatalogs();
	const editorRef = useRef<HTMLFormElement>(null);
	const [detailId, setDetailId] = useState<string | null>(null);
	const [surveyId, setSurveyId] = useState<string | null>(null);
	const [customers, setCustomers] = useState<CustomerSummary[]>([]),
		[selected, setSelected] = useState(customerId ?? "");
	const [items, setItems] = useState<PropertyRecord[]>([]),
		[profile, setProfile] = useState<CustomerRecord | null>(null);
	const [draft, setDraft] = useState<PropertyDraft | null>(null),
		[loading, setLoading] = useState(false),
		[busy, setBusy] = useState(false);
	const [error, setError] = useState(""),
		[notice, setNotice] = useState(""),
		[errors, setErrors] = useState<Record<string, string>>({});
	useEffect(() => {
		const controller = new AbortController();
		fetch("/api/customers", { signal: controller.signal })
			.then(async (r) => {
				const v = await r.json();
				if (!r.ok) throw new Error(v.error);
				setCustomers(v);
			})
			.catch((e) => {
				if (e.name !== "AbortError") setError(e.message);
			});
		return () => controller.abort();
	}, []);
	useEffect(() => {
		if (customerId) setSelected(customerId);
	}, [customerId]);
	useEffect(() => {
		if (!selected) {
			setProfile(null);
			const controller = new AbortController();
			setLoading(true);
			fetch("/api/properties", { signal: controller.signal, cache: "no-store" })
				.then(async (r) => {
					const v = await r.json();
					if (!r.ok) throw new Error(v.error);
					setItems(v);
				})
				.catch((e) => {
					if (e.name !== "AbortError") setError(e.message);
				})
				.finally(() => {
					if (!controller.signal.aborted) setLoading(false);
				});
			return () => controller.abort();
		}
		const controller = new AbortController();
		setLoading(true);
		setError("");
		setProfile(null);
		setItems([]);
		Promise.all([
			fetch(`/api/properties?customer_id=${encodeURIComponent(selected)}`, {
				signal: controller.signal,
				cache: "no-store",
			}),
			fetch(`/api/customers?id=${encodeURIComponent(selected)}`, {
				signal: controller.signal,
				cache: "no-store",
			}),
		])
			.then(async (responses) => {
				const [properties, customer] = await Promise.all(
					responses.map(async (r) => {
						const v = await r.json();
						if (!r.ok) throw new Error(v.error);
						return v;
					}),
				);
				if (!controller.signal.aborted) {
					setItems(properties);
					setProfile(knownCustomer?.id === selected ? knownCustomer : customer);
				}
			})
			.catch((e) => {
				if (e.name !== "AbortError") setError(e.message);
			})
			.finally(() => {
				if (!controller.signal.aborted) setLoading(false);
			});
		return () => controller.abort();
	}, [selected, knownCustomer]);
	const draftKey = draft?.id || Boolean(draft);
	useEffect(() => {
		if (draftKey && !loading)
			requestAnimationFrame(() => {
				editorRef.current?.scrollIntoView({
					behavior: "smooth",
					block: "start",
				});
				editorRef.current?.focus({ preventScroll: true });
			});
	}, [draftKey, loading]);
	const customerName =
		customers.find((c) => c.id === selected)?.name ??
		profile?.name ??
		"Cliente";
	function edit(row: PropertyRecord) {
		setDraft({
			...row,
			lawn_sqft: row.lawn_sqft === null ? null : Number(row.lawn_sqft),
			garden_sqft: row.garden_sqft === null ? null : Number(row.garden_sqft),
			paved_sqft: row.paved_sqft === null ? null : Number(row.paved_sqft),
		});
		setErrors({});
		setError("");
		setNotice("");
	}
	function change<K extends keyof PropertyDraft>(
		name: K,
		value: PropertyDraft[K],
	) {
		setDraft((old) =>
			old
				? {
						...old,
						...([
							"line1",
							"line2",
							"city",
							"region",
							"postal_code",
							"country",
						].includes(name)
							? { latitude: null, longitude: null }
							: {}),
						[name]: value,
					}
				: old,
		);
		setErrors((old) => ({ ...old, [name]: "" }));
	}
	const textField = (
		name: keyof PropertyDraft,
		required = false,
		multiline = false,
	) => (
		<SiteField
			key={name}
			name={name}
			value={String(draft?.[name] ?? "")}
			change={(v) => change(name, v)}
			error={errors[name]}
			required={required}
			multiline={multiline}
		/>
	);
	const numberField = (name: keyof PropertyDraft) => (
		<SiteField
			key={name}
			name={name}
			type="number"
			value={draft?.[name] === null ? "" : String(draft?.[name] ?? "")}
			change={(v) => change(name, v === "" ? null : Number(v))}
			error={errors[name]}
		/>
	);
	async function save(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!draft || busy) return;
		setBusy(true);
		setError("");
		setNotice("");
		setErrors({});
		try {
			const r = await fetch("/api/properties", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(draft),
			});
			const v = await r.json();
			if (!r.ok) {
				setErrors(v.fields ?? {});
				throw new Error(v.error);
			}
			setDraft(null);
			setNotice(`Localidad guardada para ${customerName}.`);
			const refreshed = await fetch(
				`/api/properties?customer_id=${encodeURIComponent(selected)}`,
				{ cache: "no-store" },
			);
			const rows = await refreshed.json();
			if (!refreshed.ok) throw new Error(rows.error);
			setItems(rows);
			await onSaved?.();
			setDraft(null);
			setNotice(`Localidad guardada para ${customerName}.`);
		} catch (e) {
			setError(e instanceof Error ? e.message : "No se pudo guardar.");
		} finally {
			setBusy(false);
		}
	}
	if (surveyId)
		return (
			<SurveyWorkspace
				propertyId={surveyId}
				onClose={() => setSurveyId(null)}
			/>
		);
	return (
		<section
			className="property-workspace"
			aria-label="Propiedades y localidades del cliente"
		>
			{!embedded ? (
				<div className="crm-directory site-customer-picker">
					<div>
						<h2>Propiedades y localidades</h2>
						<p>
							Consulta las localidades de toda la cartera. Selecciona un cliente
							para crear nuevos lugares de servicio.
						</p>
					</div>
					<SiteField
						name="customer_id"
						value={selected}
						disabled={busy}
						options={[
							["", "Todos los clientes"],
							...customers.map((c) => [c.id, c.name] as [string, string]),
						]}
						change={(value) => {
							if (
								draft &&
								!confirm(
									"¿Cambiar cliente y descartar los cambios sin guardar?",
								)
							)
								return;
							setSelected(value);
							setDraft(null);
							setNotice("");
							setErrors({});
						}}
					/>
				</div>
			) : null}
			{error ? (
				<div role="alert" className="error">
					{error}
					<ul>
						{Object.entries(errors)
							.filter(([, v]) => v)
							.map(([k, v]) => (
								<li key={k}>
									{fieldNames[k] ?? "Localidad"}: {v}
								</li>
							))}
					</ul>
				</div>
			) : null}
			{notice ? (
				<p role="status" className="crm-notice">
					{notice}
				</p>
			) : null}
			{loading ? <p role="status">Cargando localidades del cliente…</p> : null}
			{!loading ? (
				<>
					<div className="crm-toolbar site-toolbar">
						<div>
							<p className="eyebrow">
								{selected ? customerName : "Todos los clientes"}
							</p>
							<h2>
								{items.length}{" "}
								{items.length === 1
									? "localidad de servicio"
									: "localidades de servicio"}
							</h2>
							<p>
								La dirección del cliente y cada lugar de trabajo se gestionan
								por separado.
							</p>
						</div>
						<button
							type="button"
							disabled={busy || !selected}
							onClick={() => {
								if (
									draft &&
									!confirm(
										"¿Crear otra localidad y descartar el formulario sin guardar?",
									)
								)
									return;
								setDraft(
									fresh(selected, profile?.addresses[0]?.country || "US"),
								);
								setError("");
								setErrors({});
								setNotice("");
							}}
						>
							＋ Nueva localidad
						</button>
					</div>
					{draft ? (
						<form
							ref={editorRef}
							tabIndex={-1}
							className="crm-profile-panel site-editor"
							onSubmit={save}
							noValidate
						>
							<fieldset disabled={busy}>
								<legend>
									{draft.id ? "Editar localidad" : "Nueva localidad"} ·{" "}
									{customerName}
								</legend>
								<div className="section-caption">
									<h3>Identificación del lugar</h3>
									<p>
										El código se asigna automáticamente con la empresa
										operadora, el año y un secuencial. Se conserva al editar.
									</p>
								</div>
								<div className="crm-form-grid">
									{textField("name", true)}
									<SiteField
										name="code"
										value={draft.code || "Se asignará al guardar"}
										change={() => {}}
										disabled
									/>
									<SiteField
										name="kind"
										value={draft.kind}
										change={(v) => change("kind", v as PropertyDraft["kind"])}
										catalog="property_kind"
									/>
									<SiteField
										name="status"
										value={draft.status}
										change={(v) =>
											change("status", v as PropertyDraft["status"])
										}
										options={[
											["active", "Activa"],
											["inactive", "Inactiva"],
										]}
									/>
								</div>
								<div className="section-caption">
									<h3>Dirección completa de servicio</h3>
									<p>
										Copiar una dirección es opcional. Los cambios posteriores en
										la dirección del cliente no modificarán este lugar.
									</p>
								</div>
								{profile?.addresses.length ? (
									<div className="crm-field">
										<label htmlFor="copy-customer-address">
											Usar una dirección guardada del cliente
										</label>
										<select
											id="copy-customer-address"
											value=""
											onChange={(e) => {
												const a = profile.addresses.find(
													(a) => a.id === e.target.value,
												);
												if (a)
													setDraft((old) =>
														old
															? {
																	...old,
																	line1: a.line1,
																	line2: a.line2,
																	city: a.city,
																	region: a.region,
																	postal_code: a.postal_code,
																	country: a.country,
																	latitude: a.latitude,
																	longitude: a.longitude,
																}
															: old,
													);
											}}
										>
											<option value="">
												Capturar dirección propia o seleccionar una para copiar…
											</option>
											{profile.addresses.map((a, i) => (
												<option key={a.id ?? i} value={a.id}>
													{[a.line1, a.city, a.region, a.country]
														.filter(Boolean)
														.join(", ")}
												</option>
											))}
										</select>
									</div>
								) : null}
								<div className="crm-form-grid">
									{textField("line1", true)}
									{textField("line2")}
									{textField("city", true)}
									{textField("region", true)}
									{textField("postal_code", true)}
									<SiteField
										name="country"
										value={draft.country}
										change={(v) => change("country", v)}
										options={[
											["", "Selecciona un país"],
											...countryOptions.map(
												(c) => [c.code, c.name] as [string, string],
											),
										]}
										error={errors.country}
										required
									/>
									{numberField("latitude")}
									{numberField("longitude")}
								</div>
								<p className="muted">
									Coordenadas opcionales. Cambiar la dirección elimina las
									coordenadas anteriores para evitar una ubicación incorrecta.
								</p>
								<div className="section-caption">
									<h3>Contacto e instrucciones de servicio</h3>
									<p>
										Datos específicos de esta localidad; pueden ser diferentes
										del responsable del contrato.
									</p>
								</div>
								{profile?.contacts.length ? (
									<div className="crm-field">
										<label htmlFor="copy-site-contact">
											Copiar un contacto del cliente
										</label>
										<select
											id="copy-site-contact"
											value=""
											onChange={(e) => {
												const c = profile.contacts.find(
													(c) => c.id === e.target.value,
												);
												if (c)
													setDraft((old) =>
														old
															? {
																	...old,
																	contact_name: `${c.first_name} ${c.last_name}`,
																	contact_phone:
																		c[
																			`phone_${c.preferred_phone}` as
																				| "phone_mobile"
																				| "phone_home"
																				| "phone_office"
																		] ||
																		c.phone_mobile ||
																		c.phone_home ||
																		c.phone_office,
																}
															: old,
													);
											}}
										>
											<option value="">
												Indicar otro contacto o copiar uno existente…
											</option>
											{profile.contacts.map((c, i) => (
												<option key={c.id ?? i} value={c.id}>
													{c.first_name} {c.last_name}
												</option>
											))}
										</select>
									</div>
								) : null}
								<div className="crm-form-grid">
									{textField("contact_name")}
									<PhoneField
										label="Teléfono del contacto local"
										value={draft.contact_phone}
										onChange={(v) => change("contact_phone", v)}
										defaultCountry={draft.country || "US"}
										error={errors.contact_phone}
									/>
									{textField("service_hours")}
								</div>
								<div className="section-caption">
									<h3>Superficies e indicaciones</h3>
									<p>
										Superficies en sq ft. Deja las mediciones desconocidas
										vacías.
									</p>
								</div>
								<div className="crm-form-grid">
									{numberField("lawn_sqft")}
									{numberField("garden_sqft")}
									{numberField("paved_sqft")}
								</div>
								{textField("access_instructions", false, true)}
								{textField("notes", false, true)}
								<div className="crm-savebar">
									<button
										type="button"
										className="secondary-button"
										onClick={() => {
											if (
												confirm(
													"¿Descartar los cambios sin guardar de esta localidad?",
												)
											)
												setDraft(null);
										}}
									>
										Cancelar
									</button>
									<button type="submit">
										{busy ? "Guardando…" : "Guardar localidad"}
									</button>
								</div>
							</fieldset>
						</form>
					) : null}
					<DataDirectory
						label="Localidades"
						rows={items}
						columns={[
							{
								key: "name",
								label: "Localidad",
								value: (r) => `${r.name} ${r.code}`,
								render: (r) => (
									<>
										<strong>{r.name}</strong>
										<small>{r.code}</small>
									</>
								),
							},
							{
								key: "customer",
								label: "Cliente",
								value: (r) => r.customer_name,
							},
							{
								key: "city",
								label: "Ciudad",
								value: (r) => r.city,
								secondary: true,
							},
							{
								key: "status",
								label: "Estado",
								value: (r) => catalogs.label("property_status", r.status),
								secondary: true,
							},
						]}
						actions={(r) => (
							<>
								<button
									type="button"
									className="quiet-button"
									onClick={() => {
										setSelected(r.customer_id);
										edit(r);
									}}
								>
									Editar
								</button>
								<button
									type="button"
									className="quiet-button"
									onClick={() => setDetailId(detailId === r.id ? null : r.id)}
								>
									Detalles
								</button>
							</>
						)}
					/>
					<div className="site-list">
						{items
							.filter((row) => row.id === detailId)
							.map((row) => (
								<article className="panel site-card" key={row.id}>
									<div className="panel-title">
										<div>
											<span className="eyebrow">
												{row.code || "Código pendiente"}
											</span>
											<h3>{row.name}</h3>
										</div>
										<span className={`status-tag ${row.status}`}>
											{row.status === "active" ? "Activa" : "Inactiva"}
										</span>
									</div>
									<p>
										{catalogs.label("property_kind", row.kind)} ·{" "}
										{row.customer_name}
									</p>
									<p>
										{[
											row.line1 || row.address,
											row.line2,
											row.city,
											row.region,
											row.postal_code,
											row.country,
										]
											.filter(Boolean)
											.join(", ")}
									</p>
									{!row.city ||
									!row.region ||
									!row.country ||
									!row.postal_code ? (
										<p className="site-incomplete">Dirección por completar</p>
									) : null}
									<p>
										{row.contact_name
											? `Contacto: ${row.contact_name}`
											: "Sin contacto local"}
										{row.contact_phone ? ` · ${row.contact_phone}` : ""}
									</p>
									<div className="site-facts">
										<span>
											Césped:{" "}
											{row.lawn_sqft === null
												? "Sin medir"
												: `${row.lawn_sqft} sq ft`}
										</span>
										<span>
											Jardines:{" "}
											{row.garden_sqft === null
												? "Sin medir"
												: `${row.garden_sqft} sq ft`}
										</span>
										<span>{row.contract_count} contratos vinculados</span>
									</div>
									{row.service_hours ? (
										<p>Horario: {row.service_hours}</p>
									) : null}
									{row.access_instructions ? (
										<p>Acceso: {row.access_instructions}</p>
									) : null}
									<div className="contact-heading">
										<button type="button" onClick={() => setSurveyId(row.id)}>
											Zonas, elementos y fotos
										</button>
										<a
											target="_blank"
											rel="noreferrer"
											href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.latitude !== null && row.longitude !== null ? `${row.latitude},${row.longitude}` : [row.line1 || row.address, row.city, row.region, row.country].filter(Boolean).join(", "))}`}
										>
											Abrir ubicación en Maps ↗
										</a>
										<button
											className="quiet-button"
											type="button"
											disabled={busy}
											onClick={() => {
												if (
													draft &&
													!confirm(
														"¿Abrir esta localidad y descartar el formulario sin guardar?",
													)
												)
													return;
												edit(row);
											}}
										>
											Editar localidad
										</button>
										<button
											type="button"
											disabled={busy}
											onClick={async () => {
												if (
													!window.confirm(
														`¿Eliminar ${row.name}? Se conservará el historial. Primero deben eliminarse sus contratos vinculados.`,
													)
												)
													return;
												setBusy(true);
												setError("");
												try {
													const response = await fetch("/api/properties", {
														method: "POST",
														headers: { "Content-Type": "application/json" },
														body: JSON.stringify({
															action: "delete",
															id: row.id,
															revision: row.revision,
														}),
													});
													const result = await response.json();
													if (!response.ok) throw new Error(result.error);
													setItems((items) =>
														items.filter((item) => item.id !== row.id),
													);
													setDraft(null);
													setNotice(
														"Localidad eliminada; historial conservado.",
													);
													await onSaved?.();
												} catch (e) {
													setError(
														e instanceof Error
															? e.message
															: "No se pudo eliminar.",
													);
												} finally {
													setBusy(false);
												}
											}}
										>
											Eliminar localidad
										</button>
									</div>
								</article>
							))}
					</div>
					{!items.length && !draft ? (
						<div className="crm-empty">
							<h3>Este cliente todavía no tiene localidades</h3>
							<p>
								Añade su primera propiedad, sucursal o instalación de servicio.
							</p>
						</div>
					) : null}
				</>
			) : !selected ? (
				<div className="crm-empty">
					<h3>Selecciona un cliente</h3>
					<p>Verás solo sus localidades y podrás crear tantas como necesite.</p>
				</div>
			) : null}
		</section>
	);
}
