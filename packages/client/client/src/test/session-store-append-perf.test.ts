import { describe, expect, it } from "vitest";
import { ClientSessionStore } from "../sessions/session.js";
import type { RuntimeV2SessionSnapshot, RuntimeV2SessionUpdate } from "@actspace/shared/runtime-v2";

function snapshot(sessionId: string, throughJournalSeq: number): RuntimeV2SessionSnapshot {
  return {
    kind: "session-snapshot", schemaVersion: 1, sessionId, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z", workspaceRoot: null, throughJournalSeq, permissionMode: "default", accessState: "read-write",
    metadata: { title: null, pinned: false, archived: false }, messages: [], tools: [], pendingInbox: [], todos: [], delegations: [], usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: null }, activity: { turnCount: 0, completedTurnCount: 0, stepCount: 0, activeTurnId: null, activeStepId: null, compactionCount: 0, activeCompactionId: null, lastCompactionSummary: null, timing: { llmMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 } }, lineage: null,
  };
}

function event(seq: number, type = "assistant/chunk") {
  return { recordKind: "event" as const, seq, type, eventVersion: 1, criticality: "core" as const, time: "2026-10-06T00:00:00.000Z", source: { kind: "runtime" as const }, data: {}, surface: null, provenance: { emitter: "runtime" as const } };
}

/** A Session whose window already holds `size` journal events (no compaction/recovery boundary among them, the worst case for a reverse scan). */
function seeded(size: number): { store: ClientSessionStore; next: () => RuntimeV2SessionUpdate; seq: () => number } {
  const store = new ClientSessionStore();
  const through = size - 1;
  const events = Array.from({ length: size }, (_, index) => event(index));
  store.applyEnvelope({ kind: "session-projection", schemaVersion: 1, sessionId: "s", throughJournalSeq: through, snapshot: snapshot("s", through), values: {}, activeMessageIds: [], deferredToolCalls: [], window: { events, fromSeq: 0, throughJournalSeq: through, beforeSeq: null, turnOffset: 0, requestOffset: 0 } } as never);
  let seq = size;
  return { store, seq: () => seq, next: () => ({ sessionId: "s", throughJournalSeq: seq, values: {}, event: event(seq++) }) as RuntimeV2SessionUpdate };
}

/** Median per-event apply time (microseconds) over repeated batches. */
function perEventMicros(size: number, batch = 400, rounds = 7): number {
  const { store, next } = seeded(size);
  for (let i = 0; i < 100; i++) store.applyJournalUpdate(next());
  const samples: number[] = [];
  for (let round = 0; round < rounds; round++) {
    const updates = Array.from({ length: batch }, next);
    const start = performance.now();
    for (const update of updates) store.applyJournalUpdate(update);
    samples.push(((performance.now() - start) * 1000) / batch);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

function surfaceEvent(seq: number, type: string, messageId?: string) {
  return { ...event(seq, type), ...(messageId ? { data: { messageId, content: messageId }, surface: { kind: "append" as const } } : {}) };
}

function apply(store: ClientSessionStore, seq: number, type: string, messageId?: string, tool?: unknown): boolean {
  return store.applyJournalUpdate({ sessionId: "s", throughJournalSeq: seq, values: {}, event: surfaceEvent(seq, type, messageId), ...(tool ? { tool } : {}) } as never);
}

describe("ClientSessionStore journal append cost", () => {
  // Before the fix every event ran `[...events].reverse().find(...)` plus several whole-array copies:
  // ~49us/event at 5k events and ~140us at 20k (this machine). The remaining cost is one native copy of the
  // events array, kept because published arrays must stay immutable (consumers compare identity/length).
  // Wall-clock benchmark: shared CI runners are too noisy for a fixed budget, so it only runs on demand (ACTSPACE_PERF_BENCH=1).
  it.skipIf(!process.env.ACTSPACE_PERF_BENCH)("applies a journal event in tens of microseconds even on a 20k-event window", () => {
    perEventMicros(5_000, 50, 2); // warm up JIT
    const small = perEventMicros(5_000);
    const large = perEventMicros(20_000);
    console.info(`[perf] applyJournalUpdate per event: 5k=${small.toFixed(1)}us 20k=${large.toFixed(1)}us ratio=${(large / small).toFixed(2)}`);
    expect(large).toBeLessThan(70);
  });

  it("never mutates a previously published window or snapshot arrays", () => {
    const { store, next } = seeded(50);
    const before = store.get("s");
    const eventsBefore = before.window!.events;
    store.applyJournalUpdate(next());
    expect(before.window!.events).toBe(eventsBefore);
    expect(eventsBefore).toHaveLength(50);
    expect(store.get("s").window!.events).toHaveLength(51);
    expect(store.get("s").window!.events).not.toBe(eventsBefore);
  });

  it("tracks compaction/recovery transactions from the last boundary event, including after a window merge", () => {
    const { store } = seeded(10);
    expect(apply(store, 10, "compaction/start")).toBe(true);
    expect(apply(store, 11, "user/message", "during")).toBe(true); // pending: surface suppressed
    expect(store.get("s").snapshot!.messages).toEqual([]);
    expect(apply(store, 12, "compaction/end")).toBe(true);
    expect(apply(store, 13, "user/message", "after")).toBe(true);
    expect(store.get("s").snapshot!.messages.map(message => message.messageId)).toEqual(["after"]);

    // A window that arrives already inside a transaction (scanned once from its events).
    const merged = new ClientSessionStore();
    const events = [event(0), event(1, "recovery/start")];
    merged.applyEnvelope({ kind: "session-projection", schemaVersion: 1, sessionId: "s", throughJournalSeq: 1, snapshot: snapshot("s", 1), values: {}, activeMessageIds: [], deferredToolCalls: [], window: { events, fromSeq: 0, throughJournalSeq: 1, beforeSeq: null, turnOffset: 0, requestOffset: 0 } } as never);
    expect(apply(merged, 2, "user/message", "blocked")).toBe(true);
    expect(merged.get("s").snapshot!.messages).toEqual([]);
    expect(apply(merged, 3, "recovery/committed")).toBe(true);
    expect(apply(merged, 4, "user/message", "ok")).toBe(true);
    expect(merged.get("s").snapshot!.messages.map(message => message.messageId)).toEqual(["ok"]);
  });

  it("moves an updated tool to the end and adds new ones", () => {
    const { store } = seeded(3);
    const tool = (callId: string, state: string) => ({ callId, state });
    apply(store, 3, "tool/start", undefined, tool("a", "running"));
    apply(store, 4, "tool/start", undefined, tool("b", "running"));
    apply(store, 5, "tool/end", undefined, tool("a", "completed"));
    expect(store.get("s").snapshot!.tools.map(item => `${item.callId}:${item.state}`)).toEqual(["b:running", "a:completed"]);
  });
});
