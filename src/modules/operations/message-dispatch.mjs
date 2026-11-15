import {randomUUID} from 'node:crypto';
// Only trusted server configuration may inject a provider. No provider is
// selected from user input. Native provider idempotency is mandatory because
// a response can be lost after acceptance; a database lease alone is insufficient.
export async function processDueMessages(db,provider,{limit=10,now=new Date()}={}){
 if(!provider?.enabled||provider.supportsIdempotency!==true)return {blocked:true,reason:'Proveedor autorizado con idempotencia sin configurar.',accepted:0,failed:0};
 if(!Array.isArray(provider.channels)||!provider.channels.length||provider.channels.some(c=>!['email','sms','whatsapp'].includes(c)))throw Error('Invalid provider channels');
 if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('Invalid delivery batch size');
 const runAt=now.toISOString(),result={blocked:false,accepted:0,failed:0};
 for(let n=0;n<limit;n++){
  const claimed=await db.transaction(async tx=>{
   const expired=(await tx.query("UPDATE message_outbox SET state='failed',lease_id=NULL,lease_until=NULL,error_code='final_lease_expired',updated_at=now() WHERE state='processing' AND attempts>=5 AND lease_until<$1::timestamptz RETURNING message_id",[runAt])).rows;
   for(const item of expired)await tx.query("UPDATE customer_messages SET status='failed',revision=revision+1 WHERE id=$1 AND status='ready'",[item.message_id]);
   // Snapshot is frozen when first queued; edits are disallowed after queuing.
   await tx.query("INSERT INTO message_outbox(message_id,state) SELECT id,'pending' FROM customer_messages WHERE status='ready' AND scheduled_at<=$1::timestamptz ON CONFLICT DO NOTHING",[runAt]);
   const row=(await tx.query("SELECT m.*,o.attempts FROM message_outbox o JOIN customer_messages m ON m.id=o.message_id WHERE m.channel=ANY($2::text[]) AND m.status='ready' AND m.scheduled_at<=$1::timestamptz AND o.attempts<5 AND ((o.state='pending' AND o.retry_after<=$1::timestamptz) OR (o.state='processing' AND o.lease_until<$1::timestamptz)) ORDER BY m.scheduled_at,m.id LIMIT 1 FOR UPDATE OF o,m SKIP LOCKED",[runAt,provider.channels])).rows[0];
   if(!row)return null;
   if(!provider.channels?.includes(row.channel))return {unsupported:true};
   const lease=randomUUID();await tx.query("UPDATE message_outbox SET state='processing',attempts=attempts+1,lease_id=$2,lease_until=$3::timestamptz+interval '2 minutes',updated_at=$3 WHERE message_id=$1",[row.id,lease,runAt]);return {...row,lease};
  });
  if(!claimed)break;if(claimed.unsupported){result.blocked=true;result.reason='El proveedor no admite el canal del próximo mensaje.';break;}
  try{
   const sent=await provider.send({idempotencyKey:`landscape-message-${claimed.id}`,channel:claimed.channel,to:claimed.recipient,subject:claimed.subject,body:claimed.body});
   if(typeof sent?.providerId!=='string'||!sent.providerId||sent.providerId.length>300)throw Error('Invalid provider acknowledgement');
   await db.transaction(async tx=>{
    const saved=await tx.query("UPDATE message_outbox SET state='accepted',provider_id=$3,lease_id=NULL,lease_until=NULL,error_code=NULL,updated_at=now() WHERE message_id=$1 AND lease_id=$2 RETURNING message_id",[claimed.id,claimed.lease,sent.providerId]);
    if(saved.rows.length){await tx.query("UPDATE customer_messages SET status='accepted',revision=revision+1 WHERE id=$1 AND status='ready'",[claimed.id]);result.accepted++;}
   });
  }catch{
   const terminal=claimed.attempts+1>=5;
   await db.transaction(async tx=>{
    const saved=await tx.query("UPDATE message_outbox SET state=$3,error_code='provider_acknowledgement_unconfirmed',lease_id=NULL,lease_until=NULL,retry_after=$4::timestamptz+interval '5 minutes',updated_at=now() WHERE message_id=$1 AND lease_id=$2 RETURNING message_id",[claimed.id,claimed.lease,terminal?'failed':'pending',runAt]);
    if(saved.rows.length&&terminal)await tx.query("UPDATE customer_messages SET status='failed',revision=revision+1 WHERE id=$1 AND status='ready'",[claimed.id]);
   });result.failed++;
  }
 }
 return result;
}
