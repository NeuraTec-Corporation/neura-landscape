import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {backupHealth} from '../src/modules/backups/health.mjs';
import {digest} from '../src/modules/backups/index.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),state=resolve(repo,'.data/backup-agent');
let status,checksumMatches=false;
try{status=JSON.parse((await readFile(resolve(state,'daily-status.json'),'utf8')).replace(/^\uFEFF/,''));checksumMatches=digest(await readFile(status.local_file))===status.sha256;}catch{/* Missing/invalid evidence remains unhealthy. */}
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',cwd:repo}).trim();
const report={checked_at:new Date().toISOString(),...backupHealth(status,{checksumMatches,source})};
await mkdir(state,{recursive:true});
await writeFile(resolve(state,'health.json'),JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify(report,null,2));if(!report.healthy)process.exitCode=1;
