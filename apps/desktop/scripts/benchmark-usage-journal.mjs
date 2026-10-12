import assert from 'node:assert/strict';
import { mkdtemp, mkdir, open, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { createCoreCodecRegistry, createSessionHeader } from '@actspace/session-journal';
import { JsonlSessionStorage } from '../../../packages/session/jsonl/dist/index.js';
import { JsonlQueryReader } from '../../../packages/session/jsonl/dist/query-reader.js';
import { SessionStore } from '../../../packages/session/persistence/dist/index.js';
import { RuntimeSessionController } from '../../../packages/runtime/dist/session/session-controller.js';
const require = createRequire(import.meta.url);
const { UsageReadModelService } = require('../dist-electron/main/runtime-v2/usage-read-model.js');
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length+3);
const rows = Number(option('rows') ?? 100_000), sessions = Number(option('sessions') ?? 100);
const appendIterations=Number(option('append-iterations')??1);
if(!Number.isSafeInteger(appendIterations)||appendIterations<1||appendIterations>100) throw new Error('append-iterations must be between 1 and 100');
if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(sessions) || rows<1 || sessions<1 || (!option('reuse') && rows%sessions)) throw new Error('rows must be positive and new fixtures must divide evenly across sessions');
const root = option('root') ? resolve(option('root')) : await mkdtemp(join(tmpdir(),'usage-journal-benchmark-'));
await mkdir(root,{recursive:true});
const registry=createCoreCodecRegistry();
const createdWith={profileId:'base',presetId:'actspace.main',initialAgentMode:'agent',runtimeContractVersion:'actspace.runtime.v2',manifestDigest:'benchmark',plugins:[],codecSetDigest:registry.digest};
const perSession=rows/sessions;
const revisions=new Map();
const paths=new Map();
const epoch=Date.parse('2026-10-01T00:00:00.000Z');
function envelope(seq,type,data,surface=null) {
  return {recordKind:'event',seq,type,eventVersion:1,criticality:registry.get(type).criticality,time:new Date(epoch+seq*10).toISOString(),source:{ownerPluginId:'@actspace/core'},provenance:{sourceEventSeqs:[],contributorIds:[],runtimeSelectionSeq:null},data,surface};
}
function requestEvents(index,startSeq) {
  const ids={turnId:`t${index}`,stepId:`step${index}`,requestId:`r${index}`,agentRunId:`run${index}`};
  const usage={inputTokens:100,outputTokens:20,cacheReadTokens:10,cacheWriteTokens:0,totalTokens:120,cost:0.001,costCurrency:'USD',source:'provider-reported'};
  return [['turn/start',ids],['step/start',ids],['request/header',{...ids,model:`model-${index%8}`,routeId:`provider-${index%3}`}],['request/context',{...ids,snapshot:{renderedSystemPrompt:'Synthetic benchmark',tools:[],requestOptions:{}}}],['assistant/message',{...ids,messageId:`a${index}`,content:[],finishReason:'stop',usage}],['step/end',{...ids,reason:'completed',usage}],['turn/end',{...ids,reason:'completed'}]].map(([type,data],offset)=>envelope(startSeq+offset,type,data));
}
const generated=performance.now();
if (!option('reuse')) {
  for(let session=0;session<sessions;session++) {
    const id=`benchmark-${session}`,path=join(root,'sessions-v2',id,'journal.jsonl');
    await mkdir(dirname(path),{recursive:true});
    const file=await open(path,'wx',0o600);
    let seq=0;
    const header=createSessionHeader({sessionId:id,createdAt:new Date(epoch).toISOString(),cwd:root,lineage:null,createdWith});
    let text=JSON.stringify(header)+'\n'+JSON.stringify(envelope(seq++,'session/title-set',{title:`Benchmark history ${session}`}))+'\n';
    for(let i=0;i<perSession;i++) {
      const events=requestEvents(i,seq);seq+=events.length;
      // Validate the generator against real codecs; the query path validates again.
      for(const event of events) {registry.resolve(event);text+=JSON.stringify(event)+'\n';}
      if(text.length>=256*1024) {await file.write(text);text='';}
    }
    if(text) await file.write(text);await file.sync();await file.close();
    revisions.set(id,seq-1);paths.set(id,path);
    if(session%100===0) process.stderr.write(`Generated ${session+1}/${sessions} Sessions\n`);
  }
  await writeFile(join(root,'global-usage-reset.json'),JSON.stringify({version:1,resetAt:'2000-01-01T00:00:00Z'}));
} else {
  const descriptors=new JsonlQueryReader();
  try {
    for(let i=0;i<sessions;i++) {
      const id=`benchmark-${i}`,path=join(root,'sessions-v2',id,'journal.jsonl');
      revisions.set(id,(await descriptors.source(path,id)).throughSeq);paths.set(id,path);
    }
  } finally {await descriptors.close();}
}
const generationMs=performance.now()-generated;
const storage=new JsonlSessionStorage({dataRoot:root,runtimeId:'benchmark',registry});
const controller=new RuntimeSessionController({dataRoot:root,runtimeId:'benchmark',registry,profileId:'base',manifestDigest:'benchmark',plugins:[]},new SessionStore({registry},storage));
let readEvents=0;const readSessions=new Set();
const service=new UsageReadModelService({
  sessionQuerySources:()=>controller.querySources(),
  globalSessionSummaries:async()=>{throw new Error('Full Runtime catalog replay is forbidden in query benchmark');},
  readSessionEventBatch:async(id,input)=>{const batch=await controller.readEventBatch(id,input);readEvents+=batch.events.length;readSessions.add(id);return batch;},
},root);
const loop=monitorEventLoopDelay({resolution:10});
let heap=0,rss=0;const memory=[];
const sample=()=>{const m=process.memoryUsage();heap=Math.max(heap,m.heapUsed);rss=Math.max(rss,m.rss);};
const timer=setInterval(sample,20);loop.enable();
const distribution=values=>{const sorted=[...values].sort((a,b)=>a-b);return Object.fromEntries([50,95,99].map(p=>[`p${p}`,sorted[Math.ceil(sorted.length*p/100)-1]]));};
const input={range:'total',requestRowsPage:{limit:100}};
try {
  const started=performance.now();const cold=await service.getActivity({...input,requestId:'cold'});const coldMs=performance.now()-started;
  assert.equal(cold.rowsPage.totalRows,rows);assert.equal(cold.sourceCount,sessions);
  const coldEvents=readEvents;readEvents=0;readSessions.clear();
  const timings={};
  for(const [name,query] of [['page',input],['fts',{...input,search:'model-3'}],['title',{...input,search:'history 0'}],['cursor',{...input,requestRowsPage:{limit:100,cursor:cold.rowsPage.nextCursor}}]]) {
    const samples=[];
    for(let i=0;i<20;i++) {const start=performance.now();const result=await service.getActivity(query);samples.push(performance.now()-start);assert(result.rows.length<=100);assert(Buffer.byteLength(JSON.stringify(result))<=1024*1024);sample();if(i%5===0) memory.push(process.memoryUsage().heapUsed);}
    timings[name]={firstMs:samples[0],...distribution(samples)};
  }
  assert.equal(readEvents,0,'unchanged complete-chain queries may stat descriptors but must not replay events');
  const appends={}; let appended=0;
  for(const count of (option("appends") ?? "1000,100000").split(",").map(Number).filter(count=>count>0)) {
    const samples=[];
    for(let iteration=0;iteration<appendIterations;iteration++) {
    const id='benchmark-0',file=await open(paths.get(id),'a');let text='';let seq=revisions.get(id)+1;
    const firstIndex=Math.max(perSession,Math.ceil(seq/7));
    for(let i=0;i<count;i++){const events=requestEvents(firstIndex+i,seq);seq+=7;text+=events.map(event=>JSON.stringify(event)).join('\n')+'\n';if(text.length>=256*1024){await file.write(text);text='';}}
    if(text) await file.write(text);await file.sync();await file.close();revisions.set(id,seq-1);
    const before=readEvents,start=performance.now();const result=await service.getActivity(input);const measured={ms:performance.now()-start,eventsRead:readEvents-before};
    assert.equal(measured.eventsRead,count*7);appended+=count;assert.equal(result.rowsPage.totalRows,rows+appended);samples.push(measured);
    }
    appends[count]={ms:distribution(samples.map(sample=>sample.ms)).p95,eventsRead:count*7,iterations:appendIterations,timings:distribution(samples.map(sample=>sample.ms)),samples};
  }
  sample();
  const result={scope:'Real JSONL provider -> Runtime codec boundary -> Main service -> SQLite Worker; excludes Renderer',reusedFixture:Boolean(option('reuse')),root,rows,sessions,generationMs,coldMs,coldEvents,timings,appends,unchangedEventReads:0,mainHeapSampledPeakMiB:heap/2**20,processRssSampledPeakMiB:rss/2**20,heapSamplesMiB:memory.map(value=>value/2**20),eventLoopMs:{p50:loop.percentile(50)/1e6,p95:loop.percentile(95)/1e6,p99:loop.percentile(99)/1e6,max:loop.max/1e6}};
  console.log(JSON.stringify(result,null,2));
  if(option('out')) {await mkdir(dirname(option('out')),{recursive:true});await writeFile(option('out'),JSON.stringify(result,null,2)+'\n');}
} finally {
  clearInterval(timer);loop.disable();await service.dispose();await storage.close();
  // Only the automatically created temporary root belongs to this invocation.
  // An explicit root may contain unrelated files, even when generation succeeds.
  if(!option('root') && !option('keep') && !process.argv.includes('--keep')) await rm(root,{recursive:true,force:true});
}
