export class SurveyError extends Error {
	status: number;
	constructor(message: string, status?: number);
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
