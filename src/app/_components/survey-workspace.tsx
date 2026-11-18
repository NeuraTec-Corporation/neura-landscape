"use client";
import Image from "next/image";
import { ZoneSelector } from "./zone-selector";
import { CatalogSelect, useCatalogs } from "./catalogs";
import { useEffect, useId, useState, useRef } from "react";
type Item = {
	id: string;
	revision: number;
	name: string;
	kind: string;
	property_id: string;
	zone_id?: string;
	area?: number | null;
	unit: string;
	measurement_status?: string;
	quantity?: number;
	service?: string;
	frequency?: string;
	season?: string;
	protection_notes?: string;
	notes: string;
	latitude: number | null;
	longitude: number | null;
};
type Photo = {
	width: number;
	height: number;
	id: string;
	zone_id: string | null;
	element_id: string | null;
	viewpoint: string;
	caption: string;
};
type Data = {
	property: {
		id: string;
		name: string;
		code: string;
		address: string;
		latitude: number | null;
		longitude: number | null;
	};
	zones: Item[];
	elements: Item[];
	photos: Photo[];
	totals: Record<string, number>;
	unmeasured: number;
	uploadReady: boolean;
};
function Field({
	label,
	name,
	value,
	options,
	type = "text",
	required = false,
	catalog,
	error,
}: {
	label: string;
	name: string;
	value?: string | number | null;
	options?: Record<string, string>;
	type?: string;
	required?: boolean;
	catalog?: string;
	error?: string;
}) {
	const id = useId();
	return (
		<label htmlFor={id}>
			{label}
			{required ? " *" : ""}
			{catalog ? (
				<CatalogSelect
					id={id}
					name={name}
					category={catalog}
					defaultValue={String(value ?? "")}
					required={required}
				/>
			) : options ? (
				<select
					id={id}
					aria-invalid={!!error}
					aria-describedby={error ? `${id}-error` : undefined}
					name={name}
					defaultValue={value ?? ""}
					required={required}
				>
					{Object.entries(options).map(([key, text]) => (
						<option key={key} value={key}>
							{text}
						</option>
					))}
				</select>
			) : (
				<input
					id={id}
					name={name}
					defaultValue={value ?? ""}
					type={type}
					required={required}
					step={type === "number" ? "any" : undefined}
					min={
						name === "latitude"
							? -90
							: name === "longitude"
								? -180
								: type === "number"
									? 0
									: undefined
					}
					max={
						name === "latitude" ? 90 : name === "longitude" ? 180 : undefined
					}
					aria-invalid={!!error}
					aria-describedby={error ? `${id}-error` : undefined}
					maxLength={type === "text" ? 200 : undefined}
				/>
			)}
			{error ? (
				<small className="field-error" id={`${id}-error`}>
					{error}
				</small>
			) : null}
		</label>
	);
}
export function SurveyWorkspace({
	propertyId,
	onClose,
	readOnly = false,
}: {
	propertyId: string;
	onClose: () => void;
	readOnly?: boolean;
}) {
	const catalogs = useCatalogs();
	const editForm = useRef<HTMLFormElement>(null);
	const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
	const [data, setData] = useState<Data | null>(null),
		[tab, setTab] = useState("overview"),
		[edit, setEdit] = useState<Item | null>(null),
		[creating, setCreating] = useState(false),
		[error, setError] = useState(""),
		[notice, setNotice] = useState(""),
		[busy, setBusy] = useState(false),
		[map, setMap] = useState(false);
	useEffect(() => {
		if (Object.keys(fieldErrors).length)
			editForm.current
				?.querySelector<HTMLElement>('[aria-invalid="true"]')
				?.focus();
	}, [fieldErrors]);

	async function refresh() {
		const r = await fetch(
			`/api/survey?property_id=${encodeURIComponent(propertyId)}`,
			{ cache: "no-store" },
		);
		const value = await r.json();
		if (!r.ok) throw new Error(value.error);
		setData(value);
	}
	useEffect(() => {
		const controller = new AbortController();
		fetch(`/api/survey?property_id=${encodeURIComponent(propertyId)}`, {
			signal: controller.signal,
			cache: "no-store",
		})
			.then(async (r) => {
				const value = await r.json();
				if (!r.ok) throw new Error(value.error);
				setData(value);
			})
			.catch((e) => {
				if (e.name !== "AbortError") setError(e.message);
			});
		return () => controller.abort();
	}, [propertyId]);
	async function save(input: Record<string, unknown>) {
		setBusy(true);
		setError("");
		setNotice("");
		setFieldErrors({});
		let saved = false;
		try {
			const r = await fetch("/api/survey", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			});
			const value = await r.json();
			if (!r.ok) {
				setFieldErrors(value.fields ?? {});
				throw new Error(value.error);
			}
			saved = true;
			setEdit(null);
			setFieldErrors({});
			setError("");
			setCreating(false);
			setNotice("Levantamiento guardado.");
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "No se pudo guardar.");
		} finally {
			setBusy(false);
		}
		return saved;
	}
	const coordinate = (item: {
		latitude: number | null;
		longitude: number | null;
	}) =>
		item.latitude !== null && item.longitude !== null
			? `${item.latitude},${item.longitude}`
			: null;
	return (
		<section
			className="survey-workspace"
			aria-label="Levantamiento de la localidad"
		>
			<button
				type="button"
				className="quiet-button"
				onClick={() => {
					if (
						(creating || edit) &&
						!window.confirm("¿Salir sin guardar este formulario?")
					)
						return;
					onClose();
				}}
			>
				← Volver a localidades
			</button>
			{error ? (
				<p role="alert" className="notice error">
					{error}
					{Object.entries(fieldErrors).length ? (
						<span className="validation-list">
							{Object.entries(fieldErrors).map(([field, message]) => (
								<span key={field}>
									{(
										{
											name: "Nombre",
											kind: "Tipo",
											area: "Superficie",
											latitude: "Latitud",
											longitude: "Longitud",
											quantity: "Cantidad",
											zone_id: "Zona",
											unit: "Unidad",
											service: "Servicio",
											frequency: "Frecuencia",
											season: "Temporada",
										} as Record<string, string>
									)[field] ?? field}
									: {message}
								</span>
							))}
						</span>
					) : null}
				</p>
			) : null}
			{notice ? (
				<p role="status" className="notice">
					{notice}
				</p>
			) : null}
			{!data ? (
				<p role="status">Cargando levantamiento...</p>
			) : (
				<>
					<header className="survey-hero">
						<p className="eyebrow">FICHA DEL LUGAR · {data.property.code}</p>
						<h2>{data.property.name}</h2>
						<p>{data.property.address}</p>
						<div className="survey-stats">
							<span>
								<strong>{data.zones.length}</strong>Zonas
							</span>
							<span>
								<strong>{data.elements.length}</strong>Elementos
							</span>
							<span>
								<strong>{data.photos.length}</strong>Fotografías
							</span>
							<span>
								<strong>{data.unmeasured}</strong>Zonas sin medir
							</span>
						</div>
					</header>
					<nav className="survey-tabs" aria-label="Secciones del levantamiento">
						{Object.entries({
							overview: "Vista general",
							zones: "Zonas y medidas",
							elements: "Elementos y cuidados",
							photos: "Fotografías",
						}).map(([id, label]) => (
							<button
								key={id}
								type="button"
								aria-pressed={tab === id}
								onClick={() => {
									if (
										(creating || edit) &&
										!window.confirm("¿Cambiar de sección sin guardar?")
									)
										return;
									setEdit(null);
									setFieldErrors({});
									setError("");
									setCreating(false);
									setTab(id);
								}}
							>
								{label}
							</button>
						))}
					</nav>
					{tab === "overview" ? (
						<>
							<section className="panel">
								<h3>Conoce el lugar antes de trabajar</h3>
								<p>
									Registra las zonas sin duplicar superficies y ubica los
									elementos que requieren atención. Las medidas estimadas no se
									presentan como verificadas.
								</p>
								<div className="survey-zone-grid">
									{data.zones.map((z) => (
										<article className="survey-zone" key={z.id}>
											<span
												className={`zone-symbol ${z.kind}`}
												aria-hidden="true"
											>
												{z.kind === "lawn"
													? "▧"
													: z.kind === "driveway"
														? "▤"
														: "◈"}
											</span>
											<div>
												<h4>{z.name}</h4>
												<p>
													{catalogs.label("zone_kind", z.kind)} ·{" "}
													{z.area === null
														? "Sin medir"
														: `${z.area} ${catalogs.label("area_unit", z.unit ?? "sqft")}`}
												</p>
												<span className="pill">
													{catalogs.label(
														"measurement_quality",
														z.measurement_status ?? "estimated",
													)}
												</span>
											</div>
										</article>
									))}
								</div>
								{!data.zones.length ? (
									<p>
										Añade primero el jardín frontal, lateral, posterior,
										driveway y otras zonas del lugar.
									</p>
								) : null}
							</section>
							<section className="panel">
								<h3>Ubicación y entorno</h3>
								{coordinate(data.property) ? (
									<>
										<div className="survey-actions">
											<button type="button" onClick={() => setMap(!map)}>
												{map ? "Ocultar mapa" : "Ver mapa del entorno"}
											</button>
											<a
												target="_blank"
												rel="noreferrer"
												href={`https://earth.google.com/web/search/${coordinate(data.property)}`}
											>
												Abrir en Google Earth ↗
											</a>
											<a
												target="_blank"
												rel="noreferrer"
												href={`https://www.google.com/maps/search/?api=1&query=${coordinate(data.property)}`}
											>
												Abrir Maps ↗
											</a>
										</div>
										{map ? (
											<iframe
												title="Mapa del entorno de la localidad"
												loading="lazy"
												className="survey-map"
												src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(data.property.longitude) - 0.0015}%2C${Number(data.property.latitude) - 0.001}%2C${Number(data.property.longitude) + 0.0015}%2C${Number(data.property.latitude) + 0.001}&layer=mapnik&marker=${coordinate(data.property)}`}
											/>
										) : null}
										<p>
											El mapa sitúa la localidad. No mide superficies ni
											delimita parcelas automáticamente.
										</p>
									</>
								) : (
									<p>
										Completa latitud y longitud en Editar localidad para ubicar
										el lugar. Puedes registrar coordenadas propias en cada zona
										; los elementos usan la ubicación de la propiedad.
									</p>
								)}
							</section>
							<section className="panel">
								<h3>Cuantificación para planificar</h3>
								<p>
									Las cantidades registradas alimentarán los rendimientos y
									requerimientos por tarea. Todavía no se calcula personal,
									materiales ni costo automáticamente desde estas medidas.
								</p>
								{Object.entries(data.totals).map(([unit, amount]) => (
									<p key={unit}>
										Superficie declarada en {catalogs.label("area_unit", unit)}:{" "}
										<strong>{amount}</strong>
									</p>
								))}
							</section>
						</>
					) : null}
					{tab === "zones" || tab === "elements" ? (
						<section className="panel">
							<div className="survey-actions">
								<h3>
									{tab === "zones"
										? "Zonas y superficies"
										: "Inventario y cuidados del lugar"}
								</h3>
								{!readOnly ? (
									<button
										type="button"
										disabled={busy}
										onClick={() => {
											setEdit(null);
											setFieldErrors({});
											setError("");
											setCreating(true);
										}}
									>
										{tab === "zones" ? "+ Añadir zona" : "+ Añadir elemento"}
									</button>
								) : null}
							</div>
							{(creating || edit) && !readOnly ? (
								<form
									className="survey-form"
									key={edit?.id ?? `${tab}-new`}
									ref={editForm}
									noValidate
									onSubmit={async (e) => {
										e.preventDefault();
										const form = e.currentTarget,
											input = Object.fromEntries(new FormData(form));
										const numeric = (value: FormDataEntryValue | undefined) =>
											value === "" || value === undefined
												? null
												: Number(value);
										await save({
											...input,
											entity: tab === "zones" ? "zone" : "element",
											property_id: propertyId,
											...(edit ? { id: edit.id, revision: edit.revision } : {}),
											latitude:
												tab === "elements"
													? (edit?.latitude ?? null)
													: numeric(input.latitude),
											longitude:
												tab === "elements"
													? (edit?.longitude ?? null)
													: numeric(input.longitude),
											...(tab === "zones"
												? { area: numeric(input.area) }
												: { quantity: Number(input.quantity) }),
										});
									}}
								>
									<fieldset disabled={busy}>
										<legend>
											{edit ? "Editar" : "Registrar"}{" "}
											{tab === "zones" ? "zona" : "elemento"}
										</legend>
										<div className="survey-fields">
											<Field
												label="Nombre identificable"
												name="name"
												value={edit?.name}
												required
												error={fieldErrors.name}
											/>
											<Field
												label="Tipo"
												name="kind"
												value={
													edit?.kind ?? (tab === "zones" ? "lawn" : "tree")
												}
												catalog={tab === "zones" ? "zone_kind" : "element_kind"}
												error={fieldErrors.kind}
											/>
											{tab === "zones" ? (
												<>
													<Field
														label="Superficie (no longitud)"
														name="area"
														type="number"
														value={edit?.area}
														error={fieldErrors.area}
													/>
													<Field
														label="Unidad de superficie"
														name="unit"
														value={edit?.unit ?? "sqft"}
														catalog="area_unit"
														error={fieldErrors.unit}
													/>
													<Field
														label="Calidad de la medida"
														name="measurement_status"
														value={edit?.measurement_status ?? "estimated"}
														catalog="measurement_quality"
														error={fieldErrors.measurement_status}
													/>
												</>
											) : (
												<>
													<ZoneSelector
														zones={data.zones}
														propertyId={propertyId}
														initialValue={edit?.zone_id}
														onSaved={refresh}
														error={fieldErrors.zone_id}
													/>
													<Field
														label="Cantidad"
														name="quantity"
														type="number"
														value={edit?.quantity ?? 1}
														required
														error={fieldErrors.quantity}
													/>
													<Field
														label="Unidad"
														name="unit"
														value={edit?.unit ?? "each"}
														catalog="element_unit"
														error={fieldErrors.unit}
													/>
													<Field
														label="Servicio previsto"
														name="service"
														value={edit?.service ?? "maintenance"}
														catalog="service"
														error={fieldErrors.service}
													/>
													<Field
														label="Frecuencia prevista"
														name="frequency"
														value={edit?.frequency ?? "on_request"}
														catalog="frequency"
														error={fieldErrors.frequency}
													/>
													<Field
														label="Temporada"
														name="season"
														value={edit?.season ?? "all"}
														catalog="season"
														error={fieldErrors.season}
													/>
													<label className="field-wide">
														Conservación y precauciones
														<textarea
															name="protection_notes"
															maxLength={2000}
															defaultValue={edit?.protection_notes ?? ""}
															placeholder="Ej. preservar frutos; no cortar esta rama; proteger mascotas"
														/>
													</label>
												</>
											)}
											{tab === "zones" ? (
												<div className="coordinate-row">
													<Field
														label="Latitud del punto (opcional)"
														name="latitude"
														type="number"
														value={edit?.latitude}
														error={fieldErrors.latitude}
													/>
													<Field
														label="Longitud del punto (opcional)"
														name="longitude"
														type="number"
														value={edit?.longitude}
														error={fieldErrors.longitude}
													/>
												</div>
											) : null}
											<label className="field-wide">
												Notas y método de medición
												<textarea
													name="notes"
													maxLength={3000}
													defaultValue={edit?.notes ?? ""}
												/>
											</label>
										</div>
										{tab === "zones" ? (
											<>
												{" "}
												<p>
													Ubica el punto desde donde estás solo si coincide con
													el elemento o zona.
												</p>
												<button
													type="button"
													onClick={(event) => {
														const form = event.currentTarget.form;
														return navigator.geolocation
															? navigator.geolocation.getCurrentPosition(
																	(position) => {
																		if (form) {
																			(
																				form.elements.namedItem(
																					"latitude",
																				) as HTMLInputElement
																			).value = String(
																				position.coords.latitude,
																			);
																			(
																				form.elements.namedItem(
																					"longitude",
																				) as HTMLInputElement
																			).value = String(
																				position.coords.longitude,
																			);
																			setNotice(
																				`GPS capturado · precisión aproximada ${Math.round(position.coords.accuracy)} m.`,
																			);
																		}
																	},
																	() =>
																		setError(
																			"No se obtuvo la ubicación. Puedes ingresarla manualmente.",
																		),
																	{ enableHighAccuracy: true, timeout: 15000 },
																)
															: setError(
																	"Este dispositivo no ofrece geolocalización.",
																);
													}}
												>
													Usar mi posición GPS
												</button>
											</>
										) : null}
										<button type="submit">
											{busy ? "Guardando..." : "Guardar"}
										</button>
										<button
											type="button"
											onClick={() => {
												setEdit(null);
												setFieldErrors({});
												setError("");
												setCreating(false);
											}}
										>
											Cancelar
										</button>
									</fieldset>
								</form>
							) : null}
							<div className="survey-zone-grid">
								{(tab === "zones" ? data.zones : data.elements).map((item) => (
									<article className="survey-item" key={item.id}>
										<h4>{item.name}</h4>
										<p>
											{tab === "zones"
												? `${catalogs.label("zone_kind", item.kind)} · ${item.area === null ? "Sin medir" : `${item.area} ${catalogs.label("area_unit", item.unit ?? "sqft")}`}`
												: `${catalogs.label("element_kind", item.kind)} · ${item.quantity} ${item.unit === "each" ? "unidades" : item.unit}`}
										</p>
										{item.zone_id ? (
											<p>
												{data.zones.find((z) => z.id === item.zone_id)?.name} ·{" "}
												{catalogs.label("service", item.service ?? "")} ·{" "}
												{catalogs.label("frequency", item.frequency ?? "")} ·{" "}
												{catalogs.label("season", item.season ?? "")}
											</p>
										) : null}
										{item.protection_notes ? (
											<p className="survey-protection">
												<strong>Preservar / precauciones:</strong>{" "}
												{item.protection_notes}
											</p>
										) : null}
										<p>{item.notes}</p>
										{data.photos
											.filter(
												(p) =>
													p.element_id === item.id || p.zone_id === item.id,
											)
											.map((p) => (
												<Image
													unoptimized
													width={p.width}
													height={p.height}
													key={p.id}
													className="survey-thumb"
													loading="lazy"
													src={`/api/photos?id=${p.id}`}
													alt={p.caption}
												/>
											))}
										{coordinate(item) ? (
											<a
												target="_blank"
												rel="noreferrer"
												href={`https://www.google.com/maps/search/?api=1&query=${coordinate(item)}`}
											>
												Ver punto en mapa ↗
											</a>
										) : null}
										{!readOnly ? (
											<div className="survey-actions">
												<button
													type="button"
													disabled={busy}
													onClick={() => {
														setCreating(false);
														setEdit(item);
														setFieldErrors({});
														setError("");
													}}
												>
													Editar
												</button>
												<button
													className="quiet-button"
													type="button"
													disabled={busy}
													onClick={() => {
														if (
															window.confirm(
																`¿Eliminar ${item.name} del inventario activo? Se conservará el registro histórico.`,
															)
														)
															void save({
																entity: tab === "zones" ? "zone" : "element",
																action: "delete",
																property_id: propertyId,
																id: item.id,
																revision: item.revision,
															});
													}}
												>
													Eliminar
												</button>
											</div>
										) : null}
									</article>
								))}
							</div>
							{tab === "elements" && !data.zones.length ? (
								<p>Registra una zona antes de añadir sus elementos.</p>
							) : null}
						</section>
					) : null}
					{tab === "photos" ? (
						<section className="panel">
							<h3>Registro fotográfico</h3>
							<p>
								Fotografía general de frente y posterior; después añade detalles
								de cada zona o elemento. Las imágenes se entregan mediante
								acceso protegido.
							</p>
							{!data.uploadReady ? (
								<p role="status" className="notice">
									La subida está pendiente de conectar el almacén privado de
									Vercel. No se publicarán fotos en un almacén abierto.
								</p>
							) : null}
							{!readOnly ? (
								<form
									className="survey-form"
									onSubmit={async (e) => {
										e.preventDefault();
										const form = e.currentTarget,
											fd = new FormData(form),
											file = fd.get("photo");
										if (!(file instanceof File) || !file.size) return;
										setBusy(true);
										setError("");
										try {
											const bitmap = await createImageBitmap(file),
												scale = Math.min(
													1,
													1600 / Math.max(bitmap.width, bitmap.height),
												),
												canvas = document.createElement("canvas");
											canvas.width = Math.round(bitmap.width * scale);
											canvas.height = Math.round(bitmap.height * scale);
											canvas
												.getContext("2d")
												?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
											bitmap.close();
											const blob = await new Promise<Blob | null>((resolve) =>
												canvas.toBlob(resolve, "image/jpeg", 0.8),
											);
											if (!blob)
												throw new Error(
													"No se pudo preparar la imagen. Usa JPG, PNG o WebP.",
												);
											const query = new URLSearchParams({
												property_id: propertyId,
												zone_id: String(fd.get("zone_id") || ""),
												element_id: String(fd.get("element_id") || ""),
												viewpoint: String(fd.get("viewpoint")),
												caption: String(fd.get("caption")),
											});
											const response = await fetch(`/api/photos?${query}`, {
												method: "POST",
												headers: { "Content-Type": "application/octet-stream" },
												body: blob,
											});
											const value = await response.json();
											if (!response.ok) throw new Error(value.error);
											form.reset();
											setNotice("Fotografía guardada.");
											await refresh();
										} catch (e) {
											setError(
												e instanceof Error
													? e.message
													: "No se pudo subir la fotografía.",
											);
										} finally {
											setBusy(false);
										}
									}}
								>
									<fieldset disabled={busy || !data.uploadReady}>
										<div className="survey-fields">
											<label>
												Foto desde cámara o galería
												<input
													type="file"
													name="photo"
													accept="image/jpeg,image/png,image/webp"
													required
												/>
											</label>
											<Field
												label="Vista"
												name="viewpoint"
												catalog="photo_view"
												value="front"
												options={{
													front: "Frente",
													rear: "Posterior",
													side: "Lateral",
													detail: "Detalle",
													overview: "General",
												}}
												error={fieldErrors.viewpoint}
											/>
											<Field
												label="Zona (opcional)"
												name="zone_id"
												options={{
													"": "Toda la localidad",
													...Object.fromEntries(
														data.zones.map((z) => [z.id, z.name]),
													),
												}}
											/>
											<Field
												label="Elemento (opcional)"
												name="element_id"
												options={{
													"": "Sin elemento específico",
													...Object.fromEntries(
														data.elements.map((z) => [z.id, z.name]),
													),
												}}
											/>
											<Field
												label="Descripción de la fotografía"
												name="caption"
												required
												error={fieldErrors.caption}
											/>
										</div>
										<button type="submit">
											{busy
												? "Preparando y guardando..."
												: "Guardar fotografía"}
										</button>
									</fieldset>
								</form>
							) : null}
							<div className="survey-photo-grid">
								{data.photos.map((photo) => (
									<figure key={photo.id}>
										<Image
											unoptimized
											width={photo.width}
											height={photo.height}
											loading="lazy"
											src={`/api/photos?id=${photo.id}`}
											alt={photo.caption}
										/>
										<figcaption>
											<strong>{photo.caption}</strong>
											<a
												href={`/api/photos?id=${photo.id}`}
												target="_blank"
												rel="noreferrer"
											>
												Abrir fotografía completa ↗
											</a>
											<span>
												{photo.element_id
													? data.elements.find((e) => e.id === photo.element_id)
															?.name
													: photo.zone_id
														? data.zones.find((z) => z.id === photo.zone_id)
																?.name
														: "Localidad completa"}
											</span>
											{!readOnly ? (
												<button
													type="button"
													className="quiet-button"
													disabled={busy}
													onClick={async () => {
														if (
															!window.confirm(
																"¿Retirar esta fotografía del registro activo? Se conservará en el historial.",
															)
														)
															return;
														setBusy(true);
														setError("");
														try {
															const response = await fetch(
																`/api/photos?id=${photo.id}`,
																{ method: "DELETE" },
															);
															if (!response.ok)
																throw new Error(
																	"No se pudo retirar la fotografía.",
																);
															await refresh();
														} catch (e) {
															setError(
																e instanceof Error
																	? e.message
																	: "No se pudo retirar.",
															);
														} finally {
															setBusy(false);
														}
													}}
												>
													Retirar fotografía
												</button>
											) : null}
										</figcaption>
									</figure>
								))}
							</div>
							{!data.photos.length ? (
								<p>Aún no se han registrado fotografías.</p>
							) : null}
						</section>
					) : null}
				</>
			)}
		</section>
	);
}
