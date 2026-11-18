// Explicitly remove financial payloads from an operational visit permission.
export function redactFinancials(value: unknown): unknown {
	if (value instanceof Date) return value;
	if (Array.isArray(value)) return value.map(redactFinancials);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value)
				.filter(
					([key]) =>
						!/(?:cents|profitability|cost_lines|cost_complete)/.test(key),
				)
				.map(([key, item]) => [key, redactFinancials(item)]),
		);
	return value;
}
