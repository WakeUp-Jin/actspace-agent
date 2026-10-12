import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
const require = createRequire(import.meta.url);
const { ContextPanelService } = require('../dist-electron/main/runtime-v2/context-panel-service.js');
const { UsageReadModelService } = require('../dist-electron/main/runtime-v2/usage-read-model.js');
const workerPath = new URL('../dist-electron/main/runtime-v2/usage-read-model-worker.js', import.meta.url);
const time = '2026-10-11T00:00:00Z';
const descriptor = (seq, stamp = 'one') => ({ header: { sessionId: 's', createdAt: time }, throughSeq: seq, stamp, codecSetDigest: 'codec' });
const manifest = (n=12) => ({ schemaVersion:1,estimatorVersion:'context-content-1',comparable:true,totalEstimatedTokens:n,buckets:{systemPrompt:n},entries:[{key:'["section","system","base"]',bucket:'systemPrompt',title:'System',estimatedTokens:n,preview:'NEVER_INDEX_THIS'}] });
const snapshot = (n=12) => ({ contextManifest:manifest(n),contextModel:{modelKey:'p/m',label:'m',contextWindow:1000,autoCompactAtTokens:800},logicalAgentScopeId:'main:s',renderedSystemPrompt:'NEVER_INDEX_THIS',messages:[{content:'NEVER_INDEX_THIS'}] });
function events(rows, start=0) { return rows.map(([type,data],i)=>({ seq:start+i,type,time,eventVersion:1,data,surface:null })); }
async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'context-read-model-'));
  let worker, serial=0;
  const pending=new Map();
  function start() { worker=new Worker(workerPath,{workerData:{dataRoot:root}}); worker.on('message',r=>{const p=pending.get(r.id);if(!p||r.heartbeat)return;pending.delete(r.id);clearTimeout(p.timer);r.ok?p.resolve(r.result):p.reject(new Error(r.error));}); }
  start();
  t.after(async()=>{await worker.terminate();await rm(root,{recursive:true,force:true});});
  const send=message=>new Promise((resolve,reject)=>{const id=String(++serial);const timer=setTimeout(()=>reject(new Error('timeout')),10000);pending.set(id,{resolve,reject,timer});worker.postMessage({...message,id});});
  return {root,send,restart:async()=>{await worker.terminate();start();}};
}
test('Context canonical usage crosses batches, survives restart, ignores global reset and excludes body text',async t=>{
  const f=await fixture(t);
  const first=events([['turn/start',{turnId:'t',agentRunId:'run'}],['step/start',{turnId:'t',stepId:'step',stepIndex:1}],['request/header',{requestId:'r',turnId:'t',stepId:'step',model:'m'}],['request/context',{requestId:'r',turnId:'t',stepId:'step',snapshot:snapshot()}]]);
  const source=descriptor(5);
  await f.send({type:'context-journal',source,events:first,cursor:'a',first:true,final:false,reset:true});
  assert.equal(await f.send({type:'context-query',sessionId:'s'}),null,'unpublished build must remain private');
  await f.restart();
  const state=await f.send({type:'context-source-state',source});assert.equal(state.cursor,'a');assert.equal(state.building,true);
  await f.send({type:'context-journal',source,events:events([['assistant/message',{requestId:'r',finishReason:'stop',usage:{inputTokens:7,outputTokens:3,cacheReadTokens:2},content:'NEVER_INDEX_THIS'}],['turn/end',{turnId:'t'}]],4),cursor:'b',first:false,final:true,reset:true});
  const result=await f.send({type:'context-query',sessionId:'s'});
  assert.equal(result.stats.turnCount,1);assert.equal(result.stats.stepCount,1);
  assert.deepEqual(result.stats.cumulativeUsage,{inputTokens:7,outputTokens:3,cacheReadTokens:2,cacheWriteTokens:0});
  assert.equal(result.previous.requestId,'r');assert.equal(result.previous.stepIndex,1);assert.equal(result.previous.entries[0].estimatedTokens,12);
  assert.equal(result.trend[0].actual.inputTokens,7);
  // Global Usage may be empty/reset; Context owns independent canonical totals.
  await f.send({type:'sync',sources:[],replaceSessionIds:[]});
  assert.deepEqual((await f.send({type:'context-query',sessionId:'s'})).stats,result.stats);
  const db=new DatabaseSync(join(f.root,'runtime-v2/usage-read-model.sqlite'),{readOnly:true});
  try { for(const table of ['context_request','context_manifest_entry','context_usage_projection_events','context_usage_row']) assert(!JSON.stringify(db.prepare(`SELECT * FROM ${table}`).all()).includes('NEVER_INDEX_THIS'),table); } finally { db.close(); }
});
test('Context rebuild retains published data; legacy inputs explicitly disable comparisons',async t=>{
  const f=await fixture(t);const source=descriptor(0);
  await f.send({type:'context-journal',source,events:events([['request/context',{requestId:'r',snapshot:snapshot()}]]),cursor:'old',first:true,final:true,reset:true});
  const next=descriptor(1,'replacement');
  await f.send({type:'context-journal',source:next,events:events([['request/context',{requestId:'legacy',snapshot:{renderedSystemPrompt:'12345678',messages:[]}}]]),cursor:'partial',first:true,final:false,reset:true});
  assert.equal((await f.send({type:'context-query',sessionId:'s'})).previous.requestId,'r');
  await f.restart();
  await f.send({type:'context-journal',source:next,events:events([['compaction/end',{compactionId:'c'}]],1),cursor:'done',first:false,final:true,reset:true});
  const result=await f.send({type:'context-query',sessionId:'s'});
  assert.equal(result.previous.requestId,'legacy');assert.equal(result.previous.comparable,false);assert.equal(result.previous.totalEstimatedTokens,2);
  assert.equal(result.stats.compactionCount,1);assert.equal(result.events[0].tokenDelta,null);
});
test('history windows are bounded while counts cover all history and recent manifest retention stays bounded',async t=>{
  const f=await fixture(t);const all=events(Array.from({length:510},(_,i)=>[['request/context',{requestId:`r${i}`,snapshot:snapshot(i)}],['agent/mode-set',{mode:i%2?'chat':'agent'}]]).flat());
  const source=descriptor(all.length-1);
  for(let i=0;i<all.length;i+=128)await f.send({type:'context-journal',source,events:all.slice(i,i+128),cursor:String(i+128),first:i===0,final:i+128>=all.length,reset:true});
  const result=await f.send({type:'context-query',sessionId:'s'});
  assert.equal(result.trend.length,500);assert.equal(result.events.length,200);assert.equal(result.limits.trend.total,510);assert.equal(result.limits.events.total,510);assert.equal(result.limits.trend.truncated,true);
  const db=new DatabaseSync(join(f.root,'runtime-v2/usage-read-model.sqlite'),{readOnly:true});
  try { assert.equal(db.prepare('SELECT count(DISTINCT request_id) AS n FROM context_manifest_entry').get().n,2); } finally { db.close(); }
});
test('panel conditional reads, generation guards, pagination and UTF8 text pages stay independent of history',async()=>{
  let generation='g1';const entries=Array.from({length:602},(_,i)=>({key:`k${i}`,bucket:'tools',title:`Tool ${i}`,estimatedTokens:10,fullTextAvailable:true,preview:'p'.repeat(600)}));
  const projection=()=>({identity:{sessionId:'s',logicalAgentScopeId:'main:s'},instanceGeneration:generation,contextRevision:1,throughJournalSeq:4,model:{modelKey:'p/m',label:'m',contextWindow:1000,autoCompactAtTokens:null},manifest:{...manifest(),entries,totalEstimatedTokens:6020,buckets:{tools:6020}}});
  const service=new ContextPanelService({readContextProjection:async()=>projection(),sessionQuerySource:async()=>descriptor(4),readContextEntryText:async()=> '汉'.repeat(30000)}, {contextHistory:()=>({result:null,syncing:true}),releaseContext:()=>{}});
  const view=await service.describe({sessionId:'s'});assert.equal(view.current.totalEstimatedTokens,6020);assert.equal(view.stats,null);assert.equal(view.entriesPage.total,602);assert(Buffer.byteLength(JSON.stringify(view))<=200*1024);
  assert.equal((await service.describe({sessionId:'s',versionToken:view.versionToken})).notModified,true);
  const keys=view.current.entries.map(e=>e.key);let cursor=view.entriesPage.nextCursor;
  while(cursor){const page=await service.listEntries({sessionId:'s',revision:view.entriesPage.revision,cursor,limit:500});keys.push(...page.entries.map(e=>e.key));cursor=page.nextCursor;}
  assert.equal(new Set(keys).size,602);assert.equal(keys.length,602);
  const text=await service.readEntry({sessionId:'s',revision:view.entriesPage.revision,key:'k1'});assert(Buffer.byteLength(text.text)<=65536);assert(!text.text.includes('\ufffd'));assert(text.nextOffset);
  const rest=await service.readEntry({sessionId:'s',revision:view.entriesPage.revision,key:'k1',offset:text.nextOffset});assert.equal(text.text+rest.text,'汉'.repeat(30000));
  generation='g2';await assert.rejects(service.listEntries({sessionId:'s',revision:view.entriesPage.revision}),/stale/);
  const changed=await service.describe({sessionId:'s',versionToken:view.versionToken});assert(!changed.notModified);
});
test('Context service reads only its Session and unchanged probes read no events',async t=>{
  const root=await mkdtemp(join(tmpdir(),'context-service-'));let reads=0;let service;
  const all=events([['turn/start',{turnId:'t',agentRunId:'run'}],['request/context',{requestId:'r',snapshot:snapshot()}]]);
  service=new UsageReadModelService({listSessionSummaries:async()=>{throw new Error('inventory forbidden');},readSessionEventBatch:async(id,{cursor})=>{assert.equal(id,'s');reads++;const offset=cursor?Number(cursor):0;return {events:all.slice(offset,offset+1),cursor:String(offset+1),done:offset===1};}},root);
  t.after(async()=>{await service.dispose();await rm(root,{recursive:true,force:true});});
  const source=descriptor(1);let response=service.contextHistory(source,'consumer');assert.equal(response.syncing,true);
  for(let i=0;i<500 && response.syncing;i++){await new Promise(resolve=>setTimeout(resolve,10));response=service.contextHistory(source,'consumer');}
  assert.equal(response.error,undefined);assert.equal(response.result.previous.requestId,'r');assert.equal(reads,2);
  for(let i=0;i<5;i++)service.contextHistory(source,'consumer');assert.equal(reads,2);service.releaseContext('s','consumer');
});

