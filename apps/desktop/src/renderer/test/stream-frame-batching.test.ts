import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { RuntimeLiveEvent, SessionEventEnvelopeV1 } from "@actspace/shared/runtime-v2";
import { createDesktopSessionBridge } from "../session/desktop-session-bridge";
import { createFrameScheduler } from "../session/frame-batch";
import { createLiveRunStore } from "../session/live-runs/live-run-store";
import { createEmptyStreamingState } from "@actspace/client/live";
import { useChatSessionRecord } from "../session/session-store";
import { projectionFixture } from "./projection-fixture";

// 流式输出按帧合并通知：增量事件攒到下一帧一起发，结构性事件立即生效且先冲掉已攒的增量。
function manualFrames() {
  const frames: (() => void)[] = [];
  const schedule = createFrameScheduler((callback) => {
    frames.push(callback);
  });
  const runFrame = () => {
    const due = frames.splice(0);
    for (const callback of due) callback();
  };
  return { schedule, frames, runFrame };
}

function journalEvent(seq: number, type: string, data: Record<string, string> = {}): SessionEventEnvelopeV1 {
  return {
    recordKind: "event",
    seq,
    type,
    eventVersion: 1,
    criticality: "ignorable",
    time: "2026-10-19T00:00:00Z",
    source: { ownerPluginId: "@actspace/core" },
    data,
    surface: null,
    provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null },
  };
}

function journalUpdate(seq: number, type: string, values: Record<string, unknown> = {}): RuntimeLiveEvent {
  return {
    kind: "journal-update",
    schemaVersion: 1,
    runtimeInstanceId: "r1",
    liveSeq: seq + 1,
    sessionId: "s",
    throughJournalSeq: seq,
    update: { sessionId: "s", throughJournalSeq: seq, event: journalEvent(seq, type, { delta: "x" }), values },
  } as RuntimeLiveEvent;
}

describe("frame scheduler", () => {
  it("runs every flush registered within a frame in one callback, once each", () => {
    const { schedule, frames, runFrame } = manualFrames();
    const first = vi.fn();
    const second = vi.fn();
    schedule(first);
    schedule(second);
    schedule(first);
    expect(frames).toHaveLength(1);
    runFrame();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    schedule(first);
    expect(frames).toHaveLength(1);
  });
});

describe("live run store frame batching", () => {
  it("defers text deltas to the frame but notifies structural events immediately", () => {
    const { schedule, runFrame } = manualFrames();
    const store = createLiveRunStore(undefined, { scheduleNotify: schedule });
    store.start({
      sessionId: "s1",
      agentRunId: "run-1",
      state: createEmptyStreamingState(),
      userBlock: null,
      aborting: false,
    });
    const listener = vi.fn();
    store.subscribe(listener);
    const onSteered = () => undefined;
    for (const delta of ["一", "二", "三"])
      store.applyStreamEvent(
        { type: "assistant_text_delta", sessionId: "s1", agentRunId: "run-1", delta } as never,
        onSteered,
      );
    expect(listener).not.toHaveBeenCalled();
    runFrame();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.view("s1").blocks.find((block) => block.kind === "assistant")).toMatchObject({ content: "一二三" });

    // 结构性事件立即通知，已排队的帧回调随后不再重复通知。
    store.applyStreamEvent(
      { type: "assistant_text_delta", sessionId: "s1", agentRunId: "run-1", delta: "四" } as never,
      onSteered,
    );
    store.applyStreamEvent({ type: "agent_run_started", sessionId: "s1", agentRunId: "run-1" } as never, onSteered);
    expect(listener).toHaveBeenCalledTimes(2);
    runFrame();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("chat projection without journaled chunks", () => {
  it("never shows assistant chunks from the Journal and keeps the record stable across them", async () => {
    let emit!: (event: RuntimeLiveEvent) => void;
    const chunk = (seq: number, content: string) =>
      journalEvent(seq, "assistant/chunk", {
        agentRunId: "run-1",
        messageId: "a-1",
        kind: "assistant-delta",
        content,
      });
    const bridge = createDesktopSessionBridge({
      // 旧会话的日志里还有 chunk，但没有对应的 assistant/message（例如崩溃前的半截回复）。
      getSessionProjectionSnapshot: async () => projectionFixture("s", 1, [chunk(1, "orphan before reload\n")]),
      onSessionLiveEvent: (listener) => {
        emit = (event) => listener({ event });
        return () => {};
      },
    });
    bridge.start();
    await bridge.open("s");
    const { result, unmount } = renderHook(() => useChatSessionRecord(bridge.store, "s", "/w"));
    const first = result.current.sessionRecord;
    expect(first?.messageBlocks?.some((block) => block.kind === "assistant")).toBe(false);

    act(() => {
      const event = journalUpdate(2, "assistant/chunk");
      if (event.kind !== "journal-update" || !event.update) throw new Error("expected Journal update");
      emit({ ...event, update: { ...event.update, event: chunk(2, "late chunk\n") } });
    });
    expect(result.current.sessionRecord?.messageBlocks?.some((block) => block.kind === "assistant")).toBe(false);
    unmount();
    bridge.dispose();
  });
});
