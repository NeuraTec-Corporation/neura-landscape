import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {billingPeriods,reserveMaps,googleMatrix} from '../src/modules/maps/index.mjs';
import {planRoadItinerary} from '../src/integrations/road-planning.mjs';
test('shared persistent quotas: concurrency, rejection rollback and Pacific periods',async()=>{
 const db=new PGlite();try{
  await db.exec('CREATE TABLE entity_sequences(entity text,year integer,value integer,PRIMARY KEY(entity,year));');
  const now=new Date('2026-11-17T12:00:00Z');
  const concurrent=await Promise.allSettled([reserveMaps(db,'matrix',225,now),reserveMaps(db,'matrix',36,now)]);
  assert.equal(concurrent.filter(v=>v.status==='fulfilled').length,1);
  assert.equal((await db.query('SELECT SUM(value)::integer n FROM entity_sequences')).rows[0].n,450);
  await db.query("UPDATE entity_sequences SET value=7499 WHERE entity LIKE '%month%'");
  await assert.rejects(reserveMaps(db,'matrix',4,now),/límite/);
  assert.equal((await db.query("SELECT value FROM entity_sequences WHERE entity LIKE '%day%'")).rows[0].value,225);
  assert.equal(billingPeriods(new Date('2026-12-01T07:59:00Z')).month,'2026-11');
  assert.equal(billingPeriods(new Date('2026-12-01T08:00:00Z')).day,'2026-12-01');
 }finally{await db.close();}
});
test('Google adapter uses Essentials matrix and rejects partial provider data',async()=>{
 const points=[{latitude:40.8,longitude:-74},{latitude:40.9,longitude:-74.1}];let request;
 const elements=[{condition:'ROUTE_EXISTS',duration:'0s'},{destinationIndex:1,condition:'ROUTE_EXISTS',duration:'600s'},{originIndex:1,condition:'ROUTE_NOT_FOUND'},{originIndex:1,destinationIndex:1,condition:'ROUTE_EXISTS',duration:'0s'}];
 const matrix=await googleMatrix(points,{key:'not-a-real-key',fetcher:async(_url,options)=>{request=options;return Response.json(elements);}});
 assert.deepEqual(matrix,[[0,10],[null,0]]);
 assert.equal(JSON.parse(request.body).routingPreference,'TRAFFIC_UNAWARE');
 assert.equal(JSON.parse(request.body).origins.length,2);
 await assert.rejects(googleMatrix(points,{key:'not-a-real-key',fetcher:async()=>Response.json(elements.slice(1))}),/todos los trayectos/);
});
test('road proposal keeps all excluded visits explicit and reserves return to base',async()=>{
 const plan=await planRoadItinerary({origin:{latitude:40,longitude:-74},startsAt:480,endsAt:600,breakMinutes:15,stops:[{id:'a',latitude:41,longitude:-74,durationMinutes:60,opensAt:480,closesAt:1080},{id:'b',latitude:42,longitude:-74,durationMinutes:60,opensAt:480,closesAt:1080}]},{enabled:true,matrix:async()=>[[0,10,20],[10,0,10],[20,10,0]]});
 assert.equal(plan.stops.length,1);assert.equal(plan.unplaced.length,1);
 assert.equal(plan.totalTravelMinutes,20);assert.equal(plan.endsAt,575);
 assert.equal(plan.globallyOptimal,false);
});
