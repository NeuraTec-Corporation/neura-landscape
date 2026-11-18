export function backupHistory(db:unknown):Promise<Record<string,unknown>[]>;
export function backupAgents(db:unknown):Promise<Record<string,unknown>[]>;
export function createPlatformBackup(db:unknown,key:Uint8Array,actor:string):Promise<{bytes:Uint8Array;id:string;checksum:string;manifest:Record<string,unknown>}>;
export function issueBackupAgent(db:unknown,subject:string):Promise<{id:string;token:string;expires:string}>;
export function revokeBackupAgent(db:unknown,id:string,actor:string):Promise<void>;
export function authenticateBackupAgent(db:unknown,token:string):Promise<string|null>;
