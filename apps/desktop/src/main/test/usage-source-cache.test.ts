// @vitest-environment node
import { expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";
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
