import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCordisRoot, mountIsolatedCordisTree } from "@actspace/cordis-adapter";
import type { HarnessInventoryLine, HarnessRuntimeStatLine, HarnessStatsFileLine, HarnessToolOwnerLine } from "@actspace/shared";
import { HARNESS_DURATION_BASE_MS, harnessHistogramIndex } from "@actspace/shared";
import { HARNESS_STATS_MAX_KEYS, HarnessStats, HarnessStatsRecorder, HarnessStatsSink, harnessStatsEnabled } from "../index.js";

const roots: string[] = [];
async function tempRoot(): Promise<string> { const root = await mkdtemp(join(tmpdir(), "harness-stats-")); roots.push(root); return root; }
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function readLines(root: string, file = "2026-11.jsonl"): Promise<HarnessStatsFileLine[]> {
  const text = await readFile(join(root, "harness-stats", file), "utf8");
  expect(text.endsWith("\n")).toBe(true);
  return text.trimEnd().split("\n").map(line => JSON.parse(line));
}
const T0 = Date.UTC(2026, 10, 1, 9, 30);

class PrivateService {
  #secret = 41;
  bump(): number { return ++this.#secret; }
  get secret(): number { return this.#secret; }
  async later(fail = false): Promise<string> { if (fail) throw new Error("later failed"); return "ok"; }
  fail(): never { throw new Error("sync failed"); }
}

async function mountPair(stats: HarnessStats, extra: { consumer?: (ctx: any) => unknown; service?: object } = {}) {
  const root = await createCordisRoot();
  const mount = stats.observeMount({ harnessId: "main", expectedRevision: 2 });
  const service = extra.service ?? new PrivateService();
  const tree = await mountIsolatedCordisTree({ parent: root.context, sharedServices: [], observer: mount.observer, entries: [
    { id: "provider", config: {}, provides: ["svc"], injects: [], origin: "builtin", module: { apply: (ctx: any) => { ctx.provide("svc", service); } } },
    { id: "consumer", config: {}, provides: [], injects: ["svc"], origin: "evolved", module: { inject: ["svc"], apply: (ctx: any) => extra.consumer?.(ctx) } },
  ] });
  return { root, tree, mount, service, async close() { await tree.dispose(); await root.dispose(); } };
}

describe("recorder", () => {
  it("accumulates per hour, revision, plugin, kind, name and method with a log histogram", () => {
    let now = T0;
    const recorder = new HarnessStatsRecorder({ now: () => now });
    const base = { revision: "main@3", kind: "service", plugin: "a", name: "svc", method: "m", provider: "b" } as const;
    recorder.record({ ...base, ms: 0.5, error: false });
    recorder.record({ ...base, ms: 5, error: true });
    recorder.record({ ...base, method: "other", ms: 1, error: false });
    now += 3_600_000;
    recorder.record({ ...base, ms: 1, error: false });
    expect(recorder.size).toBe(3);
    const cells = recorder.take();
    const first = cells.find(cell => cell.method === "m" && cell.hour === Date.UTC(2026, 10, 1, 9))!;
    expect(first).toMatchObject({ calls: 2, errors: 1, provider: "b" });
    expect(first.totalMs).toBeCloseTo(5.5);
    expect(first.histogram[harnessHistogramIndex(0.5, HARNESS_DURATION_BASE_MS)]).toBe(1);
    expect(first.histogram[harnessHistogramIndex(5, HARNESS_DURATION_BASE_MS)]).toBe(1);
    expect(first.histogram.length).toBe(16);
    expect(recorder.size).toBe(0);
  });

  it("asks for an immediate flush at the key limit", () => {
    let full = 0;
    const recorder = new HarnessStatsRecorder({ now: () => T0, onFull: () => { full++; } });
    for (let index = 0; index < HARNESS_STATS_MAX_KEYS - 1; index++) recorder.record({ revision: "r", kind: "service", plugin: "p", name: "n", method: `m${index}`, provider: null, ms: 1, error: false });
    expect(full).toBe(0);
    recorder.record({ revision: "r", kind: "service", plugin: "p", name: "n", method: "last", provider: null, ms: 1, error: false });
    expect(full).toBe(1);
    const small = new HarnessStatsRecorder({ now: () => T0, maxKeys: 2, onFull: () => { full++; } });
    small.record({ revision: "r", kind: "listener", plugin: "p", name: "a", method: "", provider: null, ms: 1, error: false });
    small.record({ revision: "r", kind: "listener", plugin: "p", name: "a", method: "", provider: null, ms: 1, error: false });
    expect(full).toBe(1);
  });

  it("merges restored cells into newer data", () => {
    const recorder = new HarnessStatsRecorder({ now: () => T0 });
    const sample = { revision: "r", kind: "service", plugin: "p", name: "n", method: "m", provider: null, ms: 1, error: false } as const;
    recorder.record(sample);
    const taken = recorder.take();
    recorder.record({ ...sample, error: true });
    recorder.restore(taken);
    const [cell] = recorder.take();
    expect(cell).toMatchObject({ calls: 2, errors: 1 });
    expect(cell!.histogram.reduce((a, b) => a + b, 0)).toBe(2);
  });
});

describe("sink", () => {
  it("splits lines by the month of their own time and ends every line with a newline", async () => {
    const root = await tempRoot();
    const sink = new HarnessStatsSink({ dataRoot: root });
    const runtime = (hour: string): HarnessRuntimeStatLine => ({ v: 1, t: "runtime", hour, revision: "main@1", kind: "listener", plugin: "p", name: "e", method: "", provider: null, calls: 1, errors: 0, totalMs: 1, histogram: new Array(16).fill(0) });
    const failed = await sink.append([runtime("2026-10-31T23:00:00.000Z"), runtime("2026-11-01T00:00:00.000Z")]);
    expect(failed).toEqual([]);
    expect((await readdir(join(root, "harness-stats"))).sort()).toEqual(["2026-10.jsonl", "2026-11.jsonl"]);
    expect(await readLines(root, "2026-10.jsonl")).toHaveLength(1);
    expect(await readLines(root)).toHaveLength(1);
  });

  it("counts a failed write and returns its lines so the caller can retry them", async () => {
    const root = await tempRoot();
    let broken = true;
    const sink = new HarnessStatsSink({ dataRoot: root, fileSystem: {
      mkdir: async () => undefined,
      appendFile: async (path, data) => { if (broken) throw new Error("disk full"); await writeFile(path, data, { flag: "a" }); },
    } });
    // The directory is created by the fake mkdir no-op, so create it ourselves for the real writes.
    await mkdir(join(root, "harness-stats"), { recursive: true });
    const line: HarnessStatsFileLine = { v: 1, t: "runtime", hour: "2026-11-01T09:00:00.000Z", revision: "main@1", kind: "service", plugin: "p", name: "n", method: "m", provider: null, calls: 1, errors: 0, totalMs: 1, histogram: new Array(16).fill(0) };
    expect(await sink.append([line])).toEqual([line]);
    expect(sink.writeFailures).toBe(1);
    broken = false;
    expect(await sink.append([line])).toEqual([]);
    // 不再写健康行：文件里只有数据行。
    expect((await readLines(root)).map(item => item.t)).toEqual(["runtime"]);
    broken = true;
    await sink.append([line]); await sink.append([line]);
    expect(sink.writeFailures).toBe(3);
  });
});

describe("HarnessStats", () => {
  it("is switched off by ACTSPACE_HARNESS_STATS=0 only", () => {
    expect(harnessStatsEnabled({})).toBe(true);
    expect(harnessStatsEnabled({ ACTSPACE_HARNESS_STATS: "1" })).toBe(true);
    expect(harnessStatsEnabled({ ACTSPACE_HARNESS_STATS: "0" })).toBe(false);
  });

  it("keeps services with #private fields working and gives a stable Proxy per plugin", async () => {
    const root = await tempRoot();
    const stats = new HarnessStats({ dataRoot: root, now: () => T0, flushIntervalMs: 3_600_000 });
    const seen: any = {};
    const mounted = await mountPair(stats, { consumer: ctx => {
      const first = ctx.get("svc"); const second = ctx.get("svc");
      seen.same = first === second;
      seen.viaProp = ctx.svc === first;
      seen.value = first.bump();
      seen.secret = first.secret;
      seen.method = first.bump;
      seen.methodAgain = first.bump;
      seen.keys = Object.keys(first);
      seen.instance = first instanceof PrivateService;
      seen.raw = first;
    } });
    try {
      expect(seen).toMatchObject({ same: true, viaProp: true, value: 42, secret: 42, instance: true });
      expect(seen.method).toBe(seen.methodAgain);
      expect(seen.raw).not.toBe(mounted.service);
      await stats.flush();
    } finally { await mounted.close(); await stats.dispose(); }
    const lines = await readLines(root);
    const service = lines.find((line): line is HarnessRuntimeStatLine => line.t === "runtime" && line.kind === "service" && line.method === "bump")!;
    expect(service).toMatchObject({ plugin: "consumer", name: "svc", provider: "provider", calls: 1, errors: 0, revision: "main@3" });
    // 依赖行不再记。
    expect(lines.filter(line => line.t === "runtime").every(line => (line as HarnessRuntimeStatLine).kind === "service" || (line as HarnessRuntimeStatLine).kind === "listener")).toBe(true);
  });

  it("does not wrap the plugin's own provided service and does not break frozen services", async () => {
    const root = await tempRoot();
    const stats = new HarnessStats({ dataRoot: root, now: () => T0, flushIntervalMs: 3_600_000 });
    const frozen = Object.freeze({ nested: Object.freeze({ a: 1 }), call: () => "called" });
    const seen: any = {};
    const mounted = await mountPair(stats, { service: frozen, consumer: ctx => { seen.value = ctx.get("svc").call(); seen.nested = ctx.get("svc").nested.a; seen.json = JSON.stringify(ctx.get("svc")); } });
    try {
      expect(seen).toEqual({ value: "called", nested: 1, json: JSON.stringify({ nested: { a: 1 } }) });
    } finally { await mounted.close(); await stats.dispose(); }
  });

  it("times promise-returning methods and counts rejections and sync throws, passing the errors through", async () => {
    const root = await tempRoot();
    const stats = new HarnessStats({ dataRoot: root, now: () => T0, flushIntervalMs: 3_600_000 });
    const outcomes: string[] = [];
    const mounted = await mountPair(stats, { consumer: ctx => {
      const svc = ctx.get("svc");
      return (async () => {
        outcomes.push(await svc.later());
        await svc.later(true).catch((error: Error) => outcomes.push(error.message));
        try { svc.fail(); } catch (error) { outcomes.push((error as Error).message); }
      })();
    } });
    try {
      expect(outcomes).toEqual(["ok", "later failed", "sync failed"]);
      await stats.flush();
    } finally { await mounted.close(); await stats.dispose(); }
    const runtime = (await readLines(root)).filter((line): line is HarnessRuntimeStatLine => line.t === "runtime" && line.kind === "service");
    expect(runtime.find(line => line.method === "later")).toMatchObject({ calls: 2, errors: 1 });
    expect(runtime.find(line => line.method === "fail")).toMatchObject({ calls: 1, errors: 1 });
  });

  it("counts listener calls and errors and still throws listener errors to the emitter", async () => {
    const root = await tempRoot();
    const stats = new HarnessStats({ dataRoot: root, now: () => T0, flushIntervalMs: 3_600_000 });
    let emitter: any;
    const mounted = await mountPair(stats, { consumer: ctx => {
      emitter = ctx;
      ctx.on("test/event", (value: number) => { if (value < 0) throw new Error("listener boom"); return value * 2; });
      ctx.once("test/once", () => "once");
    } });
    try {
      const ctx = mounted.tree.context as any;
      expect(ctx.bail("test/event", 2)).toBe(4);
      expect(() => ctx.bail("test/event", -1)).toThrow("listener boom");
      expect(ctx.bail("test/once")).toBe("once");
      await stats.flush();
    } finally { await mounted.close(); await stats.dispose(); }
    expect(emitter).toBeDefined();
    const listeners = (await readLines(root)).filter((line): line is HarnessRuntimeStatLine => line.t === "runtime" && line.kind === "listener");
    expect(listeners.find(line => line.name === "test/event")).toMatchObject({ plugin: "consumer", calls: 2, errors: 1, method: "", provider: null });
    expect(listeners.find(line => line.name === "test/once")).toMatchObject({ calls: 1, errors: 0 });
  });

  it("records the inventory with sources and tool owners under the activated revision", async () => {
    const root = await tempRoot();
    const stats = new HarnessStats({ dataRoot: root, now: () => T0, flushIntervalMs: 3_600_000 });
    const runtimeService = { register: (registration: { definition: { name: string; pluginId?: string } }) => ({ name: registration.definition.name }) };
    const rootCtx = await createCordisRoot();
    const mount = stats.observeMount({ harnessId: "main", expectedRevision: 4 });
    const tree = await mountIsolatedCordisTree({ parent: rootCtx.context, sharedServices: [], observer: mount.observer, entries: [
      { id: "tools.runtime", config: {}, provides: ["tools.runtime"], injects: [], origin: "builtin", module: { apply: (ctx: any) => { ctx.provide("tools.runtime", runtimeService); } } },
      { id: "reader", config: {}, provides: [], injects: ["tools.runtime"], origin: "user", module: { inject: ["tools.runtime"], apply: (ctx: any) => { ctx.get("tools.runtime").register({ definition: { name: "read_file", pluginId: "actspace.reader" } }); } } },
    ] });
    try {
      mount.activated(9);
      await stats.flush();
    } finally { await tree.dispose(); await rootCtx.dispose(); await stats.dispose(); }
    const lines = await readLines(root);
    const inventory = lines.filter((line): line is HarnessInventoryLine => line.t === "inventory");
    expect(inventory.map(line => [line.plugin, line.source, line.revision, line.ok])).toEqual([["tools.runtime", "builtin", "main@9", true], ["reader", "user", "main@9", true]]);
    expect(inventory[0]!.provides).toEqual(["tools.runtime"]);
    expect(inventory[1]!.loadMs).toBeGreaterThanOrEqual(0);
    expect(lines.filter((line): line is HarnessToolOwnerLine => line.t === "tool-owner")).toEqual([{ v: 1, t: "tool-owner", at: new Date(T0).toISOString(), revision: "main@9", plugin: "reader", toolPluginId: "actspace.reader", tool: "read_file" }]);
  });

  it("writes load failures for a failed mount and nothing for a discarded one", async () => {
    const root = await tempRoot();
    const stats = new HarnessStats({ dataRoot: root, now: () => T0, flushIntervalMs: 3_600_000 });
    const rootCtx = await createCordisRoot();
    const failing = stats.observeMount({ harnessId: "branch", expectedRevision: 0 });
    try {
      await expect(mountIsolatedCordisTree({ parent: rootCtx.context, sharedServices: [], observer: failing.observer, entries: [
        { id: "bad", config: {}, provides: [], injects: [], origin: "evolved", module: { apply: () => { throw new Error("cannot start"); } } },
      ] })).rejects.toThrow("cannot start");
      failing.failed();
      const discarded = stats.observeMount({ harnessId: "branch", expectedRevision: 0 });
      await (await mountIsolatedCordisTree({ parent: rootCtx.context, sharedServices: [], observer: discarded.observer, entries: [
        { id: "fine", config: {}, provides: [], injects: [], module: { apply: () => undefined } },
      ] })).dispose();
      discarded.discarded();
      discarded.activated(1);
      await stats.flush();
    } finally { await rootCtx.dispose(); await stats.dispose(); }
    const lines = await readLines(root);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ t: "inventory", plugin: "bad", source: "evolved", ok: false, revision: "branch@1" });
    expect((lines[0] as HarnessInventoryLine).error).toContain("cannot start");
  });

  it("keeps data in memory after a failed flush and writes it on the next one", async () => {
    const root = await tempRoot();
    let broken = true;
    const written: string[] = [];
    const stats = new HarnessStats({ dataRoot: root, now: () => T0, flushIntervalMs: 3_600_000, fileSystem: {
      mkdir: async () => undefined,
      appendFile: async (_path, data) => { if (broken) throw new Error("EIO"); written.push(data); },
    } });
    const mounted = await mountPair(stats, { consumer: ctx => { ctx.get("svc").bump(); } });
    try {
      mounted.mount.activated(1);
      await stats.flush();
      expect(stats.writeFailures).toBe(1);
      expect(written).toEqual([]);
      const mountedAgain = await mountPair(stats, { consumer: ctx => { ctx.get("svc").bump(); } });
      await mountedAgain.close();
      broken = false;
      await stats.flush();
    } finally { await mounted.close(); await stats.dispose(); }
    const lines = written.join("").trimEnd().split("\n").map(line => JSON.parse(line) as HarnessStatsFileLine);
    expect(lines.some(line => (line as { t: string }).t === "health")).toBe(false);
    expect(lines.filter(line => line.t === "inventory").length).toBeGreaterThanOrEqual(2);
    const bump = lines.filter((line): line is HarnessRuntimeStatLine => line.t === "runtime" && line.method === "bump");
    expect(bump.reduce((sum, line) => sum + line.calls, 0)).toBe(2);
  });

  it("flushes immediately when the key limit is reached and again on dispose", async () => {
    const root = await tempRoot();
    const stats = new HarnessStats({ dataRoot: root, now: () => T0, flushIntervalMs: 3_600_000, maxKeys: 3 });
    const service = { a: () => 1, b: () => 2, c: () => 3, d: () => 4 };
    const mounted = await mountPair(stats, { service, consumer: ctx => { const svc = ctx.get("svc"); svc.a(); svc.b(); svc.c(); } });
    try {
      // Each method is one service key: the limit of 3 is hit on the third method.
      await new Promise(resolve => setTimeout(resolve, 50));
      expect((await readLines(root)).some(line => line.t === "runtime")).toBe(true);
    } finally { await mounted.close(); await stats.dispose(); }
  });

  it("keeps counting across remounts under the same recorder and attributes each mount to its own revision", async () => {
    const root = await tempRoot();
    const stats = new HarnessStats({ dataRoot: root, now: () => T0, flushIntervalMs: 3_600_000 });
    const services: any[] = [];
    const first = await mountPair(stats, { consumer: ctx => { services.push(ctx.get("svc")); } });
    first.mount.activated(1);
    const second = await mountPair(stats, { consumer: ctx => { services.push(ctx.get("svc")); } });
    second.mount.activated(2);
    services[0].bump();
    services[1].bump();
    await first.close();
    services[1].bump();
    await second.close();
    await stats.dispose();
    const bumps = (await readLines(root)).filter((line): line is HarnessRuntimeStatLine => line.t === "runtime" && line.method === "bump");
    expect(bumps.map(line => [line.revision, line.calls]).sort()).toEqual([["main@1", 1], ["main@2", 2]]);
  });

  it("ignores samples recorded after dispose", async () => {
    const root = await tempRoot();
    const stats = new HarnessStats({ dataRoot: root, now: () => T0, flushIntervalMs: 3_600_000 });
    const services: any[] = [];
    const mounted = await mountPair(stats, { consumer: ctx => { services.push(ctx.get("svc")); } });
    mounted.mount.activated(1);
    await stats.dispose();
    services[0].bump();
    await stats.flush();
    await mounted.close();
    expect((await readLines(root)).some(line => line.t === "runtime")).toBe(false);
  });
});
