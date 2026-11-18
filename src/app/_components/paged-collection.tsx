"use client";
import {
	Children,
	Fragment,
	cloneElement,
	isValidElement,
	useId,
	useState,
	type ReactNode,
	type ReactElement,
} from "react";
type ChildProps = { children?: ReactNode; "data-search"?: string };
function flatten(children: ReactNode): ReactNode[] {
	return Children.toArray(children).flatMap((child) =>
		isValidElement<ChildProps>(child) && child.type === Fragment
			? flatten(child.props.children)
			: [child],
	);
}
function searchable(child: ReactNode): string {
	if (typeof child === "string" || typeof child === "number")
		return String(child);
	if (Array.isArray(child)) return child.map(searchable).join(" ");
	if (isValidElement<ChildProps>(child))
		return child.type === "button" ? "" : `${child.props["data-search"] ?? ""} ${searchable(child.props.children)}`;
	return "";
}
function normalize(value: string) {
	return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es");
}
export function PagedCollection({
	children,
	label,
	defaultSize = 7,
	className = "",
	table,
}: {
	children: ReactNode;
	label: string;
	defaultSize?: number;
	className?: string;
	table?: ReactElement<ChildProps>;
}) {
	const [query, setQuery] = useState(""),
		[draft, setDraft] = useState(""),
		[size, setSize] = useState(defaultSize),
		[page, setPage] = useState(1);
	const id = useId();
	const rows = flatten(children).filter((row) =>
		normalize(searchable(row)).includes(normalize(query.trim())),
	);
	const pages = Math.max(1, Math.ceil(rows.length / size)),
		current = Math.min(page, pages);
	const visible = rows.slice((current - 1) * size, current * size);
	const content = table ? (
		cloneElement(
			table,
			{},
			Children.map(table.props.children, (child) =>
				isValidElement<ChildProps>(child) && child.type === "tbody"
					? cloneElement(child, {}, visible)
					: child,
			),
		)
	) : (
		<div className={className}>{visible}</div>
	);
	return (
		<section className="paged-collection" aria-label={label}>
			<div className="directory-toolbar">
				<form
					onSubmit={(e) => {
						e.preventDefault();
						setQuery(draft);
						setPage(1);
					}}
					className="directory-search"
				>
					<label htmlFor={id}>Buscar en {label.toLocaleLowerCase()}</label>
					<div className="manage-actions">
						<input
							id={id}
							type="search"
							value={draft}
							onChange={(e) => {
								setDraft(e.target.value);
								setQuery(e.target.value);
								setPage(1);
							}}
							placeholder="Nombre, código o detalle…"
						/>
						<button type="submit" className="quiet-button">
							Buscar
						</button>
					</div>
				</form>
				<div className="directory-size">
					<label htmlFor={`${id}-size`}>Registros por página</label>
					<select
						id={`${id}-size`}
						value={size}
						onChange={(e) => {
							setSize(Number(e.target.value));
							setPage(1);
						}}
					>
						{[...new Set([defaultSize, 7, 10, 25, 50, 100])]
							.sort((a, b) => a - b)
							.map((n) => (
								<option key={n} value={n}>
									{n}
								</option>
							))}
					</select>
				</div>
			</div>
			<p className="directory-count" role="status">
				{rows.length ? (current - 1) * size + 1 : 0}–
				{Math.min(current * size, rows.length)} de {rows.length} registros
			</p>
			{content}
			{!rows.length ? (
				<p className="directory-empty">No hay registros que coincidan.</p>
			) : null}
			<div className="directory-pagination">
				<span>
					Página {current} de {pages}
				</span>
				<div>
					<button
						type="button"
						className="quiet-button"
						disabled={current <= 1}
						onClick={() => setPage(current - 1)}
					>
						Anterior
					</button>
					<button
						type="button"
						className="quiet-button"
						disabled={current >= pages}
						onClick={() => setPage(current + 1)}
					>
						Siguiente
					</button>
				</div>
			</div>
		</section>
	);
}
export function PagedTable({
	children,
	label,
}: {
	children: ReactElement<ChildProps>;
	label: string;
}) {
	const normalized = cloneElement(
		children,
		{},
		flatten(children.props.children),
	);
	const body = Children.toArray(normalized.props.children).find(
		(child) => isValidElement(child) && child.type === "tbody",
	);
	return (
		<PagedCollection table={normalized} label={label}>
			{isValidElement<ChildProps>(body) ? body.props.children : null}
		</PagedCollection>
	);
}
