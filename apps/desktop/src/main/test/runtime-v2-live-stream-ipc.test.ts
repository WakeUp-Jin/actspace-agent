import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RUNTIME_FIXED_RENDERER_CHANNELS as CH,
  type RuntimeDesktopLiveEnvelope,
  type RuntimeSessionSnapshot,
} from "@actspace/shared/runtime-v2";
import type { AgentLiveEvent } from "@actspace/shared/runtime-v2";
import type { RuntimeStreamEvent } from "@actspace/shared";
const { handlers, listeners } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  listeners: new Map<string, (...args: any[]) => any>(),
}));
vi.mock("electron", () => ({
  dialog: {},
  nativeImage: {},
  nativeTheme: {},
  ipcMain: {
    handle: (channel: string, listener: (...args: any[]) => any) => handlers.set(channel, listener),
    removeHandler: (channel: string) => handlers.delete(channel),
    on: (channel: string, listener: (...args: any[]) => any) => listeners.set(channel, listener),
    removeListener: (channel: string) => listeners.delete(channel),
  },
}));
import { registerFixedRendererIpc, type FixedRendererIpcOptions } from "../runtime-v2/fixed-renderer-ipc";
import { FixedRendererStreamAdapter } from "../runtime-v2/fixed-renderer-stream-adapter";
import { trustedWindow } from "./ipc-sender-fixture";

// 正文增量只走 agentStream（按 33ms 合并）；会话 live 通道只剩日志事实和运行状态，到达即发，
// 发之前先冲掉攒着的正文，保证定稿消息不会跑到它之前的增量前面。

const INTERVAL_MS = 33;
const ids = { sessionId: "s", agentRunId: "run", turnId: "turn", stepId: "step", requestId: "req", messageId: "msg" };
let seq = 0;
const envelope = (event: Record<string, unknown>): RuntimeDesktopLiveEnvelope => ({
  emittedAt: "t",
  event: {
    schemaVersion: 1,
    runtimeInstanceId: "r",
    liveSeq: ++seq,
    sessionId: "s",
    throughJournalSeq: seq,
    ...event,
  } as never,
});
const journal = (type: string) =>
  envelope({
    kind: "journal-update",
    update: { sessionId: "s", throughJournalSeq: seq, event: { type, seq, data: {} }, values: {} },
  });
const delta = (text: string) => ({ ...ids, kind: "assistant-delta", message: text }) as unknown as AgentLiveEvent;

beforeEach(() => {
  vi.useFakeTimers();
  seq = 0;
});
afterEach(() => {
  vi.useRealTimers();
  handlers.clear();
  listeners.clear();
});

function setup(extra: Record<string, unknown> = {}) {
  const trusted = trustedWindow();
  const send = vi.fn();
  (trusted.window.webContents as { send: unknown }).send = send;
  const liveListeners = new Set<(envelope: RuntimeDesktopLiveEnvelope) => void>();
  const adapter = new FixedRendererStreamAdapter(() => undefined, INTERVAL_MS);
  const setObservedSessions = vi.fn();
  const registry = {
    subscribe: (listener: (envelope: RuntimeDesktopLiveEnvelope) => void) => {
      liveListeners.add(listener);
      return () => liveListeners.delete(listener);
    },
    subscribeRendererStream: (listener: (event: RuntimeStreamEvent) => void) => adapter.subscribe(listener),
    flushRendererStream: () => adapter.flush(),
    setObservedSessions,
    ...extra,
  };
  const registration = registerFixedRendererIpc({
    roots: { dataRoot: "/tmp/live", workspaceRoot: "/tmp" },
    registry,
    settings: { subscribeV4Changes: () => () => {} },
    getMainWindow: () => trusted.window,
  } as unknown as FixedRendererIpcOptions);
  const emit = (value: RuntimeDesktopLiveEnvelope) => {
    for (const listener of liveListeners) listener(value);
  };
  const order = () =>
    send.mock.calls.map((call) =>
      call[0] === CH.agentStream
        ? `stream:${(call[1] as { delta?: string; type: string }).delta ?? (call[1] as { type: string }).type}`
        : `live:${(call[1] as RuntimeDesktopLiveEnvelope).event.update?.event.type ?? (call[1] as RuntimeDesktopLiveEnvelope).event.kind}`,
    );
  return { trusted, send, adapter, registration, emit, setObservedSessions, order };
}

