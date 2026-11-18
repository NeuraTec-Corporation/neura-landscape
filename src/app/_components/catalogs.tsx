"use client";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
	useId,
	useRef,
} from "react";
type Option = {
	category: string;
	key: string;
	label: string;
	active: boolean;
	revision: number;
	semantic_key: string | null;
};
type CatalogData = {
	role?: string;
	grants?: string[];
	allowedSections?: string[];
	options: Option[];
	categories: Record<string, string>;
	canEdit: boolean;
	extensible?: Record<string, boolean>;
	manageableCategories?: string[];
};
const Context = createContext<{
	data: CatalogData;
	reload: () => Promise<void>;
	open: (category: string, choose?: (key: string) => void) => void;
}>({
	data: { options: [], categories: {}, canEdit: false },
	reload: async () => {},
	open: () => {},
});
export function CatalogProvider({ children }: { children: React.ReactNode }) {
	const modal = useRef<HTMLDialogElement>(null);
	const [data, setData] = useState<CatalogData>({
			options: [],
			categories: {},
			canEdit: false,
		}),
		[dialog, setDialog] = useState<{
			category: string;
			choose?: (key: string) => void;
		} | null>(null);
	const reload = useCallback(async () => {
		const r = await fetch("/api/catalogs", { cache: "no-store" });
		if (r.ok) setData(await r.json());
	}, []);
	useEffect(() => {
		void reload();
	}, [reload]);
	useEffect(() => {
		if (dialog) modal.current?.showModal();
	}, [dialog]);
	return (
		<Context.Provider
			value={{
				data,
				reload,
				open: (category, choose) => setDialog({ category, choose }),
			}}
		>
			{children}
			{dialog ? (
				<dialog
					ref={modal}
					aria-label="Administrar opciones"
					className="catalog-dialog"
					onCancel={() => setDialog(null)}
				>
					<button
						className="quiet-button"
						type="button"
						onClick={() => setDialog(null)}
					>
						Cerrar catálogo
					</button>
					<CatalogManager
						initialCategory={dialog.category}
						onCreated={(key) => {
							dialog.choose?.(key);
							if (dialog.choose) setDialog(null);
						}}
					/>
				</dialog>
			) : null}
		</Context.Provider>
	);
}
export function useCatalogs() {
	const context = useContext(Context);
	return {
		...context,
		canManage: (category: string) =>
			context.data.canEdit &&
			(context.data.manageableCategories ?? []).includes(category),
		options: (category: string, current?: string) =>
			Object.fromEntries(
				context.data.options
					.filter(
						(o) => o.category === category && (o.active || o.key === current),
					)
					.map((o) => [o.key, `${o.label}${o.active ? "" : " (retirada)"}`]),
			),
		label: (category: string, key: string) =>
			context.data.options.find((o) => o.category === category && o.key === key)
				?.label || key,
	};
}
export function CatalogSelect({
	allowedKeys,
	category,
	name,
	value,
	defaultValue = "",
	onChange,
	required = false,
	id,
	disabled = false,
}: {
	category: string;
	allowedKeys?: readonly string[];
	name: string;
	value?: string;
	defaultValue?: string;
	onChange?: (value: string) => void;
	required?: boolean;
	id?: string;
	disabled?: boolean;
}) {
	const c = useCatalogs(),
		[selected, setSelected] = useState(defaultValue),
		generated = useId(),
		current = value ?? selected;
	const options = c.options(category, current);
	const change = (next: string) => {
		setSelected(next);
		onChange?.(next);
	};
	return (
		<div className="catalog-select">
			<select
				id={id ?? generated}
				name={name}
				value={current}
				onChange={(e) => change(e.target.value)}
				required={required}
				disabled={disabled}
			>
				<option value="">Selecciona...</option>
				{current && !options[current] ? (
					<option value={current}>{current} (histórico)</option>
				) : null}
				{Object.entries(options)
					.filter(
						([key]) =>
							!allowedKeys || allowedKeys.includes(key) || key === current,
					)
					.map(([key, label]) => (
						<option key={key} value={key}>
							{label}
						</option>
					))}
			</select>
			{c.canManage(category) && !disabled ? (
				<button
					type="button"
					className="catalog-add"
					aria-label={`Crear o administrar ${c.data.categories[category] ?? category}`}
					onClick={() => c.open(category, change)}
				>
					＋
				</button>
			) : null}
		</div>
	);
}
export function CatalogManager({
	initialCategory = "service",
	onCreated,
}: {
	initialCategory?: string;
	onCreated?: (key: string) => void;
}) {
	const c = useCatalogs(),
		[category, setCategory] = useState(initialCategory),
		[edit, setEdit] = useState<Option | null>(null),
		[error, setError] = useState(""),
		[busy, setBusy] = useState(false);
	async function send(input: unknown) {
		setBusy(true);
		setError("");
		try {
			const r = await fetch("/api/catalogs", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(input),
				}),
				v = await r.json();
			if (!r.ok) throw new Error(v.error);
			await c.reload();
			setEdit(null);
			return v.key as string;
		} catch (e) {
			setError(e instanceof Error ? e.message : "No se pudo guardar.");
			return null;
		} finally {
			setBusy(false);
		}
	}
	return (
		<section className="catalog-manager">
			<h2>Catálogos de la empresa</h2>
			<p>
				Las opciones retiradas dejan de ofrecerse en nuevos registros; sus datos
				anteriores se conservan. Los códigos, estados de ejecución, países ISO y
				permisos tienen reglas del sistema.
			</p>
			<label>
				Catálogo
				<select
					value={category}
					onChange={(e) => {
						setCategory(e.target.value);
						setEdit(null);
					}}
				>
					{Object.entries(c.data.categories).map(([key, label]) => (
						<option key={key} value={key}>
							{label}
						</option>
					))}
				</select>
			</label>
			{c.data.extensible?.[category] === false ? (
				<p className="catalog-policy">
					Opciones con reglas del sistema: edita etiquetas o disponibilidad.
				</p>
			) : null}
			{error ? (
				<p role="alert" className="notice error">
					{error}
				</p>
			) : null}
			{c.canManage(category) &&
			(edit || c.data.extensible?.[category] !== false) ? (
				<form
					className="manage-form"
					key={edit?.key ?? category}
					onSubmit={async (e) => {
						e.preventDefault();
						const form = e.currentTarget,
							fd = new FormData(form);
						const key = await send({
							category,
							...(edit ? { key: edit.key, revision: edit.revision } : {}),
							label: fd.get("label"),
							active: fd.get("active") === "on",
							semantic_key: ["service", "element_kind"].includes(category)
								? String(fd.get("semantic_key") || "other")
								: null,
						});
						if (key) {
							form.reset();
							if (!edit && fd.get("active") === "on") onCreated?.(key);
						}
					}}
				>
					<div className="manage-grid">
						<label>
							Nombre de la opción
							<input
								name="label"
								required
								maxLength={150}
								defaultValue={edit?.label ?? ""}
							/>
						</label>
						{["service", "element_kind"].includes(category) ? (
							<label>
								Clasificación para indicadores
								<select
									name="semantic_key"
									disabled={!!edit}
									defaultValue={edit?.semantic_key ?? "other"}
								>
									{c.data.options
										.filter(
											(o) =>
												o.category === category && !o.key.startsWith("custom_"),
										)
										.map((o) => (
											<option key={o.key} value={o.key}>
												{o.label}
											</option>
										))}
								</select>
							</label>
						) : null}
						<label className="check-label">
							<input
								type="checkbox"
								name="active"
								defaultChecked={edit?.active ?? true}
							/>
							Disponible en nuevos registros
						</label>
					</div>
					<div className="manage-actions">
						<button type="submit" disabled={busy}>
							{edit ? "Guardar cambios" : "Crear opción"}
						</button>
						{edit ? (
							<button
								type="button"
								className="quiet-button"
								onClick={() => setEdit(null)}
							>
								Cancelar edición
							</button>
						) : null}
					</div>
				</form>
			) : null}
			<div className="catalog-list">
				{c.data.options
					.filter((o) => o.category === category)
					.map((o) => (
						<article key={o.key}>
							<div>
								<strong>{o.label}</strong>
								<small>{o.active ? "Activa" : "Retirada del menú"}</small>
							</div>
							{c.canManage(category) ? (
								<div className="manage-actions">
									<button
										className="quiet-button"
										type="button"
										onClick={() => setEdit(o)}
									>
										Editar
									</button>
									{o.active ? (
										<button
											className="quiet-button"
											type="button"
											disabled={busy}
											onClick={() => {
												if (
													window.confirm(
														`¿Retirar ${o.label} de las opciones nuevas? Los registros históricos se conservan.`,
													)
												)
													void send({ ...o, active: false });
											}}
										>
											Eliminar del menú
										</button>
									) : (
										<button
											type="button"
											className="quiet-button"
											disabled={busy}
											onClick={() => void send({ ...o, active: true })}
										>
											Restaurar opción
										</button>
									)}
								</div>
							) : null}
						</article>
					))}
			</div>
		</section>
	);
}

export function CatalogField({
	label,
	...props
}: React.ComponentProps<typeof CatalogSelect> & { label: string }) {
	const id = useId();
	return (
		<div className="catalog-field">
			<label htmlFor={id}>{label}</label>
			<CatalogSelect {...props} id={id} />
		</div>
	);
}
