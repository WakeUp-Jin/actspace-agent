import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeStreamEvent } from "@actspace/shared";
import type { AgentLiveEvent } from "@actspace/shared/runtime-v2";
import { FixedRendererStreamAdapter } from "../live/stream-adapter.js";

const ids = { sessionId: "s", agentRunId: "run", turnId: "turn", stepId: "step", requestId: "req", messageId: "msg" };
const delta = (kind: "assistant-delta" | "reasoning-delta", message: string, overrides: Partial<typeof ids> = {}) =>
  ({ ...ids, ...overrides, kind, message }) as unknown as AgentLiveEvent;
const runState = (message: string) => ({ ...ids, kind: "run-state", message }) as unknown as AgentLiveEvent;

function collect(coalesceMs: number) {
  const adapter = new FixedRendererStreamAdapter(() => undefined, coalesceMs);
  const events: RuntimeStreamEvent[] = [];
  adapter.subscribe((event) => events.push(event));
  return { adapter, events };
}

describe("stream adapter delta coalescing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits every delta immediately by default", () => {
    const { adapter, events } = collect(0);
    for (const text of ["a", "b", "c"]) adapter.accept(delta("assistant-delta", text));
    expect(events.map((event) => event.type)).toEqual(Array(3).fill("assistant_text_delta"));
  });

  it("merges consecutive deltas of one message into one event per window, text intact and in order", () => {
    const { adapter, events } = collect(33);
    for (let index = 0; index < 100; index++) adapter.accept(delta("assistant-delta", `${index},`));
    expect(events).toHaveLength(0);
    vi.advanceTimersByTime(33);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "assistant_text_delta", messageId: "msg", llmCallId: "req" });
    expect((events[0] as { delta: string }).delta).toBe(
      Array.from({ length: 100 }, (_, index) => `${index},`).join(""),
    );
    adapter.accept(delta("assistant-delta", "tail"));
    vi.advanceTimersByTime(33);
    expect(events).toHaveLength(2);
  });

  it("keeps text and reasoning apart and never reorders them", () => {
    const { adapter, events } = collect(33);
    adapter.accept(delta("reasoning-delta", "think "));
    adapter.accept(delta("reasoning-delta", "more"));
    adapter.accept(delta("assistant-delta", "answer"));
    adapter.accept(delta("reasoning-delta", "again"));
    vi.advanceTimersByTime(33);
    expect(events.map((event) => [event.type, (event as { delta: string }).delta])).toEqual([
      ["assistant_thinking_delta", "think more"],
      ["assistant_text_delta", "answer"],
      ["assistant_thinking_delta", "again"],
    ]);
  });

  it("does not merge across messages or runs", () => {
    const { adapter, events } = collect(33);
    adapter.accept(delta("assistant-delta", "a", { messageId: "m1" }));
    adapter.accept(delta("assistant-delta", "b", { messageId: "m2" }));
    adapter.accept(delta("assistant-delta", "c", { agentRunId: "other" }));
    vi.advanceTimersByTime(33);
    expect(events.map((event) => (event as { delta: string }).delta)).toEqual(["a", "b", "c"]);
  });

  it("flushes pending text before any other event, so a tool or run boundary never overtakes it", () => {
    const { adapter, events } = collect(33);
    adapter.accept(delta("assistant-delta", "before "));
    adapter.accept(delta("assistant-delta", "tool"));
    adapter.accept({
      ...ids,
      kind: "tool-prepared",
      callId: "c",
      name: "read_file",
      arguments: { path: "a" },
    } as unknown as AgentLiveEvent);
    expect(events.map((event) => event.type)).toEqual(["assistant_text_delta", "tool_call_streaming"]);
    expect((events[0] as { delta: string }).delta).toBe("before tool");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("flushes on run end, abort, clearTransient and dispose", () => {
    for (const end of ["completed", "failed", "aborted", "step-limit"]) {
      const { adapter, events } = collect(33);
      adapter.accept(delta("assistant-delta", "x"));
      adapter.accept(runState(end));
      expect(events[0]).toMatchObject({ type: "assistant_text_delta", delta: "x" });
      expect(events.length).toBeGreaterThan(1);
      adapter.dispose();
    }
    const cleared = collect(33);
    cleared.adapter.accept(delta("assistant-delta", "y"));
    cleared.adapter.clearTransient();
    expect(cleared.events).toHaveLength(1);
    const disposed = collect(33);
    disposed.adapter.accept(delta("assistant-delta", "z"));
    disposed.adapter.dispose();
    expect(disposed.events).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(disposed.events).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a listener that throws does not lose the rest of the batch", () => {
    const adapter = new FixedRendererStreamAdapter(() => undefined, 33);
    const seen: string[] = [];
    adapter.subscribe(() => {
      throw new Error("observer");
    });
    adapter.subscribe((event) => seen.push((event as { delta: string }).delta));
    adapter.accept(delta("assistant-delta", "a"));
    adapter.accept(delta("assistant-delta", "b"));
    vi.advanceTimersByTime(33);
    expect(seen).toEqual(["ab"]);
  });
});
