// @vitest-environment node
import { beforeAll, expect, it, vi } from "vitest";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { UsageActivitySnapshot } from "@actspace/shared";

// worker 脚本在导入时读取 workerData 并向 parentPort 注册监听；这里替换成可直接驱动的假实现。
const port = vi.hoisted(() => ({ listener: undefined as undefined | ((message: unknown) => void), replies: new Map<string, (value: { ok: boolean; result?: unknown; error?: string }) => void>(), seq: 0 }));
vi.mock("node:worker_threads", () => ({
  workerData: { dataRoot: "/nonexistent-usage-read-model-test" },
  parentPort: {
    on: (_name: string, listener: (message: unknown) => void) => { port.listener = listener; },
    postMessage: (message: { id: string; ok?: boolean; result?: unknown; error?: string }) => { if (message.ok !== undefined) port.replies.get(message.id)?.({ ok: message.ok, result: message.result, error: message.error }); },
  },
}));

const TIME = "2026-08-23T00:00:00.000Z";
function event(seq: number, type: string, data: unknown): SessionEventEnvelopeV1 {
  return { recordKind: "event", seq, type, eventVersion: 1, criticality: "required", time: TIME, source: { ownerPluginId: "@actspace/core" }, data, surface: null, provenance: { sourceEventSeqs: [], contributorIds: [] } } as unknown as SessionEventEnvelopeV1;
}
function send<T>(message: Record<string, unknown>): Promise<T> {
  const id = `m${port.seq++}`;
  return new Promise((resolve, reject) => {
    port.replies.set(id, (reply) => reply.ok ? resolve(reply.result as T) : reject(new Error(reply.error)));
    port.listener!({ id, ...message });
  });
}

beforeAll(async () => { await import("../runtime-v2/usage-read-model-worker"); });

it("keeps running requests and token-less failures out of the unknown counts", async () => {
  const header = (n: number, requestId: string) => event(n, "request/header", { requestId, turnId: "t", stepId: `s-${requestId}`, model: "custom-model", routeId: "custom" });
  const priced = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cost: 1, costCurrency: "USD", source: "provider-reported" };
  const journal = [
    header(0, "running"), // 中断残留，永远停在 running
    header(1, "failed"), event(2, "assistant/message", { requestId: "failed", finishReason: "failed" }), // 失败且没有 token
    header(3, "unpriced"), event(4, "assistant/message", { requestId: "unpriced", finishReason: "stop", usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cost: null, costCurrency: null, costProvenance: { version: 1, basis: "unknown", reason: "model-price-unavailable", pricingSnapshot: null } } }), // 有 token 但没有定价
    header(5, "known"), event(6, "assistant/message", { requestId: "known", finishReason: "stop", usage: priced }),
  ];
  await send({ type: "fallback-begin" });
  await send({ type: "fallback-append", source: { sessionId: "s", title: "S", throughJournalSeq: 6, workspaceRoot: null }, events: journal });
  const result = await send<UsageActivitySnapshot>({ type: "fallback-query", request: "activity", input: { scope: "global", range: "total", requestRowsPage: { page: 1 } } });

  expect(result.summary.requestCount).toBe(4);
  expect(result.summary.runningCount).toBe(1);
  // 只有真正失败（无 usage）的那一次算缺少用量；running 不算。
  expect(result.summary.unknownTokenRequestCounts).toMatchObject({ input: 1, output: 1, total: 1 });
  expect(result.costSummary).toMatchObject({ knownCostRequestCount: 1, unknownCostRequestCount: 1 });
  expect(result.summary.costUnavailableCount).toBe(1);
  const model = result.aggregates!.models[0]!;
  expect(model.unknownTokenRequestCount).toBe(1);
  expect(model.costSummary.unknownCostRequestCount).toBe(1);
});