test('Context demand stops between batches and later resumes its durable cursor',async t=>{
  const root=await mkdtemp(join(tmpdir(),'context-pause-'));const cursors=[];let releaseRead,entered;
  const waiting=new Promise(resolve=>{entered=resolve;});const held=new Promise(resolve=>{releaseRead=resolve;});
  const all=events([['turn/start',{turnId:'t',agentRunId:'run'}],['request/context',{requestId:'r',snapshot:snapshot()}],['turn/end',{turnId:'t'}]]);
  const service=new UsageReadModelService({readSessionEventBatch:async(_id,{cursor})=>{const offset=Number(cursor??0);cursors.push(offset);if(offset===1&&cursors.length===2){entered();await held;}return {events:all.slice(offset,offset+1),cursor:String(offset+1),done:offset===2};}},root);
  t.after(async()=>{releaseRead();await service.dispose();await rm(root,{recursive:true,force:true});});
  const source=descriptor(2);service.contextHistory(source,'first');await waiting;
  service.releaseContext('s','first');releaseRead();
  await new Promise(resolve=>setTimeout(resolve,30));assert.deepEqual(cursors,[0,1]);
  let response=service.contextHistory(source,'second');
  for(let i=0;i<500&&response.syncing;i++){await new Promise(resolve=>setTimeout(resolve,10));response=service.contextHistory(source,'second');}
  assert.equal(response.error,undefined);assert.equal(response.result.previous.requestId,'r');
  assert.deepEqual(cursors,[0,1,1,2],'only the uncommitted batch is reread');
});

