import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {capture,packageSnapshot,digest} from '../backups/index.mjs';
import {readPhoto} from './photos.mjs';
export async function backupHistory(db){return (await db.query("SELECT id,occurred_at,actor,event,details FROM public.change_history WHERE entity='platform_backup' ORDER BY id DESC LIMIT 100")).rows;}
async function journal(db,entity,id,event,actor,details){await db.query("INSERT INTO public.change_history(entity,entity_id,event,actor,details) VALUES($1,$2,$3,$4,$5::jsonb)",[entity,id,event,actor,JSON.stringify(details)]);}
export async function createPlatformBackup(db,key,actor){
 const id=randomUUID();
 try{
  const snapshot=await capture(db,{resolveSchemas:async tx=>['public',...(await tx.query("SELECT DISTINCT schema_name FROM public.security_company_storage WHERE schema_name<>'public' ORDER BY schema_name")).rows.map(r=>r.schema_name)],source:process.env.VERCEL_GIT_COMMIT_SHA||'local',readExternalPhoto:async(tx,_schema,row)=>{
   const value=await readPhoto({query:(s,p)=>tx.query(s,p)},row);if(!value)throw Error('A required private photo is unavailable');
   if(value instanceof Uint8Array)return value;const chunks=[];let size=0;for await(const chunk of value){size+=chunk.length;if(size>10000000)throw Error('Photo exceeds package capacity');chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks);
  }});
  const packaged=packageSnapshot(snapshot,key),checksum=digest(packaged.bytes);
  await journal(db,'platform_backup',id,'generated',actor,{...packaged.manifest,sha256:checksum,bytes:packaged.bytes.length,destination:'download',external_copy_confirmed:false});
  return {...packaged,id,checksum};
 }catch(error){await journal(db,'platform_backup',id,'failed',actor,{message:'No se generó un paquete completo; revisar capacidad y archivos privados.'});throw error;}
}
export async function issueBackupAgent(db,subject){
 const id=randomUUID(),token=`${id}.${randomBytes(32).toString('base64url')}`,expires=new Date(Date.now()+365*86400000).toISOString();
 await journal(db,'backup_agent',id,'issued',subject,{hash:digest(token),expires});return {id,token,expires};
}
export async function backupAgents(db){return (await db.query("SELECT a.entity_id id,a.actor,a.occurred_at,a.details->>'expires' expires,EXISTS(SELECT 1 FROM public.change_history r WHERE r.entity='backup_agent' AND r.entity_id=a.entity_id AND r.event='revoked') revoked FROM public.change_history a WHERE a.entity='backup_agent' AND a.event='issued' ORDER BY a.id DESC LIMIT 50")).rows;}
export async function revokeBackupAgent(db,id,actor){if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid agent');await journal(db,'backup_agent',id,'revoked',actor,{});}
export async function authenticateBackupAgent(db,token){
 if(typeof token!=='string'||token.length>160)return null;const id=token.split('.')[0];if(!/^[a-f0-9-]{36}$/.test(id))return null;
 const row=(await db.query("SELECT a.actor,a.details FROM public.change_history a JOIN public.security_platform_admins p ON p.subject_id=a.actor AND p.status='active' JOIN public.app_members m ON m.email=a.actor AND m.status='active' WHERE a.entity='backup_agent' AND a.entity_id=$1 AND a.event='issued' AND NOT EXISTS(SELECT 1 FROM public.change_history r WHERE r.entity='backup_agent' AND r.entity_id=a.entity_id AND r.event='revoked')",[id])).rows[0];
 if(!row||Date.parse(row.details.expires)<=Date.now())return null;
 const expected=Buffer.from(row.details.hash,'hex'),actual=Buffer.from(digest(token),'hex');return expected.length===actual.length&&timingSafeEqual(expected,actual)?`agent:${id}`:null;
}
