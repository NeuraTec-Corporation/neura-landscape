export function provisionEnterpriseScenario(
	db: unknown,
	password: { hash(value: string): Promise<string> },
	templates: unknown[],
	env?: Record<string, string | undefined>,
): Promise<unknown>;
