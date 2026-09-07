import { describe, expect, it } from "vitest";
import { runToolStreamFixture } from "./tool-stream-fixture.js";

describe("AgentLoop tool live events", () => {
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
});

it("passes reasoning settings to every request in a tool turn", async () => {
  const observed: unknown[] = [];
  await runToolStreamFixture({ thinkingEnabled: true, reasoningEffort: "max", onRequest: (options) => observed.push(options) });
  expect(observed).toHaveLength(2);
  expect(observed).toEqual([expect.objectContaining({ reasoning: true, reasoningEffort: "max" }), expect.objectContaining({ reasoning: true, reasoningEffort: "max" })]);
});
