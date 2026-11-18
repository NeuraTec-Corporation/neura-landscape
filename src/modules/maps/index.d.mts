import type {PGlite} from '@electric-sql/pglite';
export class MapsError extends Error { status:number; constructor(message:string,status?:number); }
export const limits:Record<string,{day:number;month:number}>;
export function billingPeriods(now?:Date):{day:string;month:string;year:number};
export function reserveMaps(db:PGlite,kind:string,units?:number,now?:Date):Promise<{kind:string;units:number;used:Record<string,number>;limits:{day:number;month:number};billing_timezone:string}>;
export function point(p:unknown):boolean;
export function googleMatrix(points:{latitude:number;longitude:number}[],options:{key:string;fetcher?:typeof fetch}):Promise<(number|null)[][]>;
