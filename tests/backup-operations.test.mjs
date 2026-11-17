import assert from 'node:assert/strict';
import {test} from 'node:test';
import {backupHealth} from '../src/modules/backups/health.mjs';
import {screenArchive} from '../src/modules/operations/archive-screening.mjs';
test('backup health requires a recent successful checksum and never equates mounted Drive with cloud or scheduling proof',()=>{
 const status={completed:true,finished_at:'2026-11-17T04:00:00Z',source:'head',drive_file:'G:/kit.zip'};
 const options={now:'2026-11-17T05:00:00Z',checksumMatches:true,source:'head'};
 const report=backupHealth(status,options);assert.equal(report.healthy,true);assert.equal(report.cloud_upload_verified,false);assert.equal(report.scheduler_execution_verified,false);
 assert.ok(backupHealth(status,{...options,now:'2026-11-19T05:00:00Z'}).reasons.includes('backup_stale'));
 assert.ok(backupHealth(status,{...options,checksumMatches:false}).reasons.includes('local_checksum_unverified'));
 assert.ok(backupHealth(status,{...options,source:'new-head'}).reasons.includes('source_changed_since_backup'));
 assert.equal(backupHealth(undefined,options).healthy,false);
});
test('annual screening keeps seven calendar years, separates open/draft/invalid documents and never authorizes removal',()=>{
 const snapshot={source:'head',created_at:'2026-11-17',schemas:['public','tenant_b'],tables:[{schema:'public',name:'invoices',rows:[{id:'paid',issue_date:'2019-12-31',status:'issued',total_cents:100},{id:'open',issue_date:'2019-01-01',status:'issued',total_cents:100},{id:'active',issue_date:'2020-01-01',status:'issued',total_cents:100},{id:'draft',issue_date:'2019-01-01',status:'draft',total_cents:0},{id:'invalid',issue_date:'2019-01-01',status:'issued',total_cents:100}]},{schema:'public',name:'payments',rows:[{invoice_id:'paid',amount_cents:100},{invoice_id:'open',amount_cents:100,voided_at:'2026-01-01'},{invoice_id:'invalid',amount_cents:'invalid'}]}]};
 const before=JSON.stringify(snapshot),report=screenArchive(snapshot,2026);assert.equal(report.policy.archive_before,'2020-01-01');assert.deepEqual(report.companies[0],{schema:'public',active:1,old_paid_review:1,old_balance_or_draft:2,invalid_data:1,deleted_preserved:0});assert.equal(report.archive_authorized,false);assert.equal(report.deletion_enabled,false);assert.equal(JSON.stringify(snapshot),before);assert.equal(screenArchive(snapshot,2027).policy.archive_before,'2021-01-01');
});
