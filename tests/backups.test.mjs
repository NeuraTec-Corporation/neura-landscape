import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {capture,packageSnapshot,unzip,unseal,digest} from '../src/modules/backups/index.mjs';
import {restoreSnapshot} from '../src/modules/backups/restore.mjs';
import {migrate} from '../src/modules/operations/migrations.mjs';
import {bootstrapCompanyStorage} from '../src/modules/operations/tenant-database.mjs';
import {issueBackupAgent,authenticateBackupAgent,revokeBackupAgent} from '../src/modules/operations/platform-backups.mjs';
test('portable encrypted backup restores identity/company schemas, validates nested data, sessions omission and refuses unsafe overwrite',async()=>{
 const source=new PGlite(),target=new PGlite();try{
  await migrate(source);const tenant=`tenant_${randomUUID().replaceAll('-','')}`;await source.transaction(tx=>bootstrapCompanyStorage(tx,tenant));
  await source.exec('CREATE TABLE "user"(id text PRIMARY KEY,email text NOT NULL); CREATE TABLE account(id text PRIMARY KEY,"userId" text REFERENCES "user"(id),password text,"accessToken" text); CREATE TABLE session(id text PRIMARY KEY,token text);');
  await source.query('INSERT INTO "user" VALUES($1,$2)',['identity','alex@example.invalid']);await source.query('INSERT INTO account VALUES($1,$2,$3,$4)',['account','identity','hashed-password','omit-oauth-token']);await source.query('INSERT INTO session VALUES($1,$2)',['active','omit-session']);
  await source.query('INSERT INTO customers VALUES($1,$2)',['customer','Alex Valdez']);await source.query(`INSERT INTO "${tenant}".customers VALUES($1,$2)`,['other','Marina Solano']);
  await source.query("INSERT INTO change_history(entity,entity_id,event,actor,details) VALUES('nested','x','created','test',$1::jsonb)",[JSON.stringify({nested:{preserve:'all nested values',number:123},list:[{important:true}]})]);
  await source.query("INSERT INTO properties(id,customer_id,name,address) VALUES('site','customer','Casa Olmos','Referencia')");
  await source.query("INSERT INTO property_photos(id,property_id,viewpoint,caption,pathname,width,height,bytes) VALUES('photo','site','front','Archivo privado','private/original',10,10,3)");
  const key=randomBytes(32),snapshot=await capture(source,{schemas:['public',tenant],source:'verified-source',readExternalPhoto:async()=>Buffer.from([1,2,3])}),pack=packageSnapshot(snapshot,key),entries=unzip(pack.bytes);assert.equal(digest(entries['data.nbackup']),pack.manifest.encrypted_sha256);
  assert.throws(()=>unseal(entries['data.nbackup'],randomBytes(32)));const restored=unseal(entries['data.nbackup'],key);assert.equal(restored.tables.find(t=>t.name==='session').rows.length,0);assert.equal(restored.tables.find(t=>t.name==='account').rows[0].accessToken,null);
  const result=await restoreSnapshot(target,restored);assert.equal(result.verified,true);assert.equal(result.external_photos,1);assert.equal((await target.query('SELECT password FROM account')).rows[0].password,'hashed-password');assert.equal((await target.query(`SELECT name FROM "${tenant}".customers`)).rows[0].name,'Marina Solano');assert.equal((await target.query('SELECT pathname FROM property_photos')).rows[0].pathname,'pg:photo');
  await assert.rejects(restoreSnapshot(target,restored),/empty/);
 }finally{await source.close();await target.close();}
});
test('backup-only agent stays bound to active platform IT and can be revoked',async()=>{
 const db=new PGlite();try{await migrate(db);await db.query("INSERT INTO app_members(email,name,role,status) VALUES('it@example.invalid','IT','it_admin','active')");await db.query("INSERT INTO security_platform_admins(subject_id) VALUES('it@example.invalid')");const a=await issueBackupAgent(db,'it@example.invalid');assert.equal(await authenticateBackupAgent(db,a.token),`agent:${a.id}`);assert.equal(await authenticateBackupAgent(db,`${a.token}wrong`),null);await revokeBackupAgent(db,a.id,'it@example.invalid');assert.equal(await authenticateBackupAgent(db,a.token),null);}finally{await db.close();}
});
