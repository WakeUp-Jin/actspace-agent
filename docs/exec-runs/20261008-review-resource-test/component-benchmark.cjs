const fs=require('node:fs/promises'), path=require('node:path'), {performance,monitorEventLoopDelay}=require('node:perf_hooks');
const root='/Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent/apps/desktop/dist-electron/main';
const {ReviewWorkspaceWatcher}=require(root+'/review-workspace-watcher.js');
const {ReviewCoordinator}=require(root+'/review-coordinator.js');
const {ReviewGitEngine,runReviewGitCommand}=require(root+'/review-git-engine.js');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const base=(await fs.readFile('/tmp/actspace-review-resources-current','utf8')).trim(),repo=path.join(base,'large-repo'),results=[];
 for(const mode of ['no-watch','watch-only','watch-and-query']){
  let events=0,notices=0,commands=0,queries=0,failures=0,writes=0,peak=0; const watcher=new ReviewWorkspaceWatcher();
  const engine=new ReviewGitEngine({runner:(args,opts)=>{commands++;return runReviewGitCommand(args,opts)}});
  const coord=new ReviewCoordinator({resolveWorkspace:async()=>({ok:true,workspace:{workspaceId:'fixture',workspaceRoot:repo}}),queryProvider:engine});
  const pending=new Set();
  coord.subscribe(()=>{notices++;if(mode==='watch-and-query'){queries++;const p=coord.getSnapshot({workspaceRoot:repo,selection:{kind:'uncommitted'}}).then(r=>{if(!r.ok)failures++});pending.add(p);p.finally(()=>pending.delete(p))}});
  global.gc();const before=process.memoryUsage();
  if(mode!=='no-watch')await watcher.ensure('fixture',repo,()=>{events++;coord.scheduleInvalidation('fixture')});
  const delay=monitorEventLoopDelay({resolution:20});delay.enable();const samples=setInterval(()=>peak=Math.max(peak,process.memoryUsage().rss),100);
  async function phase(name,ms,write){
   const counts={events,notices,commands,queries,failures,writes},cpu=process.cpuUsage(),t=performance.now();let n=0;
   while(performance.now()-t<ms){if(write){await Promise.all(Array.from({length:20},(_,i)=>fs.writeFile(path.join(repo,'dist',`output-${i}.js`),`// generation ${n} file ${i}\n`)));writes+=20;n++}await wait(50)}
   const used=process.cpuUsage(cpu),elapsed=performance.now()-t;return {name,elapsedMs:elapsed,cpuPercent:(used.user+used.system)/1000/elapsed*100,events:events-counts.events,notifications:notices-counts.notices,gitCommands:commands-counts.commands,queries:queries-counts.queries,failures:failures-counts.failures,writes:writes-counts.writes,rssMiB:process.memoryUsage().rss/1048576};
  }
  const phases=[];phases.push(await phase('idle',5000,false));phases.push(await phase('ignored-build-churn',20000,true));phases.push(await phase('recovery',5000,false));
  await Promise.allSettled([...pending]);clearInterval(samples);delay.disable();const after=process.memoryUsage();watcher.dispose();coord.dispose();await wait(200);global.gc();const released=process.memoryUsage();
  const result={mode,before,after,released,peakRssMiB:peak/1048576,eventLoopP99Ms:delay.percentile(99)/1e6,phases};results.push(result);await fs.writeFile(path.join(base,'component-benchmark.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({mode,phases,peakRssMiB:result.peakRssMiB,retainedHeapMiB:(released.heapUsed-before.heapUsed)/1048576}));
 }
 global.gc();const before=process.memoryUsage(),watcher=new ReviewWorkspaceWatcher(),t=performance.now();
 for(let i=0;i<30;i++)await watcher.ensure('root-'+i,path.join(base,'many-roots','repo-'+i),()=>{});
 await wait(2000);global.gc();const held=process.memoryUsage(),watcherCount=watcher.roots.size;
 watcher.dispose();await wait(2000);global.gc();const after=process.memoryUsage();
 const many={roots:30,totalSubdirectories:3000,setupAndSettleMs:performance.now()-t,before,held,after,watcherCount,remainingRoots:watcher.roots.size};await fs.writeFile(path.join(base,'many-workspaces.json'),JSON.stringify(many,null,2));console.log(JSON.stringify(many));
})().catch(e=>{console.error(e);process.exitCode=1});
