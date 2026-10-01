import { describe, expect, it } from "vitest";
import type { CompactionPlugin } from "@actspace/compaction";
import { EMPTY_LLM_USAGE } from "@actspace/llm-service";
import { runToolStreamFixture } from "../testing.js";

const usage = { ...EMPTY_LLM_USAGE, inputTokens: 90_000, outputTokens: 1_000 };

function stubCompaction(run: (onStarted: () => void) => Promise<boolean>): CompactionPlugin {
  return { maybeCompact: async (_session: unknown, _usage: unknown, observer?: { onStarted?: (info: { entryCount: number }) => void }) => run(() => observer?.onStarted?.({ entryCount: 3 })) } as unknown as CompactionPlugin;
}

describe("auto compaction live events", () => {
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
