export class ManageError extends Error {
	status: number;
	fields: Record<string, string>;
	constructor(
		message: string,
		status?: number,
		fields?: Record<string, string>,
	);
}

export function withActor<T>(actor: string, fn: () => Promise<T>): Promise<T>;
