import {createHash} from 'node:crypto';
import {securityService,enrollMembership,SecurityError} from '../security/index.mjs';
import {assignUserCode,evaluationAccountsAllowed} from './user-codes.mjs';
import {writeCredential} from './credentials.mjs';
import {audit} from '../operations/manage.mjs';
// Explicit Preview-only provisioning. It never modifies an existing password,
// disabled membership or portal mapping and cannot provision a real customer.
export async function provisionCustomerEvaluationAccess(db,ctx,customerId,password,registry,env=process.env){
 if(!evaluationAccountsAllowed(env)||!env.LANDSCAPE_EVALUATION_PASSWORD)throw new SecurityError('La creación de accesos de evaluación solo está habilitada en Preview.',403);
 const service=securityService(db,registry),snapshot=await service.snapshot(ctx);
 const customer=(await db.query("SELECT c.id,c.name FROM customers c JOIN sample_data_records r ON r.entity='customer' AND r.entity_id=c.id WHERE c.id=$1",[customerId])).rows[0];
 if(!customer)throw new SecurityError('Selecciona un expediente sintético existente de esta empresa.',422);
 const email=`customer-${createHash('sha256').update(`${ctx.companyId}:${customerId}`).digest('hex').slice(0,32)}@access.neuratec.invalid`;
 const existing=(await db.query("SELECT m.email,m.status identity_status,s.status membership_status,c.code,a.customer_id,a.active FROM app_members m LEFT JOIN security_memberships s ON s.subject_id=m.email AND s.company_id=$2 LEFT JOIN security_login_codes c ON c.subject_id=m.email AND c.company_id=$2 LEFT JOIN customer_portal_access a ON a.subject_id=m.email WHERE m.email=$1",[email,ctx.companyId])).rows[0];
 if(existing){if(existing.customer_id!==customerId)throw new SecurityError('La identidad ya existe con otra configuración. Revísala en Usuarios.',409);return {code:existing.code,created:false,active:Boolean(existing.active&&existing.identity_status==='active'&&existing.membership_status==='active')};}
 const profile=snapshot.profiles.find(p=>p.id==='default-customer');
 if(profile?.status!=='active'||profile.protected||profile.scope!=='company'||profile.grants.length!==1||profile.grants[0]!=='portal.read')throw new SecurityError('El perfil de cliente debe contener únicamente portal.read.',409);
 const encoded=await password.hash(env.LANDSCAPE_EVALUATION_PASSWORD);let code;
 await service.assign(ctx,{subjectId:email,profileIds:['default-customer'],status:'active',version:snapshot.company.version},async tx=>{
  // The security company/version lock serializes concurrent first provisioning.
  if((await tx.query('SELECT email FROM app_members WHERE email=$1',[email])).rows.length)throw new SecurityError('La cuenta se creó durante esta solicitud. Recarga.',409);
  await tx.query("INSERT INTO app_members(email,name,role,status) VALUES($1,$2,'manager','active')",[email,customer.name]);
  await enrollMembership(tx,ctx.companyId,email,[]);code=await assignUserCode(tx,ctx.companyId,email,true);
  await writeCredential(tx,{email,name:customer.name},encoded);
  await tx.query('INSERT INTO customer_portal_access(subject_id,customer_id) VALUES($1,$2)',[email,customerId]);
  await audit(tx,'portal_access',email,'evaluation_account_created',{customer_id:customerId,code,scope:'customer_only',evaluation_only:true});
 });
 return {code,created:true,active:true};
}
