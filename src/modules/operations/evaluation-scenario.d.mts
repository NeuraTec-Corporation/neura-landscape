export function evaluationCheckpoint(db:unknown):Promise<{format:string;digest:string;data:Record<string,unknown[]>}>;
export function evaluationCoverage(db:unknown):Promise<unknown>;
export function enrichEvaluation(db:unknown,options:{confirmed:boolean;environment?:string;profile:string;expectedDigest:string;actor?:string;now?:Date}):Promise<unknown>;
