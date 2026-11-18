export function uploadReady(): boolean;
export function normalizePhoto(
	bytes: Buffer,
): Promise<{ data: Buffer; info: { width: number; height: number } }>;
export function savePhoto(
	db: unknown,
	input: Record<string, string>,
	bytes: Buffer,
): Promise<{ id: string }>;
export function readPhoto(db:unknown,row: {
	id: string;
	pathname: string;
}): Promise<ReadableStream | Uint8Array | null>;
