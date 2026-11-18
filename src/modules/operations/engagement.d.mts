export function messageList(db:unknown):Promise<unknown>;
export function saveMessage(db:unknown,input:unknown):Promise<unknown>;
export function changeMessage(db:unknown,input:unknown):Promise<unknown>;
export function portalAccess(db:unknown,subject:string):Promise<unknown>;
export function portalProperty(db:unknown,subject:string,id:string):Promise<boolean>;
export function customerPortal(db:unknown,subject:string):Promise<unknown>;
export function assignPortal(db:unknown,company:string,input:unknown):Promise<unknown>;
