import { describe, expect, it, vi } from "vitest";
import { ContextEngine, ContextInstanceRegistry, ContextSourceRegistry, ContextCompactionCoordinator } from "@actspace/context-engine";
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

it("checks complete durable tool batches before dispatching the next request, including new large outputs", async () => {
  const order: string[] = [];
  const maybeCompact = vi.fn(async (session: import("@actspace/session-persistence").SessionHandle, pressure: import("@actspace/context-engine").CompactionUsage) => {
    order.push("check");
    expect(session.journal.validation.relations.openStepId).toBeNull();
    expect(session.journal.validation.relations.openToolCallIds).toHaveLength(0);
    expect(session.journal.events.at(-1)?.type).toBe("step/end");
    expect(pressure.inputTokens + pressure.outputTokens).toBeGreaterThan(4000);
    return false;
  });
  await runToolStreamFixture({ onMessages: () => { order.push("request"); }, contextWindow: 100_000,
    execute: async () => { order.push("tool"); return { status: "completed", summary: "large", modelOutput: [{ type: "text", text: "x".repeat(20_000) }] }; },
    compaction: { maybeCompact } as unknown as CompactionPlugin,
  });
  expect(order).toEqual(["request", "tool", "check", "request", "check"]);
});

it("does not send a known oversized request after a failed Step compaction", async () => {
  let requests = 0;
  await expect(runToolStreamFixture({ contextWindow: 5000, onMessages: () => { requests++; },
    execute: async () => ({ status: "completed", summary: "large", modelOutput: [{ type: "text", text: "x".repeat(30_000) }] }),
    compaction: stubCompaction(async () => { throw new Error("cannot summarize"); }),
  })).rejects.toThrow("Context exceeds model capacity");
  expect(requests).toBe(1);
});

it("passes cancellation into compaction and does not dispatch another request", async () => {
  let loop: import("../loop.js").AgentLoop; let requests = 0;
  const maybeCompact = vi.fn(async (_session: unknown, _usage: unknown, observer?: import("@actspace/context-engine").CompactionObserver) => {
    expect(observer?.signal).toBeDefined(); loop.abort(); observer!.signal!.throwIfAborted(); return false;
  });
  const result = await runToolStreamFixture({ onLoop: value => { loop = value; }, onMessages: () => { requests++; }, compaction: { maybeCompact } as unknown as CompactionPlugin });
  expect(requests).toBe(1); expect(result.result.reason).toBe("aborted");
  expect(result.events.some(event => event.kind === "compaction-failed")).toBe(false);
});

it("commits a real compaction between Steps and publishes the refreshed Context", async () => {
  const instances = new ContextInstanceRegistry();
  const coordinator = new ContextCompactionCoordinator();
  coordinator.register({ shouldCompact: usage => usage.inputTokens > 1000,
    select: context => context.content.conversation.entries.length >= 3 ? { start: 0, end: 3 } : null,
    summarize: async () => ({ content: "Verified summary of file read" }),
  });
  const views: string[] = []; const requests: string[] = [];
  const result = await runToolStreamFixture({ contextSources: new ContextSourceRegistry(), contextWindow: 100_000,
    createContextEngine: options => new ContextEngine({ ...options, instances }),
    onMessages: messages => { requests.push(JSON.stringify(messages)); },
    execute: async () => ({ status: "completed", summary: "large", modelOutput: [{ type: "text", text: "x".repeat(8000) }] }),
    compaction: coordinator as unknown as CompactionPlugin,
    onLiveEvent: event => {
      if (event.kind === "run-state" && event.message === "context-updated") views.push(JSON.stringify(instances.get("tool-stream-test", "main:test")?.view.content.conversation));
    },
  });
  expect(result.journal.filter(event => event.type === "surface/replaced")).toHaveLength(1);
  expect(requests[1]).toContain("Verified summary of file read");
  expect(requests[1]).not.toContain("x".repeat(100));
  expect(views).toHaveLength(3); // Step result, compacted view, final reply.
  expect(views[0]).toContain("x".repeat(100));
  expect(views[1]).toContain("Verified summary of file read");
  expect(views[1]).not.toContain("x".repeat(100));
  const events = result.journal.map(event => event.type);
  expect(events.indexOf("compaction/start")).toBeGreaterThan(events.indexOf("step/end"));
});
