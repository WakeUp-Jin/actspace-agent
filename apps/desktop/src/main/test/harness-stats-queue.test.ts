// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { HarnessStatsQueryInput, HarnessStatsQueryKind } from "@actspace/shared";
import { HARNESS_STATS_QUERY_KINDS } from "@actspace/shared";

// 假 Worker：harness-query 先挂起，直到测试放行；其他消息立即回复。
const gate = vi.hoisted(() => ({ held: [] as (() => void)[], release() { for (const resolve = this.held.splice(0); resolve.length;) resolve.shift()!(); } }));
vi.mock("node:worker_threads", () => {
  class FakeWorker {
    #listeners: ((reply: unknown) => void)[] = [];
    on(name: string, listener: (reply: unknown) => void) { if (name === "message") this.#listeners.push(listener); return this; }
    postMessage(message: { id: string; type: string; input?: HarnessStatsQueryInput }) {
      const reply = (result: unknown) => queueMicrotask(() => { for (const listener of this.#listeners) listener({ id: message.id, ok: true, result }); });
      if (message.type === "harness-query") gate.held.push(() => reply({ data: { kind: message.input!.kind, value: {} }, fingerprint: "f" }));
      else reply({ revision: null, fingerprint: "f" });
    }
    terminate() { return Promise.resolve(0); }
  }
  return { Worker: FakeWorker };
});

const { UsageReadModelService } = await import("../runtime-v2/usage-read-model");

const FILTER = { range: "month", sessionKind: "main" } as const;
const reader = { globalSessionSummaries: async () => [], inspectSession: async () => { throw new Error("unused"); }, inspectSessionEvents: async () => [] };
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function batch(service: InstanceType<typeof UsageReadModelService>, prefix: string) {
  return HARNESS_STATS_QUERY_KINDS.map((kind: HarnessStatsQueryKind) => {
    const requestId = `${prefix}-${kind}`;
    return { requestId, promise: service.queryHarnessStats({ requestId, kind, filter: FILTER }).then((result) => ({ ok: true as const, result }), (error: Error) => ({ ok: false as const, error: error.message })) };
  });
}

describe("Harness 统计查询队列", () => {
  it("取消的查询不占名额：打开页面 → 取消 7 块 → 再查 7 块，第二批全部成功", async () => {
    const service = new UsageReadModelService(reader as never, "/nonexistent-harness-queue-test");
    // 开发模式 StrictMode：挂载、卸载（取消）、再挂载。
    const first = batch(service, "a");
    for (const item of first) service.cancelHarnessStats(item.requestId);
    const second = batch(service, "b");
    for (let i = 0; i < 40; i += 1) { gate.release(); await settle(); }
    const results = await Promise.all(second.map((item) => item.promise));
    expect(results.filter((item) => !item.ok)).toEqual([]);
    expect(results.map((item) => item.ok && item.result.kind)).toEqual([...HARNESS_STATS_QUERY_KINDS]);
    await Promise.all(first.map((item) => item.promise));
    await service.dispose();
  });

  it("没取消的查询仍有上限：同时 9 个，第 9 个被拒", async () => {
    const service = new UsageReadModelService(reader as never, "/nonexistent-harness-queue-test");
    const pending = Array.from({ length: 9 }, (_, index) => service.queryHarnessStats({ requestId: `c-${index}`, kind: "overview", filter: FILTER }).then(() => "ok", (error: Error) => error.message));
    for (let i = 0; i < 40; i += 1) { gate.release(); await settle(); }
    const results = await Promise.all(pending);
    expect(results.filter((item) => item !== "ok")).toEqual(["Harness stats queue is full; retry shortly."]);
    await service.dispose();
  });
});
