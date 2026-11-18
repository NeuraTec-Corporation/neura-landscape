export class SurveyError extends Error {
	status: number;
	fields: Record<string, string>;
	constructor(
		message: string,
		status?: number,
		fields?: Record<string, string>,
	);
}
export function survey(db: unknown, propertyId: string): Promise<unknown>;
export function saveSurveyItem(
	db: unknown,
	kind: string,
	input: unknown,
): Promise<{ id: string }>;
export function deleteSurveyItem(
	db: unknown,
	kind: string,
	input: unknown,
): Promise<{ id: string }>;
