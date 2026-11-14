export function canLoadSamples(role: string): boolean;
export function sampleStatus(
	db: unknown,
): Promise<{ loaded: boolean; customers: number; properties: number }>;
export function loadSampleCustomers(
	db: unknown,
	input: { confirmed: boolean; actor: string; environment?: string },
): Promise<unknown>;
