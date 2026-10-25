// @vitest-environment node
import { expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { UsageSourceCache } from "../runtime-v2/usage-source-cache";

it("coalesces source reads until a durable notification, and retries rejected reads", async () => {
  const root = await mkdtemp(join(tmpdir(), "usage-source-cache-"));
  const reader = { globalSessionSummaries: vi.fn(async () => [{ sessionId: "s", throughJournalSeq: -1, summaryVersion: 1, createdAt: "2026-09-22T00:00:00Z", updatedAt: "2026-09-22T00:00:00Z", workspaceRoot: null, profileId: "test", title: "s", pinned: false, archived: false, completedTurnCount: 0, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: null }, accessState: "read-write" as const, lineage: null }]), inspectSession: vi.fn(async () => ({ sessionId: "s", throughJournalSeq: -1, metadata: { title: "s" }, messages: [], tools: [] } as unknown as RuntimeV2SessionSnapshot)), inspectSessionEvents: vi.fn(async () => []) };
  const cache = new UsageSourceCache(reader, root);
  const [first, second] = await Promise.all([cache.read(), cache.read()]);
  expect(first).toBe(second); await cache.read();
  expect(reader.globalSessionSummaries).toHaveBeenCalledTimes(1); expect(reader.inspectSessionEvents).toHaveBeenCalledTimes(1);
  cache.invalidate(); await cache.read(); expect(reader.inspectSessionEvents).toHaveBeenCalledTimes(1);
  cache.invalidate(); reader.globalSessionSummaries.mockRejectedValueOnce(new Error("read failed"));
  await expect(cache.read()).rejects.toThrow("read failed"); await cache.read();
  expect(reader.globalSessionSummaries).toHaveBeenCalledTimes(4);
  await rm(root, { recursive: true, force: true });
});

it("uses the Journal-derived revision when the Global Index lags, and skips only a Session whose Journal is short", async () => {
  const root = await mkdtemp(join(tmpdir(), "usage-source-cache-"));
  const summary = (sessionId: string) => ({ sessionId, throughJournalSeq: -1, summaryVersion: 1 as const, createdAt: "2026-09-22T00:00:00Z", updatedAt: "2026-09-22T00:00:00Z", workspaceRoot: null, profileId: "test", title: sessionId, pinned: false, archived: false, completedTurnCount: 0, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: null }, accessState: "read-write" as const, lineage: null });
  const endSeed = { seq: 0, type: "session/end-seed", data: {} } as unknown as SessionEventEnvelopeV1;
  const reader = {
    globalSessionSummaries: vi.fn(async () => [summary("lagging"), summary("short")]),
    inspectSession: vi.fn(async (sessionId: string) => ({ sessionId, throughJournalSeq: 0, metadata: { title: sessionId }, messages: [], tools: [] } as unknown as RuntimeV2SessionSnapshot)),
    inspectSessionEvents: vi.fn(async (sessionId: string) => sessionId === "lagging" ? [endSeed] : []),
  };
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const sources = await new UsageSourceCache(reader, root).read();
  expect(sources.map(source => [source.sessionId, source.throughJournalSeq])).toEqual([["lagging", 0]]);
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
  await rm(root, { recursive: true, force: true });
});

for (const legacy of [false, true]) it(`preserves historical usage with ${legacy ? "a legacy filtered cache" : "no reset file"}`, async () => {
  const root = await mkdtemp(join(tmpdir(), "usage-source-cache-"));
  const events = [
    { seq: 0, type: "turn/start", data: { turnId: "t", agentRunId: "run" } },
    { seq: 1, type: "request/header", data: { requestId: "r", turnId: "t", stepId: "step", model: "model" } },
    { seq: 2, type: "assistant/message", data: { requestId: "r", finishReason: "stop", usage: { inputTokens: 10, outputTokens: 2 } } },
  ].map(event => ({ ...event, time: "2026-09-22T00:00:00Z", surface: null })) as SessionEventEnvelopeV1[];
  if (legacy) {
    await writeFile(join(root, "global-usage-index.json"), JSON.stringify({ version: 1, sources: [{ sessionId: "s", title: "s", throughJournalSeq: 2, rows: [] }] }));
    await writeFile(join(root, "global-usage-reset.json"), JSON.stringify({ version: 1, resetAt: "2099-01-01T00:00:00Z" }));
  }
  const reader = {
    globalSessionSummaries: vi.fn(async () => [{ sessionId: "s", throughJournalSeq: 2, summaryVersion: 1, createdAt: "2026-09-22T00:00:00Z", updatedAt: "2026-09-22T00:00:00Z", workspaceRoot: null, profileId: "test", title: "s", pinned: false, archived: false, completedTurnCount: 0, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: null }, accessState: "read-write" as const, lineage: null }]),
    inspectSession: vi.fn(async () => ({ sessionId: "s", throughJournalSeq: 2, metadata: { title: "s" }, messages: [], tools: [] } as unknown as RuntimeV2SessionSnapshot)),
    inspectSessionEvents: vi.fn(async () => events),
  };
  try {
    const cache = new UsageSourceCache(reader, root);
    const sources = await cache.read();
    expect(sources[0]?.rows).toHaveLength(1);
    expect(sources[0]?.rows[0]?.tokens.totalTokens).toBe(12);
    if (!legacy) await expect(readFile(join(root, "global-usage-reset.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(JSON.parse(await readFile(join(root, "global-usage-index.json"), "utf8")).version).toBe(3);
    expect(await new UsageSourceCache(reader, root).read()).toEqual(sources);
    expect(reader.inspectSessionEvents).toHaveBeenCalledTimes(1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("replays a current-revision v2 cache that omitted auxiliary requests, then reuses the repaired cache", async () => {
  const root = await mkdtemp(join(tmpdir(), "usage-source-cache-"));
  const data = { sessionId: "s", agentRunId: "run", turnId: "t", stepId: "step", callId: "image", logicalRequestId: "vision", attemptId: "vision-1", attempt: 1, purpose: "image-inspection", routeId: "vision-route", model: "vision-model", startedAt: "2026-10-11T00:00:00Z" };
  const events = [
    { seq: 0, type: "llm/auxiliary-start", data },
    { seq: 1, type: "llm/auxiliary-end", data: { ...data, status: "completed", finishedAt: "2026-10-11T00:00:01Z", usage: { inputTokens: 90, outputTokens: 10, cacheReadTokens: 20 } } },
  ].map(event => ({ ...event, time: "2026-10-11T00:00:00Z", surface: null })) as SessionEventEnvelopeV1[];
  const reader = {
    globalSessionSummaries: vi.fn(async () => [{ sessionId: "s", throughJournalSeq: 1, title: "s" }] as never),
    inspectSession: vi.fn(async () => ({ sessionId: "s", throughJournalSeq: 1, metadata: { title: "s" } } as RuntimeV2SessionSnapshot)),
    inspectSessionEvents: vi.fn(async () => events),
  };
  try {
    await writeFile(join(root, "global-usage-index.json"), JSON.stringify({ version: 2, sources: [{ sessionId: "s", title: "s", throughJournalSeq: 1, rows: [] }] }));
    const sources = await new UsageSourceCache(reader, root).read();
    expect(sources[0]?.rows).toHaveLength(1);
    expect(sources[0]?.rows[0]).toMatchObject({ requestId: "vision-1", tokens: { totalTokens: 120 } });
    expect(JSON.parse(await readFile(join(root, "global-usage-index.json"), "utf8")).version).toBe(3);
    expect(await new UsageSourceCache(reader, root).read()).toEqual(sources);
    expect(reader.inspectSessionEvents).toHaveBeenCalledTimes(1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