test('bounded fallback preserves semantics after an index input failure and retry returns to index',async t=>{
  const root=await mkdtemp(join(tmpdir(),'context-fallback-'));let failures=1;
  const all=events([['request/context',{requestId:'r',snapshot:snapshot()}]]);
  const service=new UsageReadModelService({readSessionEventBatch:async()=>{if(failures-->0)throw new Error('injected transient source failure');return {events:all,cursor:'1',done:true};}},root);
  t.after(async()=>{await service.dispose();await rm(root,{recursive:true,force:true});});
  const source=descriptor(0);let response=service.contextHistory(source,'consumer');
  for(let i=0;i<500&&response.syncing;i++){await new Promise(resolve=>setTimeout(resolve,10));response=service.contextHistory(source,'consumer');}
  assert.equal(response.fallback,true);assert.equal(response.result.previous.requestId,'r');
  response=service.contextHistory(source,'consumer',true);
  for(let i=0;i<500&&response.syncing;i++){await new Promise(resolve=>setTimeout(resolve,10));response=service.contextHistory(source,'consumer');}
  assert.equal(response.error,undefined);assert.equal(response.fallback,false);assert.equal(response.result.previous.requestId,'r');
});

test('Worker scheduler lets current Context progress while background work is queued',async()=>{
  const {ReadModelScheduler}=require('../dist-electron/main/runtime-v2/read-model-scheduler.js');
  const scheduler=new ReadModelScheduler();const order=[];let release;
  const first=scheduler.run(false,()=>new Promise(resolve=>{release=resolve;}));
  const jobs=[...Array.from({length:9},(_,i)=>scheduler.run(true,async()=>{order.push(`f${i}`);})),scheduler.run(false,async()=>{order.push('background');})];
  release();await Promise.all([first,...jobs]);assert.equal(order.indexOf('background'),4);assert.equal(order.length,10);
});

