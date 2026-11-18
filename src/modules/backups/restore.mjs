import {quote,digest} from './index.mjs';
const q=t=>`${quote(t.schema)}.${quote(t.name)}`;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export async function restoreSnapshot(db,input){
 // This port only accepts a completely empty destination, never an overwrite.
 const existing=(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema NOT IN('pg_catalog','information_schema') AND table_type='BASE TABLE' LIMIT 1")).rows;
 if(existing.length)throw Error('Restore requires an empty isolated database');
 const snapshot=structuredClone(input);
 for(const schema of snapshot.schemas)if(schema!=='public'&&!/^tenant_[a-f0-9]{32}$/.test(schema))throw Error('Invalid restore namespace');
 for(const media of snapshot.media){
  const bytes=Buffer.from(media.base64,'base64');if(digest(bytes)!==media.sha256)throw Error('Photo checksum mismatch');
  const photos=snapshot.tables.find(t=>t.schema===media.schema&&t.name==='property_photos'),data=snapshot.tables.find(t=>t.schema===media.schema&&t.name==='property_photo_data');
  const photo=photos?.rows.find(r=>r.id===media.photo_id);if(!photo||!data)throw Error('Photo relationships missing');
  photo.pathname=`pg:${photo.id}`;data.rows=data.rows.filter(r=>r.photo_id!==photo.id);data.rows.push({photo_id:photo.id,content:`\\x${bytes.toString('hex')}`});
 }
 const identities=new Set(snapshot.tables.flatMap(t=>t.columns.filter(c=>c.identity).map(c=>c.sequence_name)));
 await db.transaction(async tx=>{
  for(const schema of snapshot.schemas)if(schema!=='public')await tx.exec(`CREATE SCHEMA ${quote(schema)}`);
  for(const sequence of snapshot.sequences)if(!identities.has(`${sequence.schema}.${sequence.name}`))await tx.exec(`CREATE SEQUENCE ${q(sequence)}`);
  for(const table of snapshot.tables){
   const columns=table.columns.map(c=>{
    if(!/^[A-Za-z0-9_\s()[\],.]+$/.test(c.type)||c.default_sql?.includes(';'))throw Error('Unsupported schema definition');
    const identity=c.identity?` GENERATED ${c.identity==='a'?'ALWAYS':'BY DEFAULT'} AS IDENTITY`:'';
    return `${quote(c.name)} ${c.type}${identity}${!c.identity&&c.default_sql?` DEFAULT ${c.default_sql}`:''}${c.required?' NOT NULL':''}`;
   });await tx.exec(`CREATE TABLE ${q(table)} (${columns.join(',')})`);
  }
  for(const table of snapshot.tables)for(let offset=0;offset<table.rows.length;offset+=500)await tx.query(`INSERT INTO ${q(table)} OVERRIDING SYSTEM VALUE SELECT * FROM jsonb_populate_recordset(NULL::${q(table)},$1::jsonb)`,[JSON.stringify(table.rows.slice(offset,offset+500))]);
  for(const foreign of [false,true])for(const table of snapshot.tables)for(const c of table.constraints.filter(c=>(c.kind==='f')===foreign)){
   if(c.definition.includes(';'))throw Error('Unsupported constraint');await tx.exec(`ALTER TABLE ${q(table)} ADD CONSTRAINT ${quote(c.name)} ${c.definition}`);
  }
  for(const table of snapshot.tables)for(const index of table.indexes){if(index.definition.includes(';'))throw Error('Unsupported index');await tx.exec(index.definition);}
  for(const table of snapshot.tables)for(const column of table.columns.filter(c=>c.sequence_name)){
	   const seq=(await tx.query('SELECT pg_get_serial_sequence($1,$2) name',[q(table),column.name])).rows[0].name||column.sequence_name;
   const value=(await tx.query(`SELECT coalesce(max(${quote(column.name)}),0)::text n FROM ${q(table)}`)).rows[0].n;
   const original=snapshot.sequences.find(s=>`${s.schema}.${s.name}`===column.sequence_name),last=original?.last_value;
   const next=last&&BigInt(last)>BigInt(value)?BigInt(last)+1n:BigInt(value)+1n;
   if(seq)await tx.query('SELECT setval($1::regclass,$2::bigint,false)',[seq,String(next)]);
  }
 });
 // Compare every restored table in canonical JSONB order, not just row counts.
 let rows=0;for(const table of snapshot.tables){
  const actual=(await db.query(`SELECT to_jsonb(t)::text row FROM ${q(table)} t ORDER BY to_jsonb(t)::text`)).rows.map(r=>JSON.parse(r.row));
  const expected=table.rows.map(r=>JSON.stringify(canonical(r))).sort();
  const observed=actual.map(r=>JSON.stringify(canonical(r))).sort();
  if(JSON.stringify(expected)!==JSON.stringify(observed))throw Error(`Restored fingerprint mismatch: ${table.schema}.${table.name}`);rows+=actual.length;
 }
 return {verified:true,schemas:snapshot.schemas.length,tables:snapshot.tables.length,rows,external_photos:snapshot.media.length,sessions_restored:false};
}
