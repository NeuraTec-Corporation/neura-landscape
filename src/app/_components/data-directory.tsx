"use client";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
export type DirectoryColumn<T> = {
	key: string;
	label: string;
	value: (row: T) => string;
	render?: (row: T) => ReactNode;
	secondary?: boolean;
};
export function DataDirectory<T extends { id: string }>({
	rows,
	columns,
	actions,
	label,
	empty = "No hay registros para mostrar.",
}: {
	rows: T[];
	columns: DirectoryColumn<T>[];
	actions: (r: T) => ReactNode;
	label: string;
	empty?: string;
}) {
	const [query, setQuery] = useState(""),
		[sort, setSort] = useState(columns[0]?.key || ""),
		[descending, setDescending] = useState(false),
		[page, setPage] = useState(1);
	const filtered = useMemo(() => {
		const q = query.trim().toLocaleLowerCase();
		const c = columns.find((c) => c.key === sort);
		return rows
			.filter(
				(r) =>
					!q || columns.some((c) => c.value(r).toLocaleLowerCase().includes(q)),
			)
			.toSorted(
				(a, b) =>
					(c
						? c.value(a).localeCompare(c.value(b), "es", { numeric: true })
						: 0) * (descending ? -1 : 1),
			);
	}, [rows, columns, query, sort, descending]);
	const pages = Math.max(1, Math.ceil(filtered.length / 10)),
		current = Math.min(page, pages);
	return (
		<section className="data-directory" aria-label={label}>
			<div className="directory-toolbar">
				<label>
					Buscar en {label.toLocaleLowerCase()}
					<input
						type="search"
						value={query}
						onChange={(e) => {
							setQuery(e.target.value);
							setPage(1);
						}}
						placeholder="Nombre, cliente, ciudad o código…"
					/>
				</label>
				<span className="directory-count">{filtered.length} registros</span>
			</div>
			<div className="directory-table-wrap">
				<table>
					<caption className="sr-only">{label}</caption>
					<thead>
						<tr>
							{columns.map((c) => (
								<th
									key={c.key}
									scope="col"
									className={c.secondary ? "table-secondary" : ""}
									aria-sort={
										sort === c.key
											? descending
												? "descending"
												: "ascending"
											: "none"
									}
								>
									<button
										type="button"
										onClick={() => {
											if (sort === c.key) setDescending(!descending);
											else {
												setSort(c.key);
												setDescending(false);
											}
											setPage(1);
										}}
									>
										{c.label}
										<span aria-hidden="true">
											{sort === c.key ? (descending ? " ↓" : " ↑") : " ↕"}
										</span>
									</button>
								</th>
							))}
							<th scope="col">Acciones</th>
						</tr>
					</thead>
					<tbody>
						{filtered.slice((current - 1) * 10, current * 10).map((r) => (
							<tr key={r.id}>
								{columns.map((c) => (
									<td
										key={c.key}
										data-label={c.label}
										className={c.secondary ? "table-secondary" : ""}
									>
										{c.render ? c.render(r) : c.value(r)}
									</td>
								))}
								<td className="directory-actions">
									<div>{actions(r)}</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{!filtered.length ? <p className="directory-empty">{empty}</p> : null}
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
