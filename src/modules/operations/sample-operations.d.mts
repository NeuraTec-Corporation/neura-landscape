export function loadSampleOperations(
	db: unknown,
	input: {
		confirmed: boolean;
		actor: string;
		environment?: string;
		now?: Date;
	},
): Promise<unknown>;
