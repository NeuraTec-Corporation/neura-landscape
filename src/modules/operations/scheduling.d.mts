export type Slot={crew_id:string;crew_name:string;scheduled_at:string;remaining_minutes:number;people:number};
export type SlotResult={id:string;revision:number;options:Slot[];reason:string};
export function suggestSlots(db:unknown,input:unknown,now?:Date):Promise<SlotResult>;
export function applySlot(db:unknown,input:unknown):Promise<{id:string}>;
export type SlotBatch={proposals:(Slot&{id:string;revision:number;name:string;previous_at:string})[];blocked:{id:string;name:string;reason:string}[]};
export function suggestPendingSlots(db:unknown,input:unknown,now?:Date):Promise<SlotBatch>;
export function applyPendingSlots(db:unknown,input:unknown):Promise<{assigned:{id:string}[];blocked:{id:string;reason:string}[];remaining:number}>;
