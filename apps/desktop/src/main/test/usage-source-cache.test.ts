// @vitest-environment node
import { expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
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
