import { describe, expect, it } from "vitest";
import { ClientSessionStore } from "../sessions/session.js";
import type { RuntimeV2LiveEvent, RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";

function snapshot(sessionId: string, throughJournalSeq: number): RuntimeV2SessionSnapshot {
  return {
    kind: "session-snapshot", schemaVersion: 1, sessionId, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z", workspaceRoot: null, throughJournalSeq, permissionMode: "default", accessState: "read-write",
    metadata: { title: null, pinned: false, archived: false }, messages: [], tools: [], pendingInbox: [], todos: [], delegations: [], usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: null }, activity: { turnCount: 0, completedTurnCount: 0, stepCount: 0, activeTurnId: null, activeStepId: null, compactionCount: 0, activeCompactionId: null, lastCompactionSummary: null, timing: { llmMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 } }, lineage: null,
  };
}

function envelope(sessionId: string, seq: number, title: string | null) {
  const value = snapshot(sessionId, seq);
  const metadata = { ...value.metadata, title };
  return { kind: "session-projection" as const, schemaVersion: 1 as const, sessionId, throughJournalSeq: seq, snapshot: { ...value, metadata }, values: { metadata }, activeMessageIds: [], deferredToolCalls: [], window: { events: [], fromSeq: seq + 1, throughJournalSeq: seq, beforeSeq: null, turnOffset: 0, requestOffset: 0 } };
}

function live(sessionId: string, liveSeq: number, kind: RuntimeV2LiveEvent["kind"] = "runtime-live"): RuntimeV2LiveEvent {
  return { kind, schemaVersion: 1, runtimeInstanceId: "runtime-1", liveSeq, throughJournalSeq: 0, sessionId, message: "progress" };
}

function journalEvent(seq: number) {
  return { recordKind: "event" as const, seq, type: "user/message", eventVersion: 1, criticality: "core" as const, time: "2026-10-06T00:00:00.000Z", source: { kind: "runtime" as const }, data: {}, surface: null, provenance: { emitter: "runtime" as const } };
}

/** One page of history: events [fromSeq, pageThrough], with the Session snapshot at `revision`. */
function page(sessionId: string, revision: number, fromSeq: number, pageThrough: number) {
  const base = envelope(sessionId, revision, null);
  const events = Array.from({ length: pageThrough - fromSeq + 1 }, (_, index) => journalEvent(fromSeq + index));
  return { ...base, window: { ...base.window, events, fromSeq, throughJournalSeq: pageThrough, beforeSeq: fromSeq > 0 ? fromSeq - 1 : null } } as unknown as Parameters<ClientSessionStore["applyEnvelope"]>[0];
}