describe("desktop live IPC", () => {
  it("sends 100 streamed deltas in one renderer stream message per window and nothing on the session channel", () => {
    const { send, adapter, registration } = setup();
    try {
      for (let index = 0; index < 100; index++) adapter.accept(delta(`t${index} `));
      expect(send).not.toHaveBeenCalled();
      vi.advanceTimersByTime(INTERVAL_MS);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0]).toBe(CH.agentStream);
      expect((send.mock.calls[0][1] as { delta: string }).delta).toBe(
        Array.from({ length: 100 }, (_, index) => `t${index} `).join(""),
      );
    } finally {
      registration.dispose();
      adapter.dispose();
    }
  });

  it("a committed journal message never overtakes the text deltas streamed before it", () => {
    const { adapter, registration, emit, order, send } = setup();
    try {
      adapter.accept(delta("I'll explore "));
      adapter.accept(delta("the project."));
      emit(journal("assistant/message"));
      expect(order()).toEqual(["stream:I'll explore the project.", "live:assistant/message"]);
      vi.advanceTimersByTime(1000);
      expect(send).toHaveBeenCalledTimes(2);
    } finally {
      registration.dispose();
      adapter.dispose();
    }
  });

  it("a run boundary flushes pending text first, and flushLive drains the renderer stream", () => {
    const { adapter, registration, order, send } = setup();
    try {
      adapter.accept(delta("hello"));
      adapter.accept({ ...ids, kind: "run-state", message: "completed" } as unknown as AgentLiveEvent);
      expect(order()).toEqual(["stream:hello", "stream:agent_run_finished"]);
      send.mockClear();
      adapter.accept({ ...delta("tail"), agentRunId: "run-2" } as unknown as AgentLiveEvent);
      registration.flushLive();
      expect(order()).toEqual(["stream:tail"]);
      vi.advanceTimersByTime(1000);
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      registration.dispose();
      adapter.dispose();
    }
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
    } finally {
      registration.dispose();
    }
  });

  it("reads the live baseline for reloads and passes the child's baseline to the subagent transcript", async () => {
    const snapshot = {
      kind: "session-snapshot",
      schemaVersion: 1,
      sessionId: "child",
      createdAt: "t",
      updatedAt: "t",
      workspaceRoot: "/w",
      throughJournalSeq: -1,
      accessState: "read-write",
      metadata: { title: "child", pinned: false, archived: false },
      messages: [],
      tools: [],
      pendingInbox: [],
      todos: [],
      delegations: [],
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
        costUsd: null,
      },
      activity: {
        turnCount: 0,
        completedTurnCount: 0,
        stepCount: 0,
        activeTurnId: null,
        activeStepId: null,
        compactionCount: 0,
        activeCompactionId: null,
        lastCompactionSummary: null,
        timing: { llmMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 },
      },
      lineage: null,
    } as RuntimeSessionSnapshot;
    const liveOutput = vi.fn((sessionId: string) => ({
      runId: `${sessionId}-run`,
      revision: 4,
      segments: [{ kind: "text" as const, messageId: "m", text: "partial" }],
    }));
    const { trusted, registration } = setup({
      liveOutput,
      inspectSession: vi.fn(async () => snapshot),
      inspectSessionEvents: vi.fn(async () => []),
    });
    try {
      await expect(handlers.get(CH.getSessionLiveOutput)!(trusted.event, { sessionId: "s" })).resolves.toMatchObject({
        runId: "s-run",
        revision: 4,
      });
      const transcript = await handlers.get(CH.getSubAgentTranscript)!(trusted.event, {
        transcriptRef: { kind: "subagent_transcript", sessionId: "s", agentRunId: "run", runId: "child" },
      });
      expect(liveOutput).toHaveBeenLastCalledWith("child");
      expect(transcript).toEqual([
        expect.objectContaining({
          id: "live-text:m",
          type: "assistant_message",
          agentRunId: "child-run",
          payload: { content: "partial" },
        }),
      ]);
    } finally {
      registration.dispose();
    }
  });
});
