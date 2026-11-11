export function resourceCatalog(db:unknown):Promise<unknown>;
export function saveResource(db:unknown,input:unknown):Promise<{id:string}>;
export function removeResource(db:unknown,input:unknown):Promise<{id:string}>;
export function saveResourcePlan(db:unknown,input:unknown):Promise<{id:string}>;
export function saveResourceUsage(db:unknown,input:unknown,options?:{allowPrices:boolean}):Promise<{id:string}>;
export function resourceReport(db:unknown,id:string,financial?:boolean):Promise<unknown>;
export function resourceCostState(db:unknown,id:string):Promise<{totals:{materials:number;equipment:number};complete:boolean}>;
