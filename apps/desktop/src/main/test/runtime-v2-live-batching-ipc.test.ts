import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RUNTIME_V2_FIXED_RENDERER_CHANNELS as CH, type RuntimeV2DesktopLiveEnvelope } from "@actspace/shared/runtime-v2";
import type { AgentLiveEvent } from "@actspace/shared/runtime-v2";
import type { RuntimeStreamEvent } from "@actspace/shared";
const { handlers, listeners } = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>(), listeners: new Map<string, (...args: any[]) => any>() }));
vi.mock("electron", () => ({ dialog: {}, nativeImage: {}, nativeTheme: {}, ipcMain: {
  handle: (channel: string, listener: (...args: any[]) => any) => handlers.set(channel, listener),
  removeHandler: (channel: string) => handlers.delete(channel),
  on: (channel: string, listener: (...args: any[]) => any) => listeners.set(channel, listener),
  removeListener: (channel: string) => listeners.delete(channel),
} }));
import { registerFixedRendererIpc, type FixedRendererIpcOptions } from "../runtime-v2/fixed-renderer-ipc";
import { FixedRendererStreamAdapter } from "../runtime-v2/fixed-renderer-stream-adapter";
import { LiveEnvelopeBatcher, LIVE_BATCH_INTERVAL_MS, isStreamChunkEnvelope } from "../runtime-v2/live-envelope-batcher";
import { trustedWindow } from "./ipc-sender-fixture";

const ids = { sessionId: "s", agentRunId: "run", turnId: "turn", stepId: "step", requestId: "req", messageId: "msg" };
let seq = 0;
const envelope = (event: Record<string, unknown>): RuntimeV2DesktopLiveEnvelope => ({ emittedAt: "t", event: { schemaVersion: 1, runtimeInstanceId: "r", liveSeq: ++seq, sessionId: "s", throughJournalSeq: seq, ...event } as never });
const chunk = (text: string) => envelope({ kind: "journal-update", update: { sessionId: "s", throughJournalSeq: seq, event: { type: "assistant/chunk", seq, data: { delta: text } }, values: {} } });
const other = (type: string) => envelope({ kind: "journal-update", update: { sessionId: "s", throughJournalSeq: seq, event: { type, seq, data: {} }, values: {} } });

beforeEach(() => { vi.useFakeTimers(); seq = 0; });
afterEach(() => { vi.useRealTimers(); handlers.clear(); listeners.clear(); });

