// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { RuntimeStreamEvent } from "@actspace/shared";
import { runToolStreamFixture } from "../../../../../packages/core/agent-loop/src/test/tool-stream-fixture";
import { projectSessionSnapshot } from "../../../../../packages/runtime/dist/projection/durable-session.js";
import { projectFixedRendererEvents } from "../runtime-v2/fixed-renderer-projection";
import { FixedRendererStreamAdapter } from "../runtime-v2/fixed-renderer-stream-adapter";

const ids = { sessionId: "session", agentRunId: "run", turnId: "turn", stepId: "step", requestId: "request", messageId: "message" };

describe("real AgentLoop to fixed renderer stream", () => {
  it.each([true, false])("renders tools before the final reply and matches durable previews (deltas=%s)", async (deltas) => {
    const adapter = new FixedRendererStreamAdapter();
    const events: RuntimeStreamEvent[] = [];
    adapter.subscribe((event) => events.push(event));
    try {
      const fixture = await runToolStreamFixture({ deltas, onLiveEvent: (event) => adapter.accept(event), beforeFinalText: async () => {
        expect(events.filter((e) => e.type === "tool_finished")).toHaveLength(1);
        expect(events.some((e) => e.type === "agent_run_finished")).toBe(false);
      } });
      expect(events.filter((e) => e.type === "assistant_text_delta").map((e) => e.delta).join("")).toBe('Read now. Done. {"valid":"body JSON"}');
      const finished = events.find((e) => e.type === "tool_finished")!;
      expect(finished).toMatchObject({ toolName: "read_file", status: "completed", preview: { kind: "read", filePath: "fixture.txt" } });
      const snapshot = projectSessionSnapshot({ header: fixture.header, events: fixture.journal, registry: fixture.registry, rendererAllowlist: new Map() });
      const historical = projectFixedRendererEvents(snapshot, fixture.journal).find((e) => e.type === "tool_result");
      expect(historical?.payload).toMatchObject({ uiPreview: finished.preview, ok: true });
      expect(events.find((e) => e.type === "tool_started")).toMatchObject({ llmCallId: finished.llmCallId });
      expect(events.find((e) => e.type === "llm_call_started")).toMatchObject({ llmCallId: finished.llmCallId });
    } finally { adapter.dispose(); }
  });

  it("keeps invalid arguments visible as failed without a started event", async () => {
    const adapter = new FixedRendererStreamAdapter();
    const events: RuntimeStreamEvent[] = [];
    adapter.subscribe((event) => events.push(event));
    await runToolStreamFixture({ args: '{"path":42}', onLiveEvent: (event) => adapter.accept(event) });
    expect(events.some((e) => e.type === "tool_started")).toBe(false);
    expect(events.find((e) => e.type === "tool_finished")).toMatchObject({ status: "failed", isError: true, preview: { kind: "read" } });
    adapter.dispose();
  });

  it("keeps interleaved parameter placeholders stable with no timers", () => {
    vi.useFakeTimers();
    const adapter = new FixedRendererStreamAdapter();
    const events: RuntimeStreamEvent[] = [];
    adapter.subscribe((event) => events.push(event));
    try {
      for (const [callId, path] of [["a", "a.txt"], ["b", "b.txt"]]) {
        adapter.accept({ ...ids, kind: "tool-call-delta", callId, name: "write_file", argumentsDelta: `{"path":"${path}","content":"` });
      }
      for (let i = 0; i < 100; i++) adapter.accept({ ...ids, kind: "tool-call-delta", callId: "a", name: "write_file", argumentsDelta: "x" });
      expect(events).toHaveLength(2);
      vi.advanceTimersByTime(50);
      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({ toolCallId: "a", preview: { kind: "write", filePath: "" } });
      expect(JSON.stringify(events)).not.toContain("streamingContent");
      adapter.accept({ ...ids, kind: "tool-call-delta", callId: "b", name: "write_file", argumentsDelta: "b" });
      adapter.accept({ ...ids, kind: "run-state", message: "aborted" });
      expect(vi.getTimerCount()).toBe(0);
    } finally { adapter.dispose(); vi.useRealTimers(); }
  });

  it("omits partial args, publishes full prepared fields, and ignores late progress", async () => {
    const adapter = new FixedRendererStreamAdapter();
    const events: RuntimeStreamEvent[] = [];
    adapter.subscribe(() => { throw new Error("subscriber failed"); });
    adapter.subscribe((event) => events.push(event));
    adapter.accept({ ...ids, kind: "tool-call-delta", callId: "large", name: "write_file", argumentsDelta: '{"content":"' + "x".repeat(100_000) });
    const first = events.at(-1);
    expect(first).toMatchObject({ preview: { kind: "write", filePath: "" } });
    expect(JSON.stringify(first)).not.toContain("xxx");
    adapter.accept({ ...ids, kind: "tool-prepared", callId: "large", name: "write_file", arguments: { path: "late-path.txt", content: "full content" } });
    expect(events.at(-1)).toMatchObject({ preview: { kind: "write", filePath: "late-path.txt" } });
    const fixture = await runToolStreamFixture();
    const finished = fixture.events.find((event) => event.kind === "tool-finished")!;
    adapter.accept({ ...finished, ...ids, callId: "large", name: "write_file" });
    const count = events.length;
    adapter.progress({ ...ids, callId: "large", message: "late" });
    adapter.accept({ ...ids, kind: "tool-call-delta", callId: "large", name: "write_file", argumentsDelta: "late" });
    expect(events).toHaveLength(count);
    adapter.dispose();
  });
});
