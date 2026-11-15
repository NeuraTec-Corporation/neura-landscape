// All assignment-related mutations acquire this tenant-local row before other
// locks. This also serializes the first calendar/policy insertion when empty.
export async function lockOperationalPlan(tx){
 await tx.query("INSERT INTO entity_sequences(entity,year,value) VALUES('operational_lock',0,0) ON CONFLICT(entity,year) DO UPDATE SET value=entity_sequences.value");
}
