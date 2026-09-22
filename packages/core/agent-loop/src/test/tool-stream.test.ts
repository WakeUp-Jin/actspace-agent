import { describe, expect, it } from "vitest";
import { createCordisRoot } from "@actspace/cordis-adapter";
import { runToolStreamFixture } from "../testing.js";

describe("AgentLoop tool live events", () => {
  it("reserves the last subagent step for a tool-free summary and preserves lineage", async () => {
    const tools: string[][] = [];
    const messages: string[] = [];
    const { events, result, journal } = await runToolStreamFixture({ subagent: true,
      onTools: (definitions) => tools.push(definitions.map((tool) => tool.name)),
      onMessages: (values) => messages.push(JSON.stringify(values)),
    });
    expect(tools).toEqual([["read_file"], []]);
    expect(messages.at(-1)).toContain("Execution budget reached");
    expect(result).toMatchObject({ reason: "step-limit", steps: 2, finalText: expect.stringContaining("Done.") });
    expect(events.every((event) => event.parentSessionId === "parent" && event.parentCallId === "delegate")).toBe(true);
    expect(journal.at(-1)).toMatchObject({ type: "turn/end", data: { reason: "step-limit" } });
  });
  it.each([true, false])("separates arguments and emits each tool lifecycle (deltas=%s)", async (deltas) => {
    const { events, journal } = await runToolStreamFixture({ deltas });
    expect(events.filter((e) => e.kind === "assistant-delta").map((e) => e.message).join("")).toBe('Read now. Done. {"valid":"body JSON"}');
    expect(events.filter((e) => ["tool-prepared", "tool-started", "tool-finished"].includes(e.kind)).map((e) => e.kind)).toEqual(["tool-prepared", "tool-started", "tool-finished"]);
    const finished = events.find((e) => e.kind === "tool-finished")!;
    expect(finished).toMatchObject({ callId: "read-1", result: { status: "completed" } });
    expect(journal.find((e) => e.type === "request/header")?.data).toMatchObject({ requestId: finished.requestId });
    expect(events.findIndex((e) => e.kind === "tool-finished")).toBeLessThan(events.findIndex((e) => e.kind === "assistant-delta" && e.message.startsWith("Done.")));
  });

  it("finishes invalid arguments without claiming execution started", async () => {
    const { events } = await runToolStreamFixture({ args: '{"unexpected":true}' });
    expect(events.some((e) => e.kind === "tool-started")).toBe(false);
    expect(events.find((e) => e.kind === "tool-finished")).toMatchObject({ result: { status: "failed" } });
  });

  it("finishes denied calls without executing them", async () => {
    const { events } = await runToolStreamFixture({ policies: [{ id: "deny", layer: 0, order: 0, evaluate: () => ({ kind: "deny", reason: "Fixture policy denied", code: "POLICY_DENIED" }) }], execute: async () => { throw new Error("must not execute"); } });
    expect(events.some((e) => e.kind === "tool-started")).toBe(false);
    expect(events.find((e) => e.kind === "tool-finished")).toMatchObject({ result: { status: "denied" } });
  });

  it("isolates failing live observers from tool execution", async () => {
    const { events, result } = await runToolStreamFixture({ onLiveEvent: () => { throw new Error("observer failure"); } });
    expect(result.reason).toBe("completed");
    expect(events.filter((e) => e.kind === "tool-finished")).toHaveLength(1);
  });

  it("emits required durability checkpoints at each real side-effect boundary", async () => {
    const reasons: string[] = [];
    const context = {
      parallel: async (type: string, payload: unknown) => {
        if (type === "session/checkpoint") reasons.push(String((payload as { reason?: string }).reason));
      },
    };
    await runToolStreamFixture({ context });
    expect(reasons).toEqual([
      "before-llm-dispatch",
      "before-tool-body",
      "before-next-step",
      "before-llm-dispatch",
      "before-next-step",
      "after-turn-settled",
    ]);
  });

  it("does not dispatch the model when the required checkpoint handler is missing", async () => {
    const root = await createCordisRoot();
    let requests = 0;
    try {
      await expect(runToolStreamFixture({ context: root.context, onRequest: () => { requests += 1; } })).rejects.toThrow();
      expect(requests).toBe(0);
    } finally { await root.dispose(); }
  });
});

it("passes reasoning settings to every request in a tool turn", async () => {
  const observed: unknown[] = [];
  await runToolStreamFixture({ thinkingEnabled: true, reasoningEffort: "max", onRequest: (options) => observed.push(options) });
  expect(observed).toHaveLength(2);
  expect(observed).toEqual([expect.objectContaining({ reasoning: true, reasoningEffort: "max" }), expect.objectContaining({ reasoning: true, reasoningEffort: "max" })]);
});
