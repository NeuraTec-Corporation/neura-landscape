import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {unzip,zip,digest} from '../src/modules/backups/index.mjs';
const args=process.argv.slice(2),configIndex=args.indexOf('--config');
async function main(){
 const config=JSON.parse(process.env.NEURATEC_BACKUP_CONFIG||await readFile(resolve(args[configIndex+1]||'neura-backup-agent.private.json'),'utf8'));
 const origin=new URL(config.origin);if(origin.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(origin.hostname))throw Error('Invalid backup origin');
 const headers={Origin:origin.origin,Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'};
 if(config.vercelAutomationBypass)headers['x-vercel-protection-bypass']=config.vercelAutomationBypass;
 const r=await fetch(new URL('/api/backups',origin),{method:'POST',headers,body:JSON.stringify({action:'create',confirmed:true,key:config.key}),redirect:'manual',signal:AbortSignal.timeout(310000)});
 if(!r.ok)throw Error(`Backup not downloaded (${r.status}). Check agent authorization and Vercel deployment protection. No files were replaced.`);
 const bytes=Buffer.from(await r.arrayBuffer());if(digest(bytes)!==r.headers.get('x-backup-sha256'))throw Error('Download fingerprint mismatch');
 const entries=unzip(bytes),manifest=JSON.parse(entries['manifest.json']),head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 if(manifest.source!=='local'&&manifest.source!==head)throw Error('Checkout and backup source differ. Update the same checkout before packaging.');
 const source=execFileSync('git',['archive','--format=zip','HEAD'],{maxBuffer:30000000});
 const kit=zip({'application-source.zip':source,'platform-data.zip':bytes,'manifest.json':JSON.stringify({...manifest,source_sha:head,source_zip_sha256:digest(source),data_zip_sha256:digest(bytes)}),'RECUPERAR.txt':'Extraiga application-source.zip en la carpeta de recuperacion. Instale Node/npm de package.json, ejecute npm ci y npm run backup:restore -- --bundle RUTA/platform-data.zip --key RUTA/clave.key --verify-only. Para recuperar use --target CARPETA_VACIA. La clave y los secretos se custodian separados. La autenticacion local completa requiere PostgreSQL configurado; PGlite sirve para datos/verificacion. No conecta automaticamente con la base publicada.'});
 const directory=resolve(config.output||'backups/automaticos');await mkdir(directory,{recursive:true});const file=join(directory,`neura-recovery-${new Date().toISOString().replaceAll(':','-')}.zip`);await writeFile(file,kit,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({saved:true,file,bytes:kit.length,sha256:digest(kit),includes_source:true,source:head,external_sync_confirmed:false}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
