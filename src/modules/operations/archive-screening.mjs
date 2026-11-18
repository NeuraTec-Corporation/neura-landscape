import {retentionWindow} from './evaluation-policy.mjs';
// Read-only age/balance screening, not permission to archive or remove relationships.
export function screenArchive(snapshot,year){
 const policy=retentionWindow(year),companies=[];
 for(const schema of snapshot.schemas){
  const invoices=snapshot.tables.find(t=>t.schema===schema&&t.name==='invoices')?.rows||[];
  const payments=snapshot.tables.find(t=>t.schema===schema&&t.name==='payments')?.rows||[];
  const paid=new Map();for(const p of payments){if(p.voided_at)continue;const n=Number(p.amount_cents);paid.set(p.invoice_id,(paid.get(p.invoice_id)??0)+(Number.isSafeInteger(n)&&n>=0?n:NaN));}
  const counts={schema,active:0,old_paid_review:0,old_balance_or_draft:0,invalid_data:0,deleted_preserved:0};
  for(const invoice of invoices){
   if(invoice.deleted_at){counts.deleted_preserved++;continue;}
   const day=String(invoice.issue_date||'').slice(0,10),total=Number(invoice.total_cents),balance=paid.get(invoice.id)??0;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||Number.isNaN(Date.parse(day))||!Number.isSafeInteger(total)||total<0||!Number.isSafeInteger(balance)||balance>total){counts.invalid_data++;continue;}
   if(day>=policy.archive_before){counts.active++;continue;}
   if(['issued','void'].includes(invoice.status)&&balance===total)counts.old_paid_review++;
   else counts.old_balance_or_draft++;
  }
  if(invoices.length)companies.push(counts);
 }
 return {format:'neuratec-retention-screening-v1',policy,source:snapshot.source,snapshot_at:snapshot.created_at,companies,read_only:true,deletion_enabled:false,archive_authorized:false,scope:'Invoice age and balance counts only. Paid historical documents still require claims/holds and relationship review, independent copy and restore verification. No financial or operational relationships are removed.'};
}