describe("LiveEnvelopeBatcher", () => {
  it("sends one message per window with every chunk in order, and a lone chunk unchanged", () => {
    const sent: RuntimeV2DesktopLiveEnvelope[] = [];
    const batcher = new LiveEnvelopeBatcher(message => sent.push(message));
    const first = chunk("a");
    batcher.push(first);
    batcher.push(chunk("b")); batcher.push(chunk("c"));
    expect(sent).toHaveLength(0);
    vi.advanceTimersByTime(LIVE_BATCH_INTERVAL_MS);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.batch!.map(item => (item.event.update!.event.data as { delta: string }).delta)).toEqual(["a", "b", "c"]);
    expect(sent[0]!.event).toBe(sent[0]!.batch![2]!.event);
    const lone = chunk("solo");
    batcher.push(lone); vi.advanceTimersByTime(LIVE_BATCH_INTERVAL_MS);
    expect(sent[1]).toBe(lone);
  });

  it("flushes pending chunks before any other envelope, keeping order", () => {
    const sent: RuntimeV2DesktopLiveEnvelope[] = [];
    const batcher = new LiveEnvelopeBatcher(message => sent.push(message));
    batcher.push(chunk("a")); batcher.push(chunk("b"));
    const message = other("assistant/message");
    batcher.push(message);
    batcher.push(envelope({ kind: "run-state", message: "completed" }));
    expect(sent.map(item => item.batch?.length ?? item.event.update?.event.type ?? item.event.kind)).toEqual([2, "assistant/message", "run-state"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("flush and dispose drain without waiting; nothing is sent after", () => {
    const sent: RuntimeV2DesktopLiveEnvelope[] = [];
    const batcher = new LiveEnvelopeBatcher(message => sent.push(message));
    batcher.push(chunk("a")); batcher.flush(); batcher.flush();
    expect(sent).toHaveLength(1);
    batcher.push(chunk("b")); batcher.dispose();
    expect(sent).toHaveLength(2);
    vi.advanceTimersByTime(1000);
    expect(sent).toHaveLength(2);
    expect(isStreamChunkEnvelope(other("x"))).toBe(false);
  });
});

describe("webContents.send per 100 streamed deltas", () => {
  function setup() {
    const trusted = trustedWindow();
    const send = vi.fn();
    (trusted.window.webContents as { send: unknown }).send = send;
    const liveListeners = new Set<(envelope: RuntimeV2DesktopLiveEnvelope) => void>();
    const adapter = new FixedRendererStreamAdapter(() => undefined, LIVE_BATCH_INTERVAL_MS);
    const setObservedSessions = vi.fn();
    const registry = {
      subscribe: (listener: (envelope: RuntimeV2DesktopLiveEnvelope) => void) => { liveListeners.add(listener); return () => liveListeners.delete(listener); },
      subscribeRendererStream: (listener: (event: RuntimeStreamEvent) => void) => adapter.subscribe(listener),
      flushRendererStream: () => adapter.flush(), setObservedSessions,
    };
    const registration = registerFixedRendererIpc({ roots: { dataRoot: "/tmp/live", workspaceRoot: "/tmp" }, registry, settings: { subscribeV4Changes: () => () => {} }, getMainWindow: () => trusted.window } as unknown as FixedRendererIpcOptions);
    const emit = (value: RuntimeV2DesktopLiveEnvelope) => { for (const listener of liveListeners) listener(value); };
    return { trusted, send, adapter, registration, emit, setObservedSessions };
  }
  const delta = (text: string) => ({ ...ids, kind: "assistant-delta", message: text }) as unknown as AgentLiveEvent;

  it("sends at most two messages per 33 ms window instead of three per delta", () => {
    const { send, adapter, registration, emit } = setup();
    try {
      for (let index = 0; index < 100; index++) {
        // One token: the adapter sees the live delta; the journal projects one chunk.
        adapter.accept(delta(`t${index} `));
        emit(chunk(`t${index} `));
      }
      expect(send).not.toHaveBeenCalled();
      vi.advanceTimersByTime(LIVE_BATCH_INTERVAL_MS);
      const byChannel = (channel: string) => send.mock.calls.filter(call => call[0] === channel);
      expect(byChannel(CH.agentStream)).toHaveLength(1);
      expect(byChannel(CH.sessionLiveEvent)).toHaveLength(1);
      expect(send.mock.calls.length).toBeLessThanOrEqual(2);
      expect((byChannel(CH.agentStream)[0]![1] as { delta: string }).delta).toBe(Array.from({ length: 100 }, (_, index) => `t${index} `).join(""));
      expect((byChannel(CH.sessionLiveEvent)[0]![1] as RuntimeV2DesktopLiveEnvelope).batch).toHaveLength(100);
    } finally { registration.dispose(); adapter.dispose(); }
  });

  it("measures sends for 100 deltas arriving every 10 ms: before (3 per delta) vs after", () => {
    const { send, adapter, registration, emit } = setup();
    try {
      for (let index = 0; index < 100; index++) {
        adapter.accept(delta(`t${index} `));
        emit(chunk(`t${index} `));
        vi.advanceTimersByTime(10);
      }
      vi.advanceTimersByTime(LIVE_BATCH_INTERVAL_MS);
      const before = 100 * 3; // agentStream delta + assistant-delta live envelope + journal chunk, one message each
      const after = send.mock.calls.length;
      console.info(`PERF-B webContents.send per 100 deltas (10 ms apart): before=${before} after=${after}`);
      expect(after).toBeLessThanOrEqual(Math.ceil(before / 4));
      // Every token still arrives, exactly once, in order.
      const text = send.mock.calls.filter(call => call[0] === CH.agentStream).map(call => (call[1] as { delta: string }).delta).join("");
      expect(text).toBe(Array.from({ length: 100 }, (_, index) => `t${index} `).join(""));
      const chunks = send.mock.calls.filter(call => call[0] === CH.sessionLiveEvent).flatMap(call => (call[1] as RuntimeV2DesktopLiveEnvelope).batch ?? [call[1] as RuntimeV2DesktopLiveEnvelope]);
      expect(chunks).toHaveLength(100);
      expect(chunks.map(item => item.event.liveSeq)).toEqual([...chunks.map(item => item.event.liveSeq)].sort((a, b) => a - b));
    } finally { registration.dispose(); adapter.dispose(); }
  });

  it("a run boundary on the stream flushes buffered chunks first, and flushLive drains both paths", () => {
    const { send, adapter, registration, emit } = setup();
    try {
      emit(chunk("a")); emit(chunk("b"));
      adapter.accept(delta("hello"));
      adapter.accept({ ...ids, kind: "run-state", message: "completed" } as unknown as AgentLiveEvent);
      const order = send.mock.calls.map(call => call[0] === CH.sessionLiveEvent ? "live-batch" : (call[1] as RuntimeStreamEvent).type);
      // The pending text goes out first (it is the adapter's own flush), then the chunks, then the boundary.
      expect(order).toEqual(["assistant_text_delta", "live-batch", "agent_run_finished"]);
      send.mockClear();
      emit(chunk("c")); adapter.accept({ ...delta("tail"), agentRunId: "run-2" } as unknown as AgentLiveEvent);
      registration.flushLive();
      expect(send.mock.calls.map(call => call[0])).toEqual([CH.agentStream, CH.sessionLiveEvent]);
      vi.advanceTimersByTime(1000);
      expect(send).toHaveBeenCalledTimes(2);
    } finally { registration.dispose(); adapter.dispose(); }
  });

  it("a committed journal message never overtakes the text deltas streamed before it", () => {
    const { send, adapter, registration, emit } = setup();
    try {
      adapter.accept(delta("I'll explore "));
      emit(chunk("I'll explore "));
      adapter.accept(delta("the project."));
      emit(chunk("the project."));
      // The step ends: the journal commits the message while the last text is still inside the 33 ms window.
      emit(other("assistant/message"));
      const order = send.mock.calls.map(call => call[0] === CH.agentStream
        ? `stream:${(call[1] as { delta: string }).delta}`
        : (call[1] as RuntimeV2DesktopLiveEnvelope).batch ? "chunks" : (call[1] as RuntimeV2DesktopLiveEnvelope).event.update!.event.type);
      expect(order).toEqual(["stream:I'll explore the project.", "chunks", "assistant/message"]);
      // Nothing is left to arrive late.
      vi.advanceTimersByTime(1000);
      expect(send).toHaveBeenCalledTimes(3);
    } finally { registration.dispose(); adapter.dispose(); }
  });

  it("disposal sends what is pending and then stops timers", () => {
    const { send, adapter, registration, emit } = setup();
    emit(chunk("a"));
    registration.dispose();
    expect(send).toHaveBeenCalledTimes(1);
    adapter.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("forwards the renderer's observed Session set to the registry and ignores malformed input", () => {
    const { trusted, registration, setObservedSessions } = setup();
    try {
      const listener = listeners.get(CH.setObservedSessions)!;
      listener(trusted.event, ["a", "b"]);
      expect(setObservedSessions).toHaveBeenLastCalledWith(["a", "b"]);
      listener(trusted.event, "not-an-array");
      expect(setObservedSessions).toHaveBeenLastCalledWith([]);
      listener({ ...trusted.event, sender: { id: 99 } }, ["evil"]);
      expect(setObservedSessions).toHaveBeenCalledTimes(2);
    } finally { registration.dispose(); }
  });
});
