"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CatalogSelect } from "./catalogs";
export function ZoneSelector({
	zones,
	propertyId,
	initialValue,
	onSaved,
	error,
}: {
	zones: { id: string; name: string }[];
	propertyId: string;
	initialValue?: string;
	onSaved: () => Promise<void>;
	error?: string;
}) {
	const id = useId(),
		[value, setValue] = useState(initialValue ?? zones[0]?.id ?? ""),
		[open, setOpen] = useState(false),
		[busy, setBusy] = useState(false),
		[message, setMessage] = useState(""),
		dialog = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		if (open) dialog.current?.showModal();
	}, [open]);
	return (
		<div className="manage-field">
			<label htmlFor={id}>Zona *</label>
			<div className="catalog-select">
				<select
					id={id}
					name="zone_id"
					value={value}
					onChange={(e) => setValue(e.target.value)}
					required
					aria-invalid={!!error}
				>
					<option value="">Selecciona una zona...</option>
					{zones.map((z) => (
						<option key={z.id} value={z.id}>
							{z.name}
						</option>
					))}
				</select>
				<button
					type="button"
					className="catalog-add"
					aria-label="Crear una zona sin salir del elemento"
					onClick={() => setOpen(true)}
				>
					＋
				</button>
			</div>
			{error ? <small className="field-error">{error}</small> : null}
			{open
				? createPortal(
						<dialog
							ref={dialog}
							className="catalog-dialog"
							aria-label="Nueva zona de la localidad"
							onCancel={() => setOpen(false)}
						>
							<h2>Nueva zona de esta localidad</h2>
							<p>
								Se guardará la zona y quedará seleccionada en el elemento que
								estabas registrando.
							</p>
							{message ? <p role="alert">{message}</p> : null}
							<form
								className="manage-form"
								onSubmit={async (e) => {
									e.preventDefault();
									e.stopPropagation();
									setBusy(true);
									setMessage("");
									try {
										const fd = Object.fromEntries(
												new FormData(e.currentTarget),
											),
											input = {
												...fd,
												entity: "zone",
												property_id: propertyId,
												area: fd.area === "" ? null : Number(fd.area),
												measurement_status: "estimated",
												latitude: null,
												longitude: null,
												notes: "",
											};
										const response = await fetch("/api/survey", {
												method: "POST",
												headers: { "Content-Type": "application/json" },
												body: JSON.stringify(input),
											}),
											v = await response.json();
										if (!response.ok) throw new Error(v.error);
										await onSaved();
										setValue(v.id);
										setOpen(false);
									} catch (e) {
										setMessage(
											e instanceof Error
												? e.message
												: "No se pudo crear la zona.",
										);
									} finally {
										setBusy(false);
									}
								}}
							>
								<fieldset disabled={busy}>
									<div className="manage-grid">
										<label className="field-wide">
											Nombre de la zona
											<input name="name" required maxLength={150} />
										</label>
										<label htmlFor={`${id}-kind`}>
											Tipo
											<CatalogSelect
												id={`${id}-kind`}
												name="kind"
												category="zone_kind"
												defaultValue="lawn"
												required
											/>
										</label>
										<label>
											Superficie estimada
											<input
												name="area"
												type="number"
												min="0"
												max="1000000000"
												step="any"
											/>
										</label>
										<label htmlFor={`${id}-unit`}>
											Unidad
											<CatalogSelect
												id={`${id}-unit`}
												name="unit"
												category="area_unit"
												defaultValue="sqft"
												required
											/>
										</label>
									</div>
									<div className="manage-actions">
										<button type="submit">Crear y seleccionar zona</button>
										<button
											className="quiet-button"
											type="button"
											onClick={() => setOpen(false)}
										>
											Cancelar
										</button>
									</div>
								</fieldset>
							</form>
						</dialog>,
						document.body,
					)
				: null}
		</div>
	);
}
