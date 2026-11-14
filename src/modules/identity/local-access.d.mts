export function localAccessService(
	db: unknown,
	registry: unknown,
	password: { hash(value: string): Promise<string> },
): {
	issue(
		context: { companyId: string; subjectId: string },
		email: string,
	): Promise<{ token: string; expiresAt: string }>;
	redeem(token: string, newPassword: string): Promise<{ ok: boolean }>;
};
