export function reassignPending(db: unknown): Promise<{assigned:{id:string;crew:string}[];blocked:{id:string;name:string;reason:string}[];remaining:number}>;