test('historical manifest preserves safe trajectory identities and never exposes stored body text',async t=>{
  const f=await fixture(t);const value=snapshot();
  value.contextManifest.entries=[{key:'message:a',bucket:'conversation',title:'Assistant',kind:'assistant',estimatedTokens:12,trajectoryRef:{messageId:'a'},preview:'NEVER_INDEX_THIS',fullTextAvailable:true}];
  await f.send({type:'context-journal',source:descriptor(0),events:events([['request/context',{requestId:'r',snapshot:value}]]),cursor:'1',first:true,final:true,reset:true});
  const result=await f.send({type:'context-query',sessionId:'s'});
  assert.deepEqual(result.previous.entries[0].trajectoryRef,{messageId:'a'});assert.equal(result.previous.entries[0].kind,'assistant');assert(!JSON.stringify(result).includes('NEVER_INDEX_THIS'));
  const service=new ContextPanelService({readContextProjection:async()=>null,sessionQuerySource:async()=>descriptor(0)}, {contextHistory:()=>({result,syncing:false}),releaseContext:()=>{}});
  const view=await service.describe({sessionId:'s'});assert.equal(view.current.basis,'last-request');assert.equal(view.current.entries[0].title,'Assistant');assert.deepEqual(view.current.entries[0].trajectoryRef,{messageId:'a'});
  assert.equal((await service.describeComposer('s')).basis,'last-request');
});


test('unavailable live Harness does not block historical Context or Composer reads',async t=>{
  const f=await fixture(t);const value=snapshot();
  await f.send({type:'context-journal',source:descriptor(0),events:events([['request/context',{requestId:'r',snapshot:value}]]),cursor:'1',first:true,final:true,reset:true});
  const result=await f.send({type:'context-query',sessionId:'s'});
  const service=new ContextPanelService({readContextProjection:async()=>{throw new Error('Harness recovery blocked');},sessionQuerySource:async()=>descriptor(0)}, {contextHistory:()=>({result,syncing:false}),releaseContext:()=>{}});
  const view=await service.describe({sessionId:'s'});
  assert.equal(view.current.basis,'last-request');assert.equal(view.current.status,'stale');assert.equal(view.history.status,'ready');
  assert.equal((await service.describeComposer('s')).basis,'last-request');
  const page=await service.listEntries({sessionId:'s',revision:view.entriesPage.revision});assert.equal(page.total,view.entriesPage.total);
});
