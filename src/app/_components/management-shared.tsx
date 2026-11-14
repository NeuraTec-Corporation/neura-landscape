"use client";
import { CatalogField } from "./catalogs";
import { useCallback, useEffect, useState } from "react";
export const usd = (cents: number) =>
	new Intl.NumberFormat("es-US", { style: "currency", currency: "USD" }).format(
		(cents || 0) / 100,
	);
export const today = () =>
	new Date().toLocaleDateString("sv-SE", { timeZone: "America/New_York" });
export class RequestError extends Error {
	fields: Record<string, string>;
	constructor(message: string, fields: Record<string, string> = {}) {
		super(message);
		this.fields = fields;
	}
}
export async function readManagement<T>(area: string, query = ""): Promise<T> {
	const r = await fetch(`/api/management?area=${area}${query}`, {
			cache: "no-store",
		}),
		v = await r.json();
	if (!r.ok) throw new RequestError(v.error, v.fields);
	return v;
}
export async function writeManagement(area: string, input: unknown) {
	const r = await fetch(`/api/management?area=${area}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		}),
		v = await r.json();
	if (!r.ok) throw new RequestError(v.error, v.fields);
	return v;
}
export function useManagement<T>(area: string) {
	const [data, setData] = useState<T | null>(null),
		[error, setError] = useState(""),
		[notice, setNotice] = useState(""),
		[busy, setBusy] = useState(false);
	const refresh = useCallback(async () => {
		setData(await readManagement<T>(area));
	}, [area]);
	useEffect(() => {
		refresh().catch((e) => setError(e.message));
	}, [refresh]);
	const save = async (input: unknown) => {
		setBusy(true);
		setError("");
		setNotice("");
		let saved = false;
		try {
			await writeManagement(area, input);
			saved = true;
			setNotice("Cambios guardados.");
			await refresh();
			return true;
		} catch (e) {
			setError(
				e instanceof RequestError
					? `${e.message} ${Object.values(e.fields).join(" · ")}`
					: e instanceof Error
						? e.message
						: "No se pudo guardar.",
			);
			return saved;
		} finally {
			setBusy(false);
		}
	};
	return { data, error, setError, notice, busy, refresh, save };
}
export function Notices({ error, notice }: { error: string; notice?: string }) {
	return (
		<>
			{error ? (
				<p className="notice error" role="alert">
					{error}
				</p>
			) : null}
			{notice ? (
				<p className="notice" role="status">
					{notice}
				</p>
			) : null}
		</>
	);
}
export type AmountLine = {
	clientKey: string;
	description: string;
	quantity: number;
	unit_price: number;
	category: "materials" | "equipment" | "travel" | "overhead";
};
export const emptyLine = (): AmountLine => ({
	clientKey: crypto.randomUUID(),
	description: "",
	quantity: 1,
	unit_price: 0,
	category: "materials",
});
export function AmountLines({
	lines,
	onChange,
	categories = false,
}: {
	lines: AmountLine[];
	onChange: (lines: AmountLine[]) => void;
	categories?: boolean;
}) {
	const update = (index: number, change: Partial<AmountLine>) =>
		onChange(
			lines.map((line, i) => (i === index ? { ...line, ...change } : line)),
		);
	return (
		<section className="amount-lines">
			<div className="manage-actions">
				<h3>
					{categories
						? "Detalle de consumos y costos"
						: "Conceptos del documento"}
				</h3>
				<button type="button" onClick={() => onChange([...lines, emptyLine()])}>
					＋ Añadir línea
				</button>
			</div>
			{lines.map((line, i) => (
				<fieldset className="amount-line" key={line.clientKey}>
					<legend>Línea {i + 1}</legend>
					{categories ? (
						<CatalogField
							label="Categoría"
							category="visit_cost_category"
							name="visit_cost_category"
							value={line.category}
							onChange={(next) =>
								update(i, {
									category: next as AmountLine["category"],
								})
							}
						/>
					) : null}
					<label>
						Descripción
						<input
							required
							maxLength={500}
							value={line.description}
							onChange={(e) => update(i, { description: e.target.value })}
						/>
					</label>
					<label>
						Cantidad
						<input
							type="number"
							required
							min="0.001"
							max="1000000"
							step="0.001"
							value={line.quantity}
							onChange={(e) => update(i, { quantity: Number(e.target.value) })}
						/>
					</label>
					<label>
						Costo / precio unitario (USD)
						<input
							type="number"
							required
							min="0"
							max="1000000"
							step="0.01"
							value={line.unit_price}
							onChange={(e) =>
								update(i, { unit_price: Number(e.target.value) })
							}
						/>
					</label>
					<span className="line-total">
						{usd(Math.round(line.quantity * Math.round(line.unit_price * 100)))}
					</span>
					<button
						type="button"
						className="quiet-button"
						onClick={() => onChange(lines.filter((_, index) => index !== i))}
					>
						Retirar línea
					</button>
				</fieldset>
			))}
			<p className="amount-total">
				Total de líneas:{" "}
				<strong>
					{usd(
						lines.reduce(
							(sum, line) =>
								sum +
								Math.round(line.quantity * Math.round(line.unit_price * 100)),
							0,
						),
					)}
				</strong>
			</p>
		</section>
	);
}
