import { mkdtemp, open, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const { projectIndexedUsageActivity }=require('../../../packages/client/dist/sessions.cjs');
const option=name=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const rows=Number(option('rows')??100000),sessions=Number(option('sessions')??100);
const root=await mkdtemp(join(tmpdir(),'usage-json-baseline-')),path=join(root,'index.json');
const file=await open(path,'w',0o600);
try {
  await file.write('[');
  for(let s=0;s<sessions;s++) {
    if(s) await file.write(',');
    await file.write(JSON.stringify({sessionId:`benchmark-${s}`,title:`benchmark-${s}`,throughJournalSeq:rows/sessions}).slice(0,-1)+',"rows":[');
    let batch='';
    for(let i=s;i<rows;i+=sessions) {
      const item={activityId:`activity-${i}`,kind:i%5===0?'tool_invocation':'llm_request',sessionId:`benchmark-${s}`,agentRunId:`run-${i%1000}`,startedAt:new Date(1700000000000+i*1000).toISOString(),status:i%17===0?'error':'success',model:`model-${i%8}`,providerId:`provider-${i%3}`,toolName:i%5===0?`tool-${i%4}`:undefined,tokens:{inputTokens:100,outputTokens:50,cacheReadTokens:10,cacheWriteTokens:2,reasoningTokens:3,totalTokens:150},costUsd:0.001,costAmount:0.001,costCurrency:'USD',sourceEventSeq:i,relatedEventSeqs:[]};
      batch+=(i===s?'':',')+JSON.stringify(item);
      if(batch.length>256*1024){await file.write(batch);batch='';}
    }
    await file.write(batch+']}');
  }
  await file.write(']');await file.close();
  const loop=monitorEventLoopDelay({resolution:10});loop.enable();
  await new Promise(resolve=>setTimeout(resolve,30));
  const before=process.memoryUsage(),start=performance.now();
  const sources=JSON.parse(await readFile(path,'utf8'));const parseMs=performance.now()-start;
  let peak=process.memoryUsage();const timings={};
  for(const [name,filter] of [['first',{}],['page',{requestRowsPage:{page:2,limit:100}}],['filter',{search:'model-3'}]]) {
    const times=[];
    for(let i=0;i<5;i++) {
      const started=performance.now();const result=projectIndexedUsageActivity(sources,{range:'total',requestRowsPage:{limit:100},...filter});times.push(performance.now()-started);assert(result.rows.length<=100);
      const memory=process.memoryUsage();peak={...memory,heapUsed:Math.max(peak.heapUsed,memory.heapUsed),rss:Math.max(peak.rss,memory.rss)};
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    times.sort((a,b)=>a-b);timings[name]={p50:times[2],p95:times[4]};
  }
  await new Promise(resolve=>setTimeout(resolve,30));loop.disable();
  const report={scope:'Legacy full JSON parse + existing projectIndexedUsageActivity on Main; not original Journal rebuild',rows,sessions,parseMs,timings,heapPeakMiB:peak.heapUsed/2**20,rssPeakMiB:peak.rss/2**20,heapDeltaMiB:(peak.heapUsed-before.heapUsed)/2**20,eventLoopMs:{p50:loop.percentile(50)/1e6,p95:loop.percentile(95)/1e6,p99:loop.percentile(99)/1e6,max:loop.max/1e6}};
  console.log(JSON.stringify(report,null,2));
  if(option('out')){await mkdir(dirname(option('out')),{recursive:true});await writeFile(option('out'),JSON.stringify(report,null,2)+'\n');}
} finally {await file.close().catch(()=>{});await rm(root,{recursive:true,force:true});}
