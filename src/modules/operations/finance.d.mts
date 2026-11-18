export function financeList(db: unknown): Promise<unknown>;
export function saveInvoice(
	db: unknown,
	input: unknown,
): Promise<{ id: string }>;
export function changeInvoice(
	db: unknown,
	input: unknown,
): Promise<{ id: string }>;
export function savePayment(
	db: unknown,
	input: unknown,
): Promise<{ id: string }>;
export function reversePayment(
	db: unknown,
	input: unknown,
): Promise<{ id: string }>;
