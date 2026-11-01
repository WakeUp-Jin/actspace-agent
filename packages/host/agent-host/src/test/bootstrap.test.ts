import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { bootstrapHost } from "../bootstrap.js";
import { HostAdmin, requestHostAdmin } from "../admin.js";
import { HostAuth } from "../auth.js";
import { HostUploads } from "../uploads.js";
import { HostGateway } from "../server.js";
import type { HostRuntime } from "../lifecycle.js";
import type { HostConfig } from "../config.js";
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function config(): Promise<HostConfig> {
  const root = await mkdtemp(join(tmpdir(), "host-bootstrap-")); roots.push(root);
  return { schemaVersion: 1, dataRoot: root, listen: { address: "127.0.0.1", port: 0 }, allowedOrigins: [], workspaces: [{ id: "main", name: "Main", path: root }], providers: [], defaultModel: "mock" };
}
function runtime() {
  const stopTasks = vi.fn(), stopProjection = vi.fn();
  const r: HostRuntime = { application: { listSessions: async () => [], subscribeSessionProjection: () => stopProjection } as unknown as HostRuntime["application"], beginDrain: vi.fn(), waitForOwnedRuns: async () => {}, backgroundTask: async () => false, activeSubagents: () => 0, recovery: () => ({ blocked: "", instances: [{}] }), subscribeTasks: () => stopTasks, shutdown: vi.fn(async () => {}) };
  return { r, stopTasks, stopProjection };
}
it.each(["auth", "uploads", "runtime", "subscription", "pins", "listen"])("cleans acquired resources when %s startup fails", async stage => {
  const cfg = await config(), { r, stopTasks, stopProjection } = runtime();
  const failure = new Error(`${stage} failure`);
  const close = vi.spyOn(HostGateway.prototype, "close");
  if (stage === "auth") vi.spyOn(HostAuth.prototype, "open").mockRejectedValue(failure);
  if (stage === "uploads") vi.spyOn(HostUploads.prototype, "cleanup").mockRejectedValue(failure);
  if (stage === "subscription") vi.spyOn(r.application, "subscribeSessionProjection").mockImplementation(() => { throw failure; });
  if (stage === "pins") vi.spyOn(HostUploads.prototype, "reconcilePins").mockRejectedValue(failure);
  if (stage === "listen") vi.spyOn(HostGateway.prototype, "listen").mockRejectedValue(failure);
  await expect(bootstrapHost(cfg, { log: () => {}, bootRuntime: async () => { if (stage === "runtime") throw failure; return r; } })).rejects.toBe(failure);
  if (["subscription", "pins", "listen"].includes(stage)) {
    expect(r.shutdown).toHaveBeenCalledTimes(1);
    expect(stopTasks).toHaveBeenCalledTimes(1);
  }
  if (["pins", "listen"].includes(stage)) expect(stopProjection).toHaveBeenCalledTimes(1);
  if (!["auth", "uploads"].includes(stage)) expect(close).toHaveBeenCalledTimes(1);
  const next = new HostAdmin(cfg.dataRoot, async () => ({}));
  await next.open(); await next.close();
});
it("keeps the original startup error when Runtime cleanup also fails", async () => {
  const cfg = await config(), { r } = runtime();
  const failure = new Error("listen"), cleanup = new Error("cleanup");
  vi.spyOn(HostGateway.prototype, "listen").mockRejectedValue(failure);
  r.shutdown = vi.fn(async () => { throw cleanup; });
  await expect(bootstrapHost(cfg, { log: () => {}, bootRuntime: async () => r })).rejects.toMatchObject({ cause: failure, errors: [failure, { errors: [cleanup] }] });
});
it("serves maintenance diagnostics and releases subscriptions and locks on stop", async () => {
  const cfg = await config(), { r, stopTasks, stopProjection } = runtime();
  const host = await bootstrapHost(cfg, { log: () => {}, bootRuntime: async () => r });
  expect(host.port).toBeGreaterThan(0);
  try {
    expect(await requestHostAdmin(cfg.dataRoot, "status")).toMatchObject({ state: "ready", waiting: [], diagnostics: [] });
  } finally { await host.stop(); }
  await host.stop();
  expect(r.shutdown).toHaveBeenCalledTimes(1);
  expect(stopTasks).toHaveBeenCalledTimes(1);
  expect(stopProjection).toHaveBeenCalledTimes(1);
  const next = new HostAdmin(cfg.dataRoot, async () => ({})); await next.open(); await next.close();
});
it("publishes Session run activity on the host topic and in the host.observe snapshot", async () => {
  const cfg = await config(), { r } = runtime();
  let tasks: ((snapshot: unknown) => void) | undefined;
  r.subscribeTasks = listener => { tasks = listener as (snapshot: unknown) => void; return () => {}; };
  const host = await bootstrapHost(cfg, { log: () => {}, bootRuntime: async () => r });
  const { default: WebSocket } = await import("ws");
  const ws = new WebSocket(`ws://127.0.0.1:${host.port}/rpc`);
  try {
    await new Promise<void>((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
    const events: any[] = [];
    let id = 0;
    const call = (method: string, params: unknown = {}) => new Promise<any>(resolve => {
      const current = ++id;
      const listener = (data: Buffer) => { const reply = JSON.parse(data.toString()); if (reply.id === current) { ws.off("message", listener); resolve(reply.result); } };
      ws.on("message", listener); ws.send(JSON.stringify({ jsonrpc: "2.0", id: current, method, params }));
    });
    let subscriptionId = "";
    ws.on("message", (data: Buffer) => { const item = JSON.parse(data.toString()); if (item.method === "host.event" && item.params.subscriptionId === subscriptionId) events.push(item.params.value); });
    await call("host.hello", { protocol: "actspace-host/1" });
    await call("auth.pair", { code: (await host.auth.createPairCode()).code, name: "web" });
    const observed = await call("host.observe");
    subscriptionId = observed.subscriptionId;
    expect(observed.snapshot.running).toEqual([]);
    const snapshot = (state: string) => ({ sessionId: "s1", revision: 1, paused: false, tasks: [], queue: [], runs: [{ runId: "r1", taskId: "t1", harness: {}, configuration: {}, state, result: null }] });
    tasks!(snapshot("running")); tasks!(snapshot("running"));
    expect((await call("host.observe")).snapshot.running).toEqual(["s1"]);
    tasks!(snapshot("completed"));
    await vi.waitFor(() => expect(events.filter(value => value.kind === "activity")).toEqual([
      { kind: "activity", sessionId: "s1", running: true }, { kind: "activity", sessionId: "s1", running: false },
    ]));
  } finally { ws.close(); await host.stop(); }
});
