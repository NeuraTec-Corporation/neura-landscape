export function assignedWork(db:unknown,email:string):Promise<Record<string,unknown>[]>;
export function assignedProperty(db:unknown,email:string,propertyId:string):Promise<boolean>;
export function assignedVisit(db:unknown,email:string,id:string):Promise<boolean>;
export function assignedExecutionDatabase(db:unknown,email:string,id:string):unknown;
