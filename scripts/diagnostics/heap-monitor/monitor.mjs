// 全程内存记录器。用法见 docs/tools/heap-monitor/README.md：
//   ACTSPACE_INSPECT_MAIN=9229 pnpm dev            # 另一个终端先启动 app，打开调试端口
//   node scripts/diagnostics/heap-monitor/monitor.mjs tmp/heap/<runN> [--wait-new]
// 1. 等主进程 inspector（127.0.0.1:9229）出现，连上后每 500ms 采样一次；界面进程（9230）出现后也连上。
// 2. 全程开着 V8 分配采样（含已被 GC 回收的对象），结束时保存，用来回答「谁分配了这么多」。
// 3. 收到 SIGINT / SIGTERM，或者 app 退出时，停止采样并写出全部数据。
import { mkdirSync, createWriteStream, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const outDir = process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? `tmp/heap/run-${Date.now()}`;
mkdirSync(outDir, { recursive: true });
const MAIN_PORT = Number(process.env.ACTSPACE_INSPECT_MAIN ?? 9229), RENDERER_PORT = MAIN_PORT + 1, INTERVAL = 500;
const samples = createWriteStream(join(outDir, "samples.jsonl"));
const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 不用 Node 自带的 WebSocket：它和 Chromium 协商了 permessage-deflate，解压后单条消息超过 4 MB 就直接断开，
// 界面进程的分配采样一导出就超（run5 的 renderer「closed」）。主进程的 Node inspector 不压缩，所以没事。
// 改用 ws，关掉压缩、不限单条大小。
// ws 是 apps/desktop 的依赖，从那里解析，不写死 pnpm 的内部路径。
const WebSocket = createRequire(new URL("../../../apps/desktop/package.json", import.meta.url))("ws");

class Cdp {
  constructor(url) { this.url = url; this.nextId = 1; this.pending = new Map(); this.closed = false; }
  async open() {
    this.ws = new WebSocket(this.url, { perMessageDeflate: false, maxPayload: 0 });
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    this.ws.onmessage = (message) => { const data = JSON.parse(String(message.data)); const done = this.pending.get(data.id); if (done) { this.pending.delete(data.id); done(data); } };
    this.ws.onclose = (event) => { this.closed = true; this.closeInfo = `code ${event.code} ${String(event.reason ?? "")}`.trim(); if (!stopping) log(`连接断开（${this.closeInfo}）`); for (const done of this.pending.values()) done({ error: { message: "closed" } }); this.pending.clear(); };
    return this;
  }
  send(method, params = {}, timeoutMs = 60_000) {
    if (this.closed) return Promise.resolve({ error: { message: "closed" } });
    return new Promise((resolve) => {
      const id = this.nextId++;
      const timer = setTimeout(() => { this.pending.delete(id); resolve({ error: { message: "timeout" } }); }, timeoutMs);
      this.pending.set(id, (data) => { clearTimeout(timer); resolve(data); });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function targets(port) {
  try { return await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) })).json(); } catch { return null; }
}
const SAMPLING = { samplingInterval: 32768, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true };

// 主进程里执行：所有 Electron 进程的内存 / CPU + 主进程 V8 堆。includeCommandLineAPI 让表达式里能用 require。
const MAIN_PROBE = `(() => {
  const { app } = require("electron"); const v8 = require("v8");
  const m = process.memoryUsage(); const h = v8.getHeapStatistics();
  return JSON.stringify({
    main: { rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal, external: m.external, arrayBuffers: m.arrayBuffers, heapLimit: h.heap_size_limit, mallocedMemory: h.malloced_memory },
    processes: app.getAppMetrics().map((p) => ({ pid: p.pid, type: p.type, name: p.name, cpu: p.cpu.percentCPUUsage, workingSetKB: p.memory.workingSetSize, peakKB: p.memory.peakWorkingSetSize })),
  });
})()`;

let main, renderer, stopping = false;
const startedAt = Date.now();

async function connectRenderer() {
  const list = await targets(RENDERER_PORT);
  const page = list?.find((target) => target.type === "page" && !target.url.startsWith("devtools://"));
  if (!page) return;
  renderer = await new Cdp(page.webSocketDebuggerUrl).open();
  renderer.url = page.url;
  await renderer.send("HeapProfiler.enable");
  await renderer.send("HeapProfiler.startSampling", SAMPLING);
  log(`界面进程已连接：${page.url}`);
}

// 分配采样按段保存：录十几分钟后一次导出，界面进程的采样会大到传输途中连接被关掉（run5）。
// 每段 CHUNK_MS 停一次、存成 <name>-<序号>.heapprofile、立刻重开；分析时把各段合并。
const CHUNK_MS = 60_000;
const chunkIndex = { main: 0, renderer: 0 };
async function saveChunk(name, cdp, restart) {
  if (!cdp || cdp.closed) return false;
  const result = await cdp.send("HeapProfiler.stopSampling", {}, 120_000);
  if (restart && !cdp.closed) await cdp.send("HeapProfiler.startSampling", SAMPLING);
  if (!result.result?.profile) { log(`${name}：第 ${chunkIndex[name] + 1} 段采样失败 ${JSON.stringify(result.error)}${cdp.closeInfo ? `（${cdp.closeInfo}）` : ""}`); return false; }
  const file = `${name}-${String(++chunkIndex[name]).padStart(3, "0")}.heapprofile`;
  writeFileSync(join(outDir, file), JSON.stringify(result.result.profile));
  return true;
}

async function finish(reason) {
  if (stopping) return; stopping = true;
  log(`停止记录（${reason}），保存最后一段分配采样…`);
  for (const [name, cdp] of [["main", main], ["renderer", renderer]]) {
    if (!cdp || cdp.closed) { log(`${name}：连接已断开，最后一段拿不到（已存 ${chunkIndex[name]} 段）`); continue; }
    if (await saveChunk(name, cdp, false)) log(`${name}：分配采样已保存，共 ${chunkIndex[name]} 段`);
  }
  await new Promise((resolve) => samples.end(resolve));
  log(`数据在 ${outDir}`);
  process.exit(0);
}
process.on("SIGINT", () => void finish("SIGINT"));
process.on("SIGTERM", () => void finish("SIGTERM"));

// --wait-new：现在已经在跑的那个 app 不算，等它退出、新启动的 app 出现后才开始记录（从启动那一刻记起）。
const existing = process.argv.includes("--wait-new") ? (await targets(MAIN_PORT))?.[0]?.id : undefined;
log(existing ? `忽略当前正在运行的 app，等你重启…` : `等待主进程 inspector 127.0.0.1:${MAIN_PORT} …`);
for (;;) {
  const list = await targets(MAIN_PORT);
  if (list?.[0]?.webSocketDebuggerUrl && list[0].id !== existing) { main = await new Cdp(list[0].webSocketDebuggerUrl).open(); break; }
  await sleep(300);
}
await main.send("HeapProfiler.enable");
await main.send("HeapProfiler.startSampling", SAMPLING);
log("主进程已连接，开始记录");

let lastPrint = 0, lastChunk = Date.now();
while (!stopping) {
  const tick = Date.now();
  if (tick - lastChunk >= CHUNK_MS) {
    lastChunk = tick;
    await saveChunk("main", main, true);
    if (renderer && !renderer.closed) await saveChunk("renderer", renderer, true);
  }
  if ((!renderer || renderer.closed) && tick - startedAt > 0) await connectRenderer().catch(() => undefined);
  const evalStart = Date.now();
  const probe = await main.send("Runtime.evaluate", { expression: MAIN_PROBE, includeCommandLineAPI: true, returnByValue: true }, 30_000);
  // 主线程忙的时候这个往返会变长：它近似「主进程事件循环被占住多久」。
  const mainLagMs = Date.now() - evalStart;
  if (main.closed) { await finish("app 已退出"); break; }
  const value = probe.result?.result?.value;
  const row = { t: tick - startedAt, mainLagMs, ...(value ? JSON.parse(value) : { error: JSON.stringify(probe.error ?? probe.result?.exceptionDetails?.text) }) };
  if (renderer && !renderer.closed) {
    const usage = await renderer.send("Runtime.getHeapUsage", {}, 5_000);
    if (usage.result) row.renderer = { heapUsed: usage.result.usedSize, heapTotal: usage.result.totalSize };
  }
  samples.write(JSON.stringify(row) + "\n");
  if (tick - lastPrint > 10_000 && row.processes) {
    lastPrint = tick;
    const total = row.processes.reduce((sum, p) => sum + p.workingSetKB, 0) / 1024;
    log(`总 ${total.toFixed(0)}MB · 主进程堆 ${(row.main.heapUsed / 1048576).toFixed(0)}MB · 界面堆 ${row.renderer ? (row.renderer.heapUsed / 1048576).toFixed(0) + "MB" : "—"} · 主线程延迟 ${mainLagMs}ms`);
  }
  await sleep(Math.max(0, INTERVAL - (Date.now() - tick)));
}
