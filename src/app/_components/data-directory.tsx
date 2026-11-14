"use client";
import { useMemo, useState } from "react";
import { PagedTable } from "./paged-collection";
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
	const [sort, setSort] = useState(columns[0]?.key || ""),
		[descending, setDescending] = useState(false);
	const filtered = useMemo(() => {
		const c = columns.find((c) => c.key === sort);
		return rows.toSorted(
			(a, b) =>
				(c
					? c.value(a).localeCompare(c.value(b), "es", { numeric: true })
					: 0) * (descending ? -1 : 1),
		);
	}, [rows, columns, sort, descending]);
	return (
		<section className="data-directory" aria-label={label}>
			<div className="directory-table-wrap">
				<PagedTable label={label}>
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
							{filtered.map((r) => (
								<tr key={r.id}>
									{columns.map((c) => (
										<td
											key={c.key}
											data-label={c.label}
 data-search={c.value(r)}
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
				</PagedTable>
			</div>
			{!filtered.length ? <p className="directory-empty">{empty}</p> : null}
		</section>
	);
}
