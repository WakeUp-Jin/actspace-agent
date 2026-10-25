import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { RuntimeV2LiveEvent, SessionEventEnvelopeV1 } from "@actspace/shared/runtime-v2";
import { createDesktopSessionBridge } from "../session/desktop-session-bridge";
import { createFrameScheduler } from "../session/frame-batch";
import { createLiveRunStore } from "../session/live-runs/live-run-store";
import { createEmptyStreamingState } from "../session/session-run-state";
import { onlyStreamChunksSince, useChatSessionRecord } from "../session/session-store";
import { projectionFixture } from "./projection-fixture";

// 流式输出按帧合并通知：增量事件攒到下一帧一起发，结构性事件立即生效且先冲掉已攒的增量。
function manualFrames() {
  const frames: (() => void)[] = [];
  const schedule = createFrameScheduler((callback) => { frames.push(callback); });
  const runFrame = () => { const due = frames.splice(0); for (const callback of due) callback(); };
  return { schedule, frames, runFrame };
}

function journalEvent(seq: number, type: string, data: Record<string, string> = {}): SessionEventEnvelopeV1 {
  return { recordKind: "event", seq, type, eventVersion: 1, criticality: "ignorable", time: "2026-10-19T00:00:00Z", source: { ownerPluginId: "@actspace/core" }, data, surface: null, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } };
}

function journalUpdate(seq: number, type: string, values: Record<string, unknown> = {}): RuntimeV2LiveEvent {
  return { kind: "journal-update", schemaVersion: 1, runtimeInstanceId: "r1", liveSeq: seq + 1, sessionId: "s", throughJournalSeq: seq,
    update: { sessionId: "s", throughJournalSeq: seq, event: journalEvent(seq, type, { delta: "x" }), values } } as RuntimeV2LiveEvent;
}

describe("frame scheduler", () => {
  it("runs every flush registered within a frame in one callback, once each", () => {
    const { schedule, frames, runFrame } = manualFrames();
    const first = vi.fn();
    const second = vi.fn();
    schedule(first); schedule(second); schedule(first);
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
    store.start({ sessionId: "s1", agentRunId: "run-1", state: createEmptyStreamingState(), userBlock: null, aborting: false });
    const listener = vi.fn();
    store.subscribe(listener);
    const onSteered = () => undefined;
    for (const delta of ["一", "二", "三"]) store.applyStreamEvent({ type: "assistant_text_delta", sessionId: "s1", agentRunId: "run-1", delta } as never, onSteered);
    expect(listener).not.toHaveBeenCalled();
    runFrame();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.view("s1").blocks.find((block) => block.kind === "assistant")).toMatchObject({ content: "一二三" });

    // 结构性事件立即通知，已排队的帧回调随后不再重复通知。
    store.applyStreamEvent({ type: "assistant_text_delta", sessionId: "s1", agentRunId: "run-1", delta: "四" } as never, onSteered);
    store.applyStreamEvent({ type: "agent_run_started", sessionId: "s1", agentRunId: "run-1" } as never, onSteered);
    expect(listener).toHaveBeenCalledTimes(2);
    runFrame();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("desktop session bridge frame batching", () => {
  it("applies queued chunk updates in one store batch and flushes them before a structural event", async () => {
    const { schedule, runFrame } = manualFrames();
    let emit!: (event: RuntimeV2LiveEvent) => void;
    const bridge = createDesktopSessionBridge({
      getSessionProjectionSnapshot: async () => projectionFixture("s", 0, [journalEvent(0, "turn/start")]),
      onSessionLiveEvent: (listener) => { emit = (event) => listener({ event }); return () => {}; },
    }, undefined, { scheduleStreamFlush: schedule });
    bridge.start();
    await bridge.open("s");
    const listener = vi.fn();
    bridge.store.subscribe(listener);

    emit(journalUpdate(1, "assistant/chunk"));
    emit(journalUpdate(2, "assistant/chunk"));
    expect(bridge.store.get("s").window?.events).toHaveLength(1);
    runFrame();
    expect(bridge.store.get("s").window?.events.map((event) => event.seq)).toEqual([0, 1, 2]);
    expect(listener).toHaveBeenCalledTimes(1);

    emit(journalUpdate(3, "assistant/chunk"));
    emit(journalUpdate(4, "assistant/message"));
    expect(bridge.store.get("s").window?.events.map((event) => event.seq)).toEqual([0, 1, 2, 3, 4]);
    runFrame();
    expect(bridge.store.get("s").window?.events).toHaveLength(5);
    bridge.dispose();
  });
});

describe("chat projection reuse", () => {
  it("restores pending chunks when a run is recovered and keeps subsequent frame updates visible", async () => {
    const { schedule, runFrame } = manualFrames();
    let emit!: (event: RuntimeV2LiveEvent) => void;
    const chunk = (seq: number, content: string) => journalEvent(seq, "assistant/chunk", {
      agentRunId: "run-1", messageId: "a-1", kind: "assistant-delta", content,
    });
    const bridge = createDesktopSessionBridge({
      getSessionProjectionSnapshot: async () => projectionFixture("s", 1, [chunk(1, "before reload\n")]),
      onSessionLiveEvent: listener => { emit = event => listener({ event }); return () => {}; },
    }, undefined, { scheduleStreamFlush: schedule });
    bridge.start();
    await bridge.open("s");
    const { result, rerender, unmount } = renderHook(({ recovered }) => useChatSessionRecord(bridge.store, "s", "/w", recovered), { initialProps: { recovered: false } });
    const ordinary = result.current.sessionRecord;
    const append = (seq: number, content: string) => {
      const event = journalUpdate(seq, "assistant/chunk");
      if (event.kind !== "journal-update") throw new Error("expected Journal update");
      emit({ ...event, update: { ...event.update, event: chunk(seq, content) } });
      runFrame();
    };
    act(() => append(2, "after reload\n"));
    expect(result.current.sessionRecord).toBe(ordinary);
    rerender({ recovered: true });
    expect(result.current.sessionRecord?.messageBlocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "assistant", content: "before reload\nafter reload\n" }),
    ]));
    act(() => append(3, "still running\n"));
    expect(result.current.sessionRecord?.messageBlocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "assistant", content: "before reload\nafter reload\nstill running\n" }),
    ]));
    unmount();
    bridge.dispose();
  });

  it("treats appended assistant chunks as invisible to the chat projection, and anything else as a change", async () => {
    let emit!: (event: RuntimeV2LiveEvent) => void;
    const bridge = createDesktopSessionBridge({
      getSessionProjectionSnapshot: async () => projectionFixture("s", 0, [journalEvent(0, "turn/start")]),
      onSessionLiveEvent: (listener) => { emit = (event) => listener({ event }); return () => {}; },
    });
    bridge.start();
    await bridge.open("s");
    const base = bridge.store.get("s");
    emit(journalUpdate(1, "assistant/chunk"));
    const chunked = bridge.store.get("s");
    expect(chunked).not.toBe(base);
    expect(onlyStreamChunksSince(base, chunked)).toBe(true);

    emit(journalUpdate(2, "assistant/message"));
    expect(onlyStreamChunksSince(chunked, bridge.store.get("s"))).toBe(false);
    const message = bridge.store.get("s");
    emit(journalUpdate(3, "assistant/chunk", { metadata: { title: "renamed", pinned: false, archived: false } }));
    expect(onlyStreamChunksSince(message, bridge.store.get("s"))).toBe(false);
    bridge.dispose();
  });
});
