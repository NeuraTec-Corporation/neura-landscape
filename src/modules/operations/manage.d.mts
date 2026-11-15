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

export function audit(db:unknown,entity:string,id:string,event:string,details?:unknown):Promise<void>;

export const date:import("zod").ZodType<string>;
export function parse<T>(schema:import("zod").ZodType<T>,input:unknown):T;
