"use client";
import Image from "next/image";
import { useEffect, useId, useState } from "react";
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
const zoneKinds = {
	lawn: "Césped",
	garden: "Jardín / jardinera",
	driveway: "Driveway / garaje",
	walkway: "Sendero",
	patio: "Patio",
	other: "Otra zona",
};
const elementKinds = {
	tree: "Árbol",
	fruit_tree: "Árbol frutal",
	planter: "Jardinera",
	hedge: "Seto",
	irrigation: "Riego",
	lawn: "Césped",
	surface: "Superficie",
	other: "Otro elemento",
};
const services = {
	maintenance: "Mantenimiento",
	mowing: "Corte de césped",
	pruning: "Poda",
	planting: "Siembra",
	snow: "Retiro de nieve",
	inspection: "Inspección",
	preserve: "Conservación",
	other: "Otro trabajo",
};
const frequencies = {
	on_request: "A pedido",
	weekly: "Semanal",
	every14days: "Cada 14 días",
	monthly: "Mensual",
	quarterly: "Trimestral",
	annual: "Anual",
	seasonal: "Por temporada",
};
const seasons = {
	all: "Todo el año",
	spring: "Primavera",
	summer: "Verano",
	autumn: "Otoño",
	winter: "Invierno",
};
function Field({
	label,
	name,
	value,
	options,
	type = "text",
	required = false,
}: {
	label: string;
	name: string;
	value?: string | number | null;
	options?: Record<string, string>;
	type?: string;
	required?: boolean;
}) {
	const id = useId();
	return (
		<label htmlFor={id}>
			{label}
			{required ? " *" : ""}
			{options ? (
				<select
					id={id}
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
					maxLength={type === "text" ? 200 : undefined}
				/>
			)}
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
	const [data, setData] = useState<Data | null>(null),
		[tab, setTab] = useState("overview"),
		[edit, setEdit] = useState<Item | null>(null),
		[creating, setCreating] = useState(false),
		[error, setError] = useState(""),
		[notice, setNotice] = useState(""),
		[busy, setBusy] = useState(false),
		[map, setMap] = useState(false);
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
		let saved = false;
		try {
			const r = await fetch("/api/survey", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			});
			const value = await r.json();
			if (!r.ok) throw new Error(value.error);
			saved = true;
			setEdit(null);
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
													{zoneKinds[z.kind as keyof typeof zoneKinds]} ·{" "}
													{z.area === null
														? "Sin medir"
														: `${z.area} ${z.unit === "sqft" ? "ft²" : "m²"}`}
												</p>
												<span className="pill">
													{
														{
															estimated: "Estimada",
															measured: "Medida",
															verified: "Verificada",
														}[z.measurement_status ?? "estimated"]
													}
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
										y elemento.
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
										Superficie declarada en {unit === "sqft" ? "ft²" : "m²"}:{" "}
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
											latitude: numeric(input.latitude),
											longitude: numeric(input.longitude),
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
											/>
											<Field
												label="Tipo"
												name="kind"
												value={edit?.kind}
												options={tab === "zones" ? zoneKinds : elementKinds}
											/>
											{tab === "zones" ? (
												<>
													<Field
														label="Superficie (no longitud)"
														name="area"
														type="number"
														value={edit?.area}
													/>
													<Field
														label="Unidad de superficie"
														name="unit"
														value={edit?.unit ?? "sqft"}
														options={{
															sqft: "Pies cuadrados (ft²)",
															sqm: "Metros cuadrados (m²)",
														}}
													/>
													<Field
														label="Calidad de la medida"
														name="measurement_status"
														value={edit?.measurement_status ?? "estimated"}
														options={{
															estimated: "Estimada",
															measured: "Medida en campo",
															verified: "Verificada",
														}}
													/>
												</>
											) : (
												<>
													<Field
														label="Zona"
														name="zone_id"
														value={edit?.zone_id}
														options={Object.fromEntries(
															data.zones.map((z) => [z.id, z.name]),
														)}
														required
													/>
													<Field
														label="Cantidad"
														name="quantity"
														type="number"
														value={edit?.quantity ?? 1}
														required
													/>
													<Field
														label="Unidad"
														name="unit"
														value={edit?.unit ?? "each"}
														options={{
															each: "Unidades",
															sqft: "Pies cuadrados (ft²)",
															sqm: "Metros cuadrados (m²)",
															ft: "Pies lineales (ft)",
															m: "Metros lineales (m)",
														}}
													/>
													<Field
														label="Servicio previsto"
														name="service"
														value={edit?.service ?? "maintenance"}
														options={services}
													/>
													<Field
														label="Frecuencia prevista"
														name="frequency"
														value={edit?.frequency ?? "on_request"}
														options={frequencies}
													/>
													<Field
														label="Temporada"
														name="season"
														value={edit?.season ?? "all"}
														options={seasons}
													/>
													<label>
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
											<Field
												label="Latitud del punto (opcional)"
												name="latitude"
												type="number"
												value={edit?.latitude}
											/>
											<Field
												label="Longitud del punto (opcional)"
												name="longitude"
												type="number"
												value={edit?.longitude}
											/>
											<label>
												Notas y método de medición
												<textarea
													name="notes"
													maxLength={3000}
													defaultValue={edit?.notes ?? ""}
												/>
											</label>
										</div>
										<p>
											Ubica el punto desde donde estás solo si coincide con el
											elemento o zona.
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
																	).value = String(position.coords.latitude);
																	(
																		form.elements.namedItem(
																			"longitude",
																		) as HTMLInputElement
																	).value = String(position.coords.longitude);
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
										<button type="submit">
											{busy ? "Guardando..." : "Guardar"}
										</button>
										<button
											type="button"
											onClick={() => {
												setEdit(null);
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
												? `${zoneKinds[item.kind as keyof typeof zoneKinds]} · ${item.area === null ? "Sin medir" : `${item.area} ${item.unit === "sqft" ? "ft²" : "m²"}`}`
												: `${elementKinds[item.kind as keyof typeof elementKinds]} · ${item.quantity} ${item.unit === "each" ? "unidades" : item.unit}`}
										</p>
										{item.zone_id ? (
											<p>
												{data.zones.find((z) => z.id === item.zone_id)?.name} ·{" "}
												{services[item.service as keyof typeof services]} ·{" "}
												{
													frequencies[
														item.frequency as keyof typeof frequencies
													]
												}{" "}
												· {seasons[item.season as keyof typeof seasons]}
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
												value="front"
												options={{
													front: "Frente",
													rear: "Posterior",
													side: "Lateral",
													detail: "Detalle",
													overview: "General",
												}}
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
											<strong>{photo.caption}</strong><a href={`/api/photos?id=${photo.id}`} target="_blank" rel="noreferrer">Abrir fotografía completa ↗</a>
											<span>
												{photo.element_id
													? data.elements.find((e) => e.id === photo.element_id)
															?.name
													: photo.zone_id
														? data.zones.find((z) => z.id === photo.zone_id)
																?.name
														: "Localidad completa"}
											</span>
										{!readOnly?<button type="button" className="quiet-button" disabled={busy} onClick={async()=>{if(!window.confirm('¿Retirar esta fotografía del registro activo? Se conservará en el historial.'))return;setBusy(true);setError('');try{const response=await fetch(`/api/photos?id=${photo.id}`,{method:'DELETE'});if(!response.ok)throw new Error('No se pudo retirar la fotografía.');await refresh();}catch(e){setError(e instanceof Error?e.message:'No se pudo retirar.');}finally{setBusy(false);}}}>Retirar fotografía</button>:null}</figcaption>
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
