import assert from 'node:assert/strict';
import { mkdir, open, writeFile, stat, mkdtemp, rm } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { createCoreCodecRegistry, createSessionHeader } from '@actspace/session-journal';
import { JsonlSessionStorage } from '../../../packages/session/jsonl/dist/index.js';
import { SessionStore } from '../../../packages/session/persistence/dist/index.js';
import { RuntimeSessionController } from '../../../packages/runtime/dist/session/session-controller.js';
import { ContextEngine } from '../../../packages/context/engine/dist/index.js';
const require=createRequire(import.meta.url);
const {UsageReadModelService}=require('../dist-electron/main/runtime-v2/usage-read-model.js');
const {ContextPanelService}=require('../dist-electron/main/runtime-v2/context-panel-service.js');
const option=name=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const count=Number(option('requests')??600),sessions=Number(option('sessions')??3);
assert(Number.isSafeInteger(count)&&count>=501&&Number.isSafeInteger(sessions)&&sessions>1);
const root=option('root')?resolve(option('root')):await mkdtemp(join(tmpdir(),'context-benchmark-'));
const registry=createCoreCodecRegistry(),epoch=Date.parse('2026-10-01T00:00:00Z');
const createdWith={profileId:'base',presetId:'actspace.main',initialAgentMode:'agent',runtimeContractVersion:'actspace.runtime.v2',manifestDigest:'benchmark',plugins:[],codecSetDigest:registry.digest};
const content={system:{sections:[{id:'base',owner:'system',order:0,content:'Context benchmark'}],modelFacts:[]},tools:Array.from({length:620},(_,i)=>({name:`fixture_tool_${i}`,description:'Synthetic bounded tool metadata',inputSchema:{type:'object',properties:{}}})),supplements:[],conversation:{entries:[],replaceGeneration:0}};
const context={request:{sessionId:'context-0',requestId:'live',routeId:'fixture',model:'fixture',options:{}},content,status:{throughJournalSeq:0,cycle:0,paths:[],facts:[],plugins:{}}};
const engine=new ContextEngine({resolve:()=>context});
const live=await engine.getContext(context.request);await engine.recordPrepared(live,{modelKey:'fixture/fixture',label:'fixture',contextWindow:32768,autoCompactAtTokens:26000});
const projection=engine.getProjection(context.request);
const manifest={...projection.manifest,entries:projection.manifest.entries.map(({preview,fullTextAvailable,source,...entry})=>entry)};
await mkdir(root,{recursive:true});await writeFile(join(root,'global-usage-reset.json'),JSON.stringify({version:1,resetAt:'2000-01-01T00:00:00Z'}));
let journalBytes=0;
for(let s=0;s<sessions;s++){
 const id=`context-${s}`,path=join(root,'sessions-v2',id,'journal.jsonl');await mkdir(dirname(path),{recursive:true});const file=await open(path,'wx');let seq=0;
 const append=async(type,data,surface=null)=>{const event={recordKind:'event',seq:seq++,type,eventVersion:1,criticality:registry.get(type).criticality,time:new Date(epoch+seq).toISOString(),source:{ownerPluginId:'@actspace/core'},provenance:{sourceEventSeqs:[],contributorIds:[],runtimeSelectionSeq:null},data,surface};registry.resolve(event);await file.write(JSON.stringify(event)+'\n');};
 await file.write(JSON.stringify(createSessionHeader({sessionId:id,createdAt:new Date(epoch).toISOString(),cwd:root,lineage:null,createdWith}))+'\n');
 await append('session/title-set',{title:`Context benchmark ${s}`});
 for(let i=0;i<count;i++){
 const ids={turnId:`t${i}`,stepId:`step${i}`,requestId:`r${i}`,agentRunId:`run${i}`};
 await append('turn/start',ids);await append('step/start',{...ids,stepIndex:1});
 await append('request/header',{...ids,model:'fixture',routeId:'fixture'});
 await append('request/context',{...ids,snapshot:{contextManifest:manifest,contextModel:projection.model,logicalAgentScopeId:`main:${id}`,renderedSystemPrompt:'Context benchmark',messages:[]}});
 const body=[{type:'text',text:`Visible synthetic response ${i}`}],usage={inputTokens:100,outputTokens:20,cacheReadTokens:10,totalTokens:120};
 await append('assistant/message',{...ids,messageId:`a${i}`,content:body,finishReason:'stop',usage},{kind:'append',node:{kind:'assistant',messageId:`a${i}`,content:body}});
 await append('step/end',{...ids,reason:'completed',usage});await append('turn/end',{...ids,reason:'completed'});
 }
 await file.sync();await file.close();journalBytes+=(await stat(path)).size;
}
const storage=new JsonlSessionStorage({dataRoot:root,runtimeId:'context-benchmark',registry});
const controller=new RuntimeSessionController({dataRoot:root,runtimeId:'context-benchmark',registry,profileId:'base',manifestDigest:'benchmark',plugins:[]},new SessionStore({registry},storage));
let enumerations=0,readEvents=0,sourceCalls=0;const readSessions=new Set();
const service=new UsageReadModelService({sessionQuerySources:()=>{enumerations++;return controller.querySources();},readSessionEventBatch:async(id,input)=>{const batch=await controller.readEventBatch(id,input);readEvents+=batch.events.length;readSessions.add(id);return batch;}},root);
const panel=new ContextPanelService({readContextProjection:async()=>projection,readContextEntryText:async()=>null,sessionQuerySource:async id=>{sourceCalls++;return controller.querySource(id);}},service);
const loop=monitorEventLoopDelay({resolution:10});loop.enable();let heap=0;const timer=setInterval(()=>{heap=Math.max(heap,process.memoryUsage().heapUsed);},20);
const dist=values=>Object.fromEntries([50,95,99].map(p=>[`p${p}`,[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p/100)-1]]));
try{
 const begin=performance.now();let view=await panel.describe({sessionId:'context-0',consumerId:'bench'});const currentMs=performance.now()-begin;assert.equal(view.current.basis,'current-context');
 for(let i=0;view.history.status!=='ready'&&i<6000;i++){await new Promise(r=>setTimeout(r,10));view=await panel.describe({sessionId:'context-0',consumerId:'bench'});assert(!view.history.error);}
 assert.equal(view.history.status,'ready');const coldMs=performance.now()-begin;assert.equal(enumerations,0);assert.deepEqual([...readSessions],['context-0']);assert.equal(view.stats.stepCount,count);
 assert(view.limits.trend.truncated);assert.equal(view.entriesPage.total,621);assert(Buffer.byteLength(JSON.stringify(view))<=200*1024);
 const before=readEvents;const hot=[];let conditionalBytes=0;
 for(let i=0;i<20;i++){const start=performance.now();const result=await panel.describe({sessionId:'context-0',consumerId:'bench',versionToken:view.versionToken});hot.push(performance.now()-start);assert(result.notModified);conditionalBytes+=Buffer.byteLength(JSON.stringify(result));}
 assert.equal(readEvents,before);
 const usage=service.getActivity({range:'total',requestRowsPage:{limit:100},requestId:'background-usage'});const concurrent=[];
 for(let i=0;i<20;i++){const start=performance.now();await panel.describe({sessionId:'context-0',consumerId:'bench',versionToken:view.versionToken});concurrent.push(performance.now()-start);await new Promise(r=>setTimeout(r,10));}
 assert.equal((await usage).rowsPage.totalRows,count*sessions);
 service.releaseContext('context-0','bench');const after=readEvents;await new Promise(r=>setTimeout(r,100));assert.equal(readEvents,after);
 const output={scope:'Legal JSONL -> Runtime codec -> SQLite Worker + engine projection -> Main facade; no Renderer or external model API',root,sessions,requestsPerSession:count,journalBytes,currentMs,historyColdMs:coldMs,hotMs:dist(hot),concurrentCurrentMs:dist(concurrent),contextOnlyEnumerations:0,contextOnlySessions:1,unchangedEventReads:0,closedConsumerEventReads:0,conditionalMeanBytes:conditionalBytes/20,initialResponseBytes:Buffer.byteLength(JSON.stringify(view)),totalEntries:view.entriesPage.total,sourceCalls,mainHeapSampledPeakMiB:heap/2**20,eventLoopMs:{p95:loop.percentile(95)/1e6,p99:loop.percentile(99)/1e6,max:loop.max/1e6},sqliteBytes:(await stat(join(root,'runtime-v2/usage-read-model.sqlite'))).size};
 console.log(JSON.stringify(output,null,2));if(option('out')){await mkdir(dirname(option('out')),{recursive:true});await writeFile(option('out'),JSON.stringify(output,null,2)+'\n');}
}finally{clearInterval(timer);loop.disable();await service.dispose();await storage.close();if(!option('root'))await rm(root,{recursive:true,force:true});}
