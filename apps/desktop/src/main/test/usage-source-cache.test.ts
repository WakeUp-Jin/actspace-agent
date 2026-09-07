// @vitest-environment node
import { expect, it, vi } from "vitest";
import type { RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";
import { UsageSourceCache } from "../runtime-v2/usage-source-cache";

it("coalesces source reads until a durable notification, and retries rejected reads", async () => {
  const reader = { listSessions: vi.fn(async () => [{ sessionId: "s" }]), inspectSession: vi.fn(async () => ({ sessionId: "s", throughJournalSeq: -1 } as RuntimeV2SessionSnapshot)), inspectSessionEvents: vi.fn(async () => []) };
  const cache = new UsageSourceCache(reader);
  const [first, second] = await Promise.all([cache.read(), cache.read()]);
  expect(first).toBe(second); await cache.read();
  expect(reader.listSessions).toHaveBeenCalledTimes(1); expect(reader.inspectSessionEvents).toHaveBeenCalledTimes(1);
  cache.invalidate(); await cache.read(); expect(reader.inspectSessionEvents).toHaveBeenCalledTimes(2);
  cache.invalidate(); reader.listSessions.mockRejectedValueOnce(new Error("read failed"));
  await expect(cache.read()).rejects.toThrow("read failed"); await cache.read();
  expect(reader.listSessions).toHaveBeenCalledTimes(4);
});
