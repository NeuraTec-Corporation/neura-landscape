export function evaluationAccountsAllowed(env?:Record<string,string|undefined>):boolean;
export function operatorPrefix(value:unknown):string;
export function assignUserCode(tx:unknown,companyId:string,subjectId:string,evaluationOnly?:boolean):Promise<string>;
export function ensureMemberCode(db:unknown,companyId:string,subjectId:string):Promise<string>;
export function emailForUserCode(db:unknown,companyId:string,code:string,env?:Record<string,string|undefined>):Promise<string|null>;
export function provisionEvaluationUsers(db:unknown,companyId:string,users:{name:string;role:string}[],password:{hash(value:string):Promise<string>},env?:Record<string,string|undefined>):Promise<unknown[]>;
