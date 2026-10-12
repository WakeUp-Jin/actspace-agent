import { describe, expect, it, vi } from "vitest";
import type { CompactionPlugin } from "@actspace/context-compaction";
import { EMPTY_LLM_USAGE } from "@actspace/llm-service";
import { runToolStreamFixture } from "../testing.js";

const usage = { ...EMPTY_LLM_USAGE, inputTokens: 90_000, outputTokens: 1_000 };

function stubCompaction(run: (onStarted: () => void) => Promise<boolean>): CompactionPlugin {
  return { maybeCompact: async (_session: unknown, _usage: unknown, observer?: { onStarted?: (info: { entryCount: number }) => void }) => run(() => observer?.onStarted?.({ entryCount: 3 })) } as unknown as CompactionPlugin;
}

describe("auto compaction live events", () => {
  it("passes actual capacity and disjoint cache usage exactly once", async () => {
    const maybeCompact = vi.fn(async (_session: unknown, _usage: unknown) => false);
    await runToolStreamFixture({ terminalOnly: true, contextWindow: 256_000,
      usage: { ...usage, inputTokens: 100, cacheReadTokens: 200, cacheWriteTokens: 300, outputTokens: 50, reasoningTokens: 40 },
      compaction: { maybeCompact } as unknown as CompactionPlugin,
    });
    expect(maybeCompact.mock.calls[0]?.[1]).toEqual({ inputTokens: 600, outputTokens: 50, contextWindow: 256_000 });
  });
  it("reports start and finish before the run completes", async () => {
    const { events, result } = await runToolStreamFixture({
      terminalOnly: true, usage,
      compaction: stubCompaction(async (onStarted) => { onStarted(); return true; }),
    });
    const kinds = events.map((event) => event.kind === "run-state" ? `run-state:${event.message}` : event.kind);
    expect(kinds.slice(-3)).toEqual(["compaction-started", "compaction-finished", "run-state:completed"]);
    expect(events.find((event) => event.kind === "compaction-finished")).toMatchObject({ removedCount: 3, agentRunId: "run-test" });
    expect(result.reason).toBe("completed");
  });

  it("stays silent when no compaction is needed", async () => {
    const { events } = await runToolStreamFixture({ terminalOnly: true, usage, compaction: stubCompaction(async () => false) });
    expect(events.some((event) => event.kind.startsWith("compaction-"))).toBe(false);
  });

  it("reports a failed compaction without failing the settled turn", async () => {
    const { events, result } = await runToolStreamFixture({
      terminalOnly: true, usage,
      compaction: stubCompaction(async (onStarted) => { onStarted(); throw new Error("summary request timed out"); }),
    });
    expect(events.find((event) => event.kind === "compaction-failed")).toMatchObject({ message: "summary request timed out" });
    expect(events.at(-1)).toMatchObject({ kind: "run-state", message: "completed" });
    expect(result.reason).toBe("completed");
  });
});
