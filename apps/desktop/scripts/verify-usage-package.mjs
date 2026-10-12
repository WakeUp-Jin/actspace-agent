import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { access, mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

// Run against either a build or pnpm's production deploy. The latter catches
// missing transitive packages and Worker artifacts independently of UI tests.
const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const appRoot = resolve(option('app-root') ?? join(import.meta.dirname, '..'));
if (!process.argv.includes('--child')) {
  const executable = option('electron');
  if (!executable) throw new Error('Pass --electron=/absolute/path/to/Electron and optionally --app-root=production-deploy');
  const browserProcess = process.argv.includes('--browser-process');
  if (browserProcess) {
    // A packaged Electron binary ignores the CLI bootstrap and launches its own
    // Resources/app. Use the stock binary and point app-root at the copied layout.
    const resources = process.platform === 'darwin' ? join(dirname(executable), '../Resources') : join(dirname(executable), 'resources');
    for (const candidate of [join(resources, 'app/package.json'), join(resources, 'app.asar')]) {
      try { await access(candidate); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      throw new Error('Browser-process probe requires a stock Electron executable; pass the packaged Resources/app separately with --app-root.');
    }
  }
  const probeRoot = await mkdtemp(join(tmpdir(), 'usage-electron-host-'));
  const bootstrap = browserProcess ? probeRoot : undefined;
  try {
    if (bootstrap) {
      await mkdir(join(bootstrap, 'user-data'));
      await writeFile(join(bootstrap, 'package.json'), JSON.stringify({ name: 'usage-worker-package-probe', main: 'main.cjs' }));
      await writeFile(join(bootstrap, 'main.cjs'), `const { app } = require('electron'); app.setPath('userData', ${JSON.stringify(join(bootstrap, 'user-data'))}); app.whenReady().then(() => import(${JSON.stringify(pathToFileURL(import.meta.filename).href)})).then(() => app.exit(0), error => { console.error(error); app.exit(1); });`);
    }
    const env = { ...process.env, ACTSPACE_DATA_DIR: join(probeRoot, 'user-data'), ACTSPACE_WORKSPACE_ROOT: join(probeRoot, 'workspace'), ACTSPACE_USAGE_PROBE_RESULT: join(probeRoot, 'result.json') };
    delete env.ACTSPACE_REPO_ROOT;
    if (browserProcess) delete env.ELECTRON_RUN_AS_NODE;
    else env.ELECTRON_RUN_AS_NODE = '1';
    const code = await new Promise((resolveCode, reject) => {
      const child = spawn(executable, [bootstrap ?? import.meta.filename, '--child', `--app-root=${appRoot}`], { env, cwd: probeRoot, stdio: 'inherit' });
      const timeout = setTimeout(() => child.kill('SIGTERM'), 60_000);
      child.on('error', error => { clearTimeout(timeout); reject(error); }); child.on('exit', code => { clearTimeout(timeout); resolveCode(code); });
    });
    if (code !== 0) throw new Error(`Electron package probe failed: ${code}`);
    const result = JSON.parse(await readFile(env.ACTSPACE_USAGE_PROBE_RESULT, 'utf8'));
    assert.equal(result.ok, true); assert.equal(result.appRoot, appRoot);
    if (browserProcess) assert.equal(result.processType, 'browser');
  } finally { await rm(probeRoot, { recursive: true, force: true }); }

} else {
  assert(process.versions.electron, 'Probe must execute in Electron');
  const requireApp = createRequire(join(appRoot, 'package.json'));
  const runtimeRequire = createRequire(requireApp.resolve('@actspace/runtime'));
  const { createSessionHeader } = await import(pathToFileURL(runtimeRequire.resolve('@actspace/session-journal')).href);
  const providerEntry = runtimeRequire.resolve('@actspace/session-jsonl');
  const { JsonlQueryReader } = await import(pathToFileURL(join(dirname(providerEntry), 'query-reader.js')).href);
  const reader = new JsonlQueryReader();
  const root = await mkdtemp(join(tmpdir(), 'usage-package-probe-'));
  const worker = new Worker(join(appRoot, 'dist-electron/main/runtime-v2/usage-read-model-worker.js'), { workerData: { dataRoot: root } });
  let sequence = 0;
  const send = message => new Promise((resolveMessage, reject) => {
    const id = String(++sequence);
    const cleanup = () => { clearTimeout(timer); worker.off('message', reply); worker.off('error', fail); };
    const fail = error => { cleanup(); reject(error); };
    const reply = value => { if (value.id !== id) return; if (value.heartbeat) { timer.refresh(); return; } cleanup(); value.ok ? resolveMessage(value.result) : reject(new Error(value.error)); };
    const timer = setTimeout(() => fail(new Error('Packaged Worker timed out')), 15_000);
    worker.on('message', reply); worker.once('error', fail); worker.postMessage({ ...message, id });
  });
  try {
    const header = createSessionHeader({ sessionId: 'probe', createdAt: new Date().toISOString(), lineage: null, createdWith: { profileId: 'probe', runtimeContractVersion: 'v2', manifestDigest: 'probe', plugins: [], codecSetDigest: 'probe' } });
    await mkdir(join(root, 'sessions-v2/probe'), { recursive: true });
    const journal = join(root, 'sessions-v2/probe/journal.jsonl');
    await writeFile(journal, JSON.stringify(header) + '\n');
    assert.equal((await reader.source(journal, 'probe')).throughSeq, -1);
    assert.equal((await reader.read(journal, 'probe', { throughSeq: -1 })).done, true);
    await send({ type: 'sync', sources: [], catalog: [{ sessionId: 'probe', title: 'Packaged needle', revision: -1, createdAt: header.createdAt, updatedAt: header.createdAt, workspaceRoot: null, pinned: false, archived: false, accessState: 'browse-only', isChildSession: false, agentRunCount: 0 }] });
    const result = await send({ type: 'query', request: 'sessions', input: { search: 'needle', limit: 10 } });
    assert.equal(result.items[0]?.id, 'probe');
    await send({type:'catalog-fallback-begin'});
    await send({type:'catalog-fallback-append',row:{sessionId:'fallback',title:'Fallback needle',revision:-1,createdAt:header.createdAt,updatedAt:header.createdAt,workspaceRoot:null,pinned:false,archived:false,accessState:'browse-only',isChildSession:false,agentRunCount:0},events:[],first:true});
    assert.equal((await send({type:'catalog-fallback-query',input:{search:'needle'}})).items[0]?.id,'fallback');
    await send({type:'catalog-fallback-end'});
    await send({type:'fallback-begin'});
    await send({type:'fallback-append',source:{sessionId:'usage-fallback',title:'Usage needle',throughJournalSeq:0,workspaceRoot:null},events:[{seq:0,type:'tool/call',time:header.createdAt,data:{callId:'probe-call',name:'read'}}]});
    assert.equal((await send({type:'fallback-query',request:'activity',input:{range:'total',search:'needle'}})).rows[0]?.sessionId,'usage-fallback');
    await send({type:'fallback-end'});
    const report = { ok: true, appRoot, processType: process.type, electron: process.versions.electron, node: process.versions.node, sqlite: process.versions.sqlite, providerWorker: true, sqliteWorker: true, fts5: true, historyFallback:true,usageFallback:true };
    if (process.env.ACTSPACE_USAGE_PROBE_RESULT) await writeFile(process.env.ACTSPACE_USAGE_PROBE_RESULT, JSON.stringify(report));
    console.log(JSON.stringify(report));
  } finally { await reader.close(); await worker.terminate(); await rm(root, { recursive: true, force: true }); }
}
