import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../src/modules/operations/migrations.mjs';
import {loadSampleOperations} from '../src/modules/operations/sample-operations.mjs';
import {evaluationCheckpoint,enrichEvaluation,evaluationCoverage} from '../src/modules/operations/evaluation-scenario.mjs';
import {retentionWindow} from '../src/modules/operations/evaluation-policy.mjs';
test('differentiated scenario is transactional, reconciled and idempotent; native records and seven-year boundaries survive',async()=>{
	assert.equal(retentionWindow(2026).archive_before,'2020-01-01');
	assert.equal(retentionWindow(2027).archive_before,'2021-01-01');
	assert.equal(retentionWindow(2026).deletion_enabled,false);
	const db=new PGlite();
	try {
		await migrate(db);
		await loadSampleOperations(db,{confirmed:true,environment:'preview',actor:'audit',now:new Date('2026-11-16T16:00Z')});
		await db.query("INSERT INTO customers(id,name) VALUES('manual-preserved','Registro original')");
		const backup=await evaluationCheckpoint(db);
		assert.equal(backup.data.user,undefined);assert.equal(backup.data.security_profiles,undefined);
		await assert.rejects(enrichEvaluation(db,{confirmed:true,environment:'production',profile:'rojas',expectedDigest:backup.digest}),e=>e.status===403);
		await assert.rejects(enrichEvaluation(db,{confirmed:true,environment:'preview',profile:'rojas',expectedDigest:'stale'}),e=>e.status===409);
		const r=await enrichEvaluation(db,{confirmed:true,environment:'preview',profile:'rojas',expectedDigest:backup.digest,now:new Date('2026-11-16T16:00Z')});
		assert.equal(r.replayed,false);
		assert.equal(r.coverage.counts.visits,308);
		assert.equal(r.coverage.cities.length,4);
		assert.ok(r.coverage.cities.every(c=>c.properties===c.positioned));
		assert.deepEqual(Object.values(r.coverage.coherence),[0,0,0,0]);
		assert.ok(r.coverage.finance.drafts>0&&r.coverage.finance.voids>0&&r.coverage.finance.paid>0&&r.coverage.finance.partial>0&&r.coverage.finance.overdue>0);
		assert.ok(r.coverage.counts.equipment_assets>=7&&r.coverage.counts.stock_movements>10&&r.coverage.counts.employee_qualifications>0);
		assert.equal((await db.query("SELECT name FROM customers WHERE id='manual-preserved'")).rows[0].name,'Registro original');
		const repeat=await enrichEvaluation(db,{confirmed:true,environment:'preview',profile:'rojas',expectedDigest:backup.digest});
		assert.equal(repeat.replayed,true);assert.deepEqual(repeat.coverage.counts,r.coverage.counts);
		assert.equal((await evaluationCoverage(db)).batch.synthetic,true);
	}finally{await db.close();}
});