describe("ClientSessionStore", () => {
  it("evicts a Session's cell and overlay, but never the selected Session", () => {
    const store = new ClientSessionStore();
    store.applySnapshot(snapshot("session-1", 3), { runtimeInstanceId: "runtime-1" });
    store.applyLiveEvent(live("session-1", 0));
    store.select("session-2");
    store.applySnapshot(snapshot("session-2", 1), { runtimeInstanceId: "runtime-1" });
    let notifications = 0;
    store.subscribe(() => { notifications += 1; });

    expect(store.evict("session-1")).toBe(true);
    expect(store.get("session-1")).toMatchObject({ snapshot: null, window: null, status: "idle", lastLiveSeq: -1 });
    expect(store.getOverlay("session-1")).toBeNull();
    expect(store.evict("session-2")).toBe(false);
    expect(store.get("session-2").snapshot?.throughJournalSeq).toBe(1);
    expect(store.cellIds()).toEqual(["session-2"]);
    expect(store.peek("session-1")).toBeNull();
    expect(store.peek("session-2")).toBe(store.get("session-2"));
    expect(notifications).toBe(0);

    // An evicted Session accepts live events from scratch again.
    store.applySnapshot(snapshot("session-1", 3), { runtimeInstanceId: "runtime-1" });
    expect(store.applyLiveEvent(live("session-1", 0))).toBe(true);
  });

  it("prepends an earlier history page in seq order, and keeps accepting live updates", () => {
    const store = new ClientSessionStore();
    expect(store.applyEnvelope(page("paged", 19, 10, 19))).toBe(true);
    expect(store.applyEnvelope(page("paged", 19, 0, 9))).toBe(true);
    const window = store.get("paged").window!;
    expect(window.events.map(event => event.seq)).toEqual(Array.from({ length: 20 }, (_, seq) => seq));
    expect(window).toMatchObject({ fromSeq: 0, throughJournalSeq: 19, beforeSeq: null });

    expect(store.applyJournalUpdate({ sessionId: "paged", throughJournalSeq: 20, values: {}, event: journalEvent(20) })).toBe(true);
    expect(store.get("paged").window!.events.map(event => event.seq).slice(-2)).toEqual([19, 20]);
  });

  it("keeps a live update that landed before an older earlier-page response", () => {
    const store = new ClientSessionStore();
    store.applyEnvelope(page("paged", 19, 10, 19));
    store.applyJournalUpdate({ sessionId: "paged", throughJournalSeq: 20, values: {}, event: journalEvent(20) });
    // The earlier page was requested at revision 19 and arrives after seq 20 was applied.
    expect(store.applyEnvelope(page("paged", 19, 0, 9))).toBe(true);
    const cell = store.get("paged");
    expect(cell.window!.events.map(event => event.seq)).toEqual(Array.from({ length: 21 }, (_, seq) => seq));
    expect(cell.window).toMatchObject({ fromSeq: 0, throughJournalSeq: 20, beforeSeq: null });
    expect(cell.snapshot?.throughJournalSeq).toBe(20);
  });

  it("coalesces a durable snapshot and its projections into one notification", () => {
    const store = new ClientSessionStore();
    let notifications = 0;
    store.subscribe(() => { notifications += 1; });

    store.batch(() => {
      store.applySnapshot(snapshot("session-1", 3), { runtimeInstanceId: "runtime-1" });
      store.applyProjectionValue({ sessionId: "session-1", key: "composer", throughJournalSeq: 3, value: { kind: "composer", schemaVersion: 1, sessionId: "session-1", throughJournalSeq: 3, phase: "active" } });
      store.applyProjectionValue({ sessionId: "session-1", key: "trajectory", throughJournalSeq: 3, value: { kind: "trajectory", schemaVersion: 1, sessionId: "session-1", throughJournalSeq: 3, nodes: [] } });
    });

    expect(notifications).toBe(1);
    expect(store.get("session-1").projectionValues.composer).toMatchObject({ phase: "active" });
    expect(store.get("session-1").projectionValues.trajectory).toMatchObject({ throughJournalSeq: 3 });
  });

  it("keeps a ready snapshot ready during a background refresh request", () => {
    const store = new ClientSessionStore();
    let notifications = 0;
    store.subscribe(() => { notifications += 1; });
    store.applySnapshot(snapshot("session-1", 0), { runtimeInstanceId: "runtime-1" });
    const generation = store.beginRequest("session-1", { preserveReady: true, notify: false });

    expect(generation).toBe(1);
    expect(store.get("session-1").status).toBe("ready");
    expect(notifications).toBe(1);
  });

  it("keeps one selected Session and rejects stale snapshots", () => {
    const store = new ClientSessionStore();
    store.select("session-1");
    const generation = store.beginRequest("session-1");
    expect(store.applySnapshot(snapshot("session-1", 4), { requestGeneration: generation, runtimeInstanceId: "runtime-1" })).toBe(true);
    expect(store.applySnapshot(snapshot("session-1", 3), { requestGeneration: generation, runtimeInstanceId: "runtime-1" })).toBe(false);
    expect(store.get("session-1").snapshot?.throughJournalSeq).toBe(4);
  });

  it("projects a durable mode change into the live snapshot", () => {
    const store = new ClientSessionStore();
    store.applyEnvelope({ ...envelope("session-1", 0, null), snapshot: { ...snapshot("session-1", 0), agentMode: "chat", agentModeRevision: 1 } });
    const applied = store.applyJournalUpdate({
      sessionId: "session-1", throughJournalSeq: 1,
      event: { recordKind: "event", seq: 1, type: "agent/mode-set", eventVersion: 1, criticality: "core", time: "2026-09-28T00:00:00.000Z", source: { kind: "runtime" }, data: { mode: "plan", revision: 2 }, surface: null, provenance: { emitter: "runtime" } },
      values: { agentMode: { mode: "plan", revision: 2 } },
    });
    expect(applied).toBe(true);
    expect(store.get("session-1").snapshot).toMatchObject({ agentMode: "plan", agentModeRevision: 2 });
  });

  it("does not treat other Sessions' live sequence numbers as a gap", () => {
    const store = new ClientSessionStore();
    store.applySnapshot(snapshot("session-1", 0), { runtimeInstanceId: "runtime-1" });
    expect(store.applyLiveEvent(live("session-1", 0))).toBe(true);
    expect(store.getOverlay("session-1")?.message).toBe("progress");
    expect(store.applyLiveEvent(live("session-1", 2))).toBe(true);
    expect(store.get("session-1").liveGap).toBe(false);
    expect(store.getOverlay("session-1")?.message).toBe("progress");
  });

  it("accepts revision-bound read-only projection values without replacing the durable snapshot", () => {
    const store = new ClientSessionStore();
    store.applySnapshot(snapshot("session-1", 3), { runtimeInstanceId: "runtime-1" });
    expect(store.applyProjectionValue({ sessionId: "session-1", key: "trajectory", throughJournalSeq: 3, value: { kind: "trajectory", schemaVersion: 1, sessionId: "session-1", throughJournalSeq: 3, nodes: [] } })).toBe(true);
    expect(store.get("session-1").projectionValues.trajectory).toMatchObject({ kind: "trajectory", throughJournalSeq: 3 });
    expect(store.get("session-1").snapshot?.throughJournalSeq).toBe(3);
  });

  it("accepts equal revision idempotently and requests resync on equal revision conflict", () => {
    const store = new ClientSessionStore();
    expect(store.applyEnvelope(envelope("session-1", 2, "A"))).toBe(true);
    expect(store.applyEnvelope(envelope("session-1", 2, "A"))).toBe(true);
    expect(store.applyEnvelope(envelope("session-1", 2, "B"))).toBe(false);
    expect(store.get("session-1")).toMatchObject({ status: "stale", liveGap: true });
    expect(store.get("session-1").snapshot?.metadata.title).toBe("A");
  });

  it("retains projection values from the initial empty-journal envelope", () => {
    const store = new ClientSessionStore();
    expect(store.applyEnvelope(envelope("session-empty", -1, "Empty"))).toBe(true);
    expect(store.get("session-empty").projectionValues.metadata).toMatchObject({ title: "Empty" });
    expect(store.get("session-empty").projectionRevisions.metadata).toBe(-1);
  });
});

it("accepts message surfaces after recovery/committed", () => {
  const store = new ClientSessionStore(); store.applyEnvelope(envelope("recovered", -1, null));
  for (const [seq, type] of ["recovery/start", "recovery/committed", "user/message"].entries()) {
    expect(store.applyJournalUpdate({ sessionId: "recovered", throughJournalSeq: seq, values: {}, event: {
      recordKind: "event", seq, type, eventVersion: 1, criticality: "core", time: "2026-10-04T00:00:00.000Z", source: { kind: "runtime" }, data: {}, provenance: { emitter: "runtime" },
      surface: type === "user/message" ? { kind: "append", node: { kind: "user", messageId: "next", content: "after recovery" } } : null,
    } })).toBe(true);
  }
  expect(store.get("recovered").snapshot?.messages).toEqual([expect.objectContaining({ messageId: "next", content: "after recovery" })]);
});
