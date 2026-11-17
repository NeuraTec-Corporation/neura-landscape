import {readFile,mkdir,readdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {unzip,unseal,digest} from '../src/modules/backups/index.mjs';
import {restoreSnapshot} from '../src/modules/backups/restore.mjs';
const args=process.argv.slice(2),value=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
async function main(){
 const bundle=value('--bundle'),keyPath=value('--key'),target=value('--target'),verify=args.includes('--verify-only');
 if(!bundle||!keyPath||!verify&&!target||verify&&target)throw Error('Use --bundle FILE.zip --key FILE.key and either --verify-only or --target EMPTY_DIRECTORY');
 const entries=unzip(await readFile(resolve(bundle))),manifest=JSON.parse(entries['manifest.json']);if(digest(entries['data.nbackup'])!==manifest.encrypted_sha256)throw Error('Encrypted package fingerprint mismatch');
 const snapshot=unseal(entries['data.nbackup'],await readFile(resolve(keyPath)));
 let destination='memory://',created=false;
 if(target){destination=resolve(target);let contents;try{contents=await readdir(destination);}catch(e){if(e.code!=='ENOENT')throw e;contents=[];}if(contents.length)throw Error('Destination is not empty. The existing local database is preserved.');await mkdir(destination,{recursive:true});created=true;}
 let db;try{db=new PGlite(destination);const result=await restoreSnapshot(db,snapshot);await db.close();db=null;console.log(JSON.stringify({...result,destination:verify?'disposable-memory':destination,source:snapshot.source,live_database_touched:false,provider_secrets_restored:false}));}
 catch(e){if(db)await db.close();if(created)await rm(destination,{recursive:true,force:true});throw e;}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
