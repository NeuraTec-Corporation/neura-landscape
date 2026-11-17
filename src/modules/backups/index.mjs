import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export const quote=name=>{if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))throw Error('Invalid backup identifier');return `"${name}"`;};
const runtimeTables=new Set(['session','verification','rateLimit','security_access_links']);
const maxPlain=24*1024*1024;
const serialized=value=>JSON.stringify(value);
export async function capture(db,{schemas,resolveSchemas,source,readExternalPhoto}={}){
 return db.transaction(async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  if(resolveSchemas)schemas=await resolveSchemas(tx);
  if(!Array.isArray(schemas)||!schemas.length||schemas.some(s=>s!=='public'&&!/^tenant_[a-f0-9]{32}$/.test(s)))throw Error('Invalid backup scope');
  const snapshot={format:'neuratec-platform-snapshot-v1',created_at:new Date().toISOString(),source:source||'local',schemas,tables:[],sequences:[],media:[],omissions:['active_sessions','one_time_verifications','rate_limits','oauth_access_refresh_id_tokens','environment_secret_values'],required_environment:['APP_AUTH_ENABLED','BETTER_AUTH_SECRET','BETTER_AUTH_URL','DATABASE_URL or local PGlite data path','GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET if Google is used']};
  const list=(await tx.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema=ANY($1::text[]) AND table_type='BASE TABLE' ORDER BY table_schema,table_name",[schemas])).rows;
  for(const t of list){
   const qualified=`${quote(t.table_schema)}.${quote(t.table_name)}`;
   const columns=(await tx.query("SELECT a.attname name,format_type(a.atttypid,a.atttypmod) type,a.attnotnull required,a.attidentity identity,pg_get_expr(d.adbin,d.adrelid) default_sql,pg_get_serial_sequence($1,a.attname) sequence_name FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum",[qualified])).rows;
   const constraints=(await tx.query("SELECT conname name,contype kind,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid=$1::regclass ORDER BY conname",[qualified])).rows;
   const indexes=(await tx.query("SELECT pg_get_indexdef(i.indexrelid) definition FROM pg_index i WHERE i.indrelid=$1::regclass AND NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conindid=i.indexrelid) ORDER BY i.indexrelid",[qualified])).rows;
   const rows=runtimeTables.has(t.table_name)?[]:(await tx.query(`SELECT to_jsonb(t)::text row FROM ${qualified} t ORDER BY to_jsonb(t)::text`)).rows.map(r=>JSON.parse(r.row));
   if(t.table_schema==='public'&&t.table_name==='account')for(const row of rows)for(const key of ['accessToken','refreshToken','idToken'])if(key in row)row[key]=null;
   snapshot.tables.push({schema:t.table_schema,name:t.table_name,columns,constraints,indexes,rows});
   if(t.table_name==='property_photos')for(const row of rows.filter(r=>!r.deleted_at&&!r.pathname.startsWith('pg:'))){
    if(!readExternalPhoto)throw Error('External photo adapter is required; partial backups are not allowed');
    const bytes=Buffer.from(await readExternalPhoto(tx,t.table_schema,row));
    if(!bytes.length||bytes.length!==row.bytes)throw Error('External photo size mismatch');
    snapshot.media.push({schema:t.table_schema,photo_id:row.id,pathname:row.pathname,sha256:digest(bytes),base64:bytes.toString('base64')});
   }
   if(Buffer.byteLength(serialized(snapshot))>maxPlain)throw Error('Snapshot exceeds the bounded package size; use a storage/streaming adapter');
  }
  snapshot.sequences=(await tx.query("SELECT schemaname schema,sequencename name,start_value::text,increment_by::text,min_value::text,max_value::text,cycle,last_value::text FROM pg_sequences WHERE schemaname=ANY($1::text[]) ORDER BY schemaname,sequencename",[schemas])).rows;
  return snapshot;
 });
}
export function seal(snapshot,key){
 if(!(key instanceof Uint8Array)||key.length!==32)throw Error('A separate 32-byte backup key is required');
 const plain=Buffer.from(serialized(snapshot));if(plain.length>maxPlain)throw Error('Snapshot exceeds package limit');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('neuratec-backup-v1'));
 const encrypted=Buffer.concat([cipher.update(gzipSync(plain)),cipher.final()]);
 return Buffer.from(serialized({format:'neuratec-backup-v1',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:encrypted.toString('base64')}));
}
export function unseal(bytes,key){
 if(key.length!==32||bytes.length>4*1024*1024)throw Error('Invalid key or package size');
 const v=JSON.parse(Buffer.from(bytes));if(v.format!=='neuratec-backup-v1')throw Error('Unsupported backup format');
 const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(v.iv,'base64'));decipher.setAAD(Buffer.from(v.format));decipher.setAuthTag(Buffer.from(v.tag,'base64'));
 const plain=gunzipSync(Buffer.concat([decipher.update(Buffer.from(v.ciphertext,'base64')),decipher.final()]),{maxOutputLength:maxPlain});
 const snapshot=JSON.parse(plain);if(snapshot.format!=='neuratec-platform-snapshot-v1')throw Error('Invalid snapshot');return snapshot;
}
// Minimal ZIP (stored entries, UTF-8). Only fixed, flat filenames are accepted.
const crc32=bytes=>{let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^(0xedb88320&-(n&1));}return (n^0xffffffff)>>>0;};
export function zip(entries){
 const local=[],central=[];let offset=0;
 for(const [name,value]of Object.entries(entries)){
  if(!/^[A-Za-z0-9_.-]+$/.test(name))throw Error('Invalid archive filename');
  const filename=Buffer.from(name),data=Buffer.from(value),crc=crc32(data),head=Buffer.alloc(30);head.writeUInt32LE(0x04034b50);head.writeUInt16LE(20,4);head.writeUInt16LE(0x800,6);head.writeUInt32LE(crc,14);head.writeUInt32LE(data.length,18);head.writeUInt32LE(data.length,22);head.writeUInt16LE(filename.length,26);
  local.push(head,filename,data);const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(filename.length,28);c.writeUInt32LE(offset,42);central.push(c,filename);offset+=head.length+filename.length+data.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(entries).length,8);end.writeUInt16LE(Object.keys(entries).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end]);
}
export function unzip(bytes){
 const entries={};let offset=0;
 while(offset+30<=bytes.length&&bytes.readUInt32LE(offset)===0x04034b50){
  const size=bytes.readUInt32LE(offset+18),length=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),name=bytes.subarray(offset+30,offset+30+length).toString('utf8'),start=offset+30+length+extra;
  if(!/^[A-Za-z0-9_.-]+$/.test(name)||entries[name]||bytes.readUInt16LE(offset+8)!==0||start+size>bytes.length)throw Error('Invalid bounded archive');
  const data=bytes.subarray(start,start+size);if(crc32(data)!==bytes.readUInt32LE(offset+14))throw Error('Archive checksum mismatch');entries[name]=data;offset=start+size;
 }
 return entries;
}
export function packageSnapshot(snapshot,key){
 const data=seal(snapshot,key),manifest={format:'neuratec-recovery-kit-v1',source:snapshot.source,created_at:snapshot.created_at,schemas:snapshot.schemas.length,tables:snapshot.tables.length,rows:snapshot.tables.reduce((n,t)=>n+t.rows.length,0),external_photos:snapshot.media.length,encrypted_sha256:digest(data),omissions:snapshot.omissions,required_environment:snapshot.required_environment};
 const bytes=zip({'manifest.json':serialized(manifest),'data.nbackup':data,'LEEME.txt':'Respaldo cifrado. Mantenga la clave separada. Desde el checkout de la version del manifiesto: npm run backup:restore -- --bundle RUTA.zip --key RUTA.key --verify-only. Para recuperar en disco indique --target RUTA_VACIA. Nunca restaure sobre produccion ni una carpeta con datos. Las sesiones y tokens OAuth requieren nuevo ingreso. Variables/secretos de proveedores se configuran aparte.'});
 if(bytes.length>3500000)throw Error('Encrypted package exceeds download limit; use a streaming destination adapter');
 return {bytes,manifest};
}
