import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { Worker } from 'node:worker_threads';
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const rowsCount = Number(option('rows') ?? 100_000);
const sessionsCount = Number(option('sessions') ?? 100);
assert(Number.isSafeInteger(rowsCount) && rowsCount > 0);
assert(Number.isSafeInteger(sessionsCount) && sessionsCount > 0 && sessionsCount <= rowsCount);
const workerPath = fileURLToPath(new URL('../dist-electron/main/runtime-v2/usage-read-model-worker.js', import.meta.url));
const root = await mkdtemp(join(tmpdir(), 'actspace-usage-read-model-'));
const worker = new Worker(workerPath, { workerData: { dataRoot: root } });
let sequence = 0; const pending = new Map();
worker.on('message', reply => {
  const item = pending.get(reply.id); if (!item) return;
  if (reply.heartbeat) { item.timer.refresh(); return; }
  pending.delete(reply.id); clearTimeout(item.timer);
  reply.ok ? item.resolve(reply.result) : item.reject(new Error(reply.error));
});
worker.on('error', error => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); } pending.clear(); });
const send = message => new Promise((resolve, reject) => {
  const id = String(++sequence);
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout ${message.type}`)); }, 600_000);
  pending.set(id, { resolve, reject, timer }); worker.postMessage({ ...message, id });
});
function makeRow(index, sessionId) {
  return { activityId: `activity-${index}`, kind: index % 5 === 0 ? 'tool_invocation' : 'llm_request', sessionId, agentRunId: `run-${index % 1000}`, startedAt: new Date(1_700_000_000_000 + index * 1000).toISOString(), status: index % 17 === 0 ? 'error' : 'success', model: `model-${index % 8}`, providerId: `provider-${index % 3}`, toolName: index % 5 === 0 ? `tool-${index % 4}` : undefined, tokens: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheWriteTokens: 2, reasoningTokens: 3, totalTokens: 150 }, costUsd: 0.001, costAmount: 0.001, costCurrency: 'USD', sourceEventSeq: index, relatedEventSeqs: [] };
}
const activeSessionIds = Array.from({ length: sessionsCount }, (_, i) => `benchmark-${i}`);
const before = process.memoryUsage();
let peakHeap = before.heapUsed, peakRss = before.rss, peakWorkerHeap = 0;
const sample = () => { const m = process.memoryUsage(); peakHeap = Math.max(peakHeap, m.heapUsed); peakRss = Math.max(peakRss, m.rss); };
const sampler = setInterval(sample, 20);
const eventLoop = monitorEventLoopDelay({ resolution: 10 });
function distribution(values) {
  const sorted = [...values].sort((a,b) => a-b);
  return Object.fromEntries([50,95,99].map(p => [`p${p}`, sorted[Math.min(sorted.length-1, Math.ceil(sorted.length*p/100)-1)]]));
}
async function insertRange(start, count) {
  const startTime = performance.now();
  for (let offset = start; offset < start + count; offset += 1000) {
    const size = Math.min(1000, start + count-offset), grouped = new Map();
    for (let i = offset; i < offset+size; i++) {
      const sessionId = activeSessionIds[i % sessionsCount];
      let source = grouped.get(sessionId);
      if (!source) { source = { sessionId, title: sessionId, throughJournalSeq: i, rows: [] }; grouped.set(sessionId, source); }
      source.throughJournalSeq = i; source.rows.push(makeRow(i,sessionId));
    }
    // This benchmark appends generated rows; production must additionally prove
    // Journal reconciliation and replacement correctness in service tests.
    await send({ type:'sync', sources:[...grouped.values()], replaceSessionIds:[], final:true });
    if ((offset-start) % 100_000 === 0) {
      const memory = (await send({ type:'diagnostics' })).memory;
      peakWorkerHeap = Math.max(peakWorkerHeap,memory.heapUsed);
      process.stderr.write(`Imported ${offset+size-start}/${count}\n`);
    }
    sample();
  }
  return performance.now()-startTime;
}
try {
  eventLoop.enable();
  const cpuStart = process.cpuUsage();
  const syncMs = await insertRange(0,rowsCount);
  const cpu = process.cpuUsage(cpuStart);
  const input = { scope:'global', range:'total', requestRowsPage:{limit:100} };
  const full = await send({ type:'query',request:'activity',input });
  assert.equal(full.rowsPage.totalRows,rowsCount,'generated dataset must have the requested row count');
  assert.equal(full.sourceCount,sessionsCount);
  const timings = {}, sizes = {}; const heapTrend = [];
  const iterations = Number(option('iterations') ?? 5);
  for (const [label, request, requestInput] of [
    ['activity','activity',input],
    ['fts','activity',{...input, search:'model-3'}],
    ['modelProvider','activity',{...input,model:'model-3',providerId:'provider-1'}],
    ['noMatch','activity',{...input,search:'no-match-unfindable-fixture'}],
    ['status','activity',{...input,status:'error'}],
    ['cursor','activity',{...input,requestRowsPage:{limit:100,cursor:full.rowsPage.nextCursor}}],
    ['statistics','statistics',input],
  ]) {
    const samples = [];
    for (let i=0; i<iterations; i++) {
      const startTime = performance.now();
      const result = await send({type:'query',request,input:requestInput});
      samples.push(performance.now()-startTime);
      const rows = result.rows ?? result.requestRows;
      assert(rows.length<=100); assert(Buffer.byteLength(JSON.stringify(result)) <= 1024*1024); sizes[label]={ rows:rows.length, bytes:Buffer.byteLength(JSON.stringify(result)) };
    }
    timings[label]=distribution(samples); heapTrend.push({query:label,mainHeap:process.memoryUsage().heapUsed,workerHeap:(await send({type:'diagnostics'})).memory.heapUsed});
  }
  const append1000Ms = await insertRange(rowsCount,1000);
  const append100000Ms = await insertRange(rowsCount+1000,100000);
  const final = await send({type:'query',request:'activity',input});
  assert.equal(final.rowsPage.totalRows,rowsCount+101000);
  const memory = (await send({type:'diagnostics'})).memory;
  const report = {
    schema:2, scope:'Worker synthetic rows; excludes Main Session reader and Renderer', rows:rowsCount,sessions:sessionsCount,
    heapTrend,syncMs,cpuMs:{user:cpu.user/1000,system:cpu.system/1000},timings,iterations,append1000Ms,append100000Ms,sizes,
    eventLoopMs:{p50:eventLoop.percentile(50)/1e6,p95:eventLoop.percentile(95)/1e6,p99:eventLoop.percentile(99)/1e6,max:eventLoop.max/1e6},
    memoryMiB:{workerHeapLimit:memory.heapSizeLimit/2**20,mainHeapDelta:(process.memoryUsage().heapUsed-before.heapUsed)/2**20,mainHeapSampledPeak:peakHeap/2**20,processRssSampledPeak:peakRss/2**20,workerHeapSampledPeak:Math.max(peakWorkerHeap,memory.heapUsed)/2**20},
  };
  console.log(JSON.stringify(report,null,2));
  const out = option('out'); if(out) {await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');}
} finally {
  clearInterval(sampler); eventLoop.disable();
  await worker.terminate(); await rm(root,{recursive:true,force:true});
}
