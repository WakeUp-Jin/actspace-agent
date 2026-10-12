/** Opt-in isolated Electron host for CU; records timing/size, never IPC bodies. */
const { app, ipcMain } = require('electron');
const { monitorEventLoopDelay, performance } = require('node:perf_hooks');
const { writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } = require('node:fs');
const { resolve, join } = require('node:path');

const root = resolve(process.env.ACTSPACE_DATA_DIR || '.');
const workspace = resolve(process.env.ACTSPACE_WORKSPACE_ROOT || '.');
if (!root.startsWith('/tmp/actspace-context-') || !workspace.startsWith('/tmp/actspace-context-')) {
  throw new Error('Acceptance host requires isolated /tmp/actspace-context-* data and workspace.');
}
mkdirSync(root, { recursive: true });
mkdirSync(workspace, { recursive: true });
app.setPath('downloads', workspace);
const startedAt = new Date().toISOString();
const started = performance.now();
const startup = {};
const histogram = monitorEventLoopDelay({ resolution: 10 });
histogram.enable();
const channels = new Map();
let maxHeap = 0, maxRss = 0;
let profiling = false;
// Explicit fixture-only CPU sampling; profiles contain function locations, never
// IPC payloads. A control file lets the main agent sample CU's real workload.
function maybeProfile() {
  const request = join(root, 'acceptance-profile-request');
  if (profiling || !existsSync(request)) return;
  unlinkSync(request);
  profiling = true;
  const session = new (require('node:inspector').Session)();
  session.connect();
  session.post('Profiler.enable', () => session.post('Profiler.start', () => {
    const stop = setTimeout(() => session.post('Profiler.stop', (error, result) => {
      if (!error) writeFileSync(join(root, 'acceptance-main.cpuprofile'), JSON.stringify(result.profile));
      session.disconnect(); profiling = false;
    }), 30000);
    stop.unref();
  }));
}
const originalHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, handler) => originalHandle(channel, async (...args) => {
  const start = performance.now();
  let bytes = 0, failed = false;
  try {
    const result = await handler(...args);
    // Only size leaves memory; no request/response payload or credentials logged.
    try { bytes = Buffer.byteLength(JSON.stringify(result) ?? ''); } catch { bytes = 0; }
    return result;
  } catch (error) { failed = true; throw error; }
  finally {
    const sample = channels.get(channel) ?? { count: 0, failures: 0, maxBytes: 0, totalBytes: 0, samples: [] };
    sample.count++; sample.failures += Number(failed); sample.maxBytes = Math.max(sample.maxBytes, bytes); sample.totalBytes += bytes;
    sample.samples.push(performance.now() - start);
    if (sample.samples.length > 2048) sample.samples.shift();
    channels.set(channel, sample);
  }
});
app.on('browser-window-created', (_event, window) => {
  startup.windowCreatedMs ??= performance.now() - started;
  window.once('ready-to-show', () => { startup.windowReadyMs ??= performance.now() - started; });
  window.webContents.once('did-finish-load', () => { startup.rendererLoadedMs ??= performance.now() - started; });
});
function flush() {
  maybeProfile();
  const memory = process.memoryUsage();
  maxHeap = Math.max(maxHeap, memory.heapUsed); maxRss = Math.max(maxRss, memory.rss);
  const distribution = values => {
    const sorted = [...values].sort((a, b) => a - b);
    return Object.fromEntries([50, 95, 99].map(p => [`p${p}`, sorted[Math.max(0, Math.ceil(sorted.length * p / 100) - 1)] ?? null]));
  };
  const payload = {
    scope: 'Actual Electron Main histogram and IPC handler duration; CU evidence reported separately',
    startedAt, sampledAt: new Date().toISOString(), elapsedMs: performance.now() - started, startup,
    versions: { electron: process.versions.electron, node: process.versions.node, sqlite: process.versions.sqlite },
    mainHeapBytes: memory.heapUsed, sampledMaxMainHeapBytes: maxHeap, processRssBytes: memory.rss, sampledMaxProcessRssBytes: maxRss,
    loopMs: { p50: histogram.percentile(50) / 1e6, p95: histogram.percentile(95) / 1e6, p99: histogram.percentile(99) / 1e6, max: histogram.max / 1e6 },
    processes: app.isReady() ? app.getAppMetrics().map(({ pid, type, cpu, memory }) => ({ pid, type, cpu, memory })) : [],
    ipc: Object.fromEntries([...channels].map(([key, { samples, ...totals }]) => [key, { ...totals, sampledCount: samples.length, durationMs: distribution(samples) }])),
  };
  const file = join(root, 'acceptance-runtime-metrics.json');
  writeFileSync(`${file}.tmp`, JSON.stringify(payload, null, 2) + '\n');
  renameSync(`${file}.tmp`, file);
}
const timer = setInterval(flush, 5000); timer.unref();
app.once('before-quit', () => { clearInterval(timer); flush(); histogram.disable(); });
require('../dist-electron/main/index.js');
