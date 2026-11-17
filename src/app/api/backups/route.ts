import {principal} from '../_identity';
import {allowedRequest} from '../_access';
import {globalDatabase} from '@/modules/operations/index.mjs';
import {backupHistory,backupAgents,createPlatformBackup,issueBackupAgent,revokeBackupAgent,authenticateBackupAgent} from '@/modules/operations/platform-backups.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
const headers={'Cache-Control':'private, no-store','Vary':'Cookie, Authorization','X-Robots-Tag':'noindex'};
export async function GET(request:Request){
 const actor=await principal(request);if(!actor?.platform_it)return Response.json({error:'Solo IT de plataforma puede administrar respaldos completos.'},{status:403,headers});
 const db=await globalDatabase();return Response.json({history:await backupHistory(db),agents:await backupAgents(db),scope:'Plataforma completa: empresas, usuarios, claves cifradas de acceso, permisos y fotografías disponibles.',limits:{download_bytes:3500000,secrets_included:false,sessions_included:false,automatic_drive_connection:false}},{headers});
}
export async function POST(request:Request){
 if(!allowedRequest(request)||!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'Solicitud no permitida.'},{status:403,headers});
 const text=await request.text();if(text.length>1500)return Response.json({error:'Solicitud demasiado grande.'},{status:413,headers});
 let input:Record<string,unknown>;try{input=JSON.parse(text);if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid request');}catch{return Response.json({error:'JSON inválido.'},{status:400,headers});}
 const db=await globalDatabase(),token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
 const agent=token?await authenticateBackupAgent(db,token):null,actor=agent?null:await principal(request);
 if(!agent&&!actor?.platform_it)return Response.json({error:'Acceso no permitido.'},{status:403,headers});
 try{
  if(input.action==='issue_agent'&&actor?.platform_it){const issued=await issueBackupAgent(db,actor.email);return Response.json({...issued,origin:process.env.BETTER_AUTH_URL||new URL(request.url).origin},{headers});}
  if(input.action==='revoke_agent'&&actor?.platform_it){await revokeBackupAgent(db,String(input.id),actor.email);return Response.json({revoked:true},{headers});}
  if(input.action!=='create'||input.confirmed!==true)return Response.json({error:'Confirma la creación del respaldo.'},{status:422,headers});
  const key=Buffer.from(typeof input.key==='string'?input.key:'','base64');if(key.length!==32)return Response.json({error:'Carga una clave de respaldo válida de 32 bytes.'},{status:422,headers});
  const subject=agent||actor?.email;if(!subject)return Response.json({error:'Acceso no permitido.'},{status:403,headers});
  const result=await createPlatformBackup(db,key,subject);
  return new Response(Buffer.from(result.bytes),{headers:{...headers,'Content-Type':'application/zip','Content-Disposition':`attachment; filename="neura-recovery-${result.id}.zip"`,'X-Backup-SHA256':result.checksum}});
 }catch{return Response.json({error:'No se pudo generar un respaldo completo. Revisa archivos privados, tamaño y configuración; no se entrega un paquete parcial.'},{status:422,headers});}
}
