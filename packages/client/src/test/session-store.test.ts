import { describe, expect, it } from "vitest";
import { ClientSessionStore } from "../sessions/session.js";
import type { RuntimeV2LiveEvent, RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";

function snapshot(sessionId: string, throughJournalSeq: number): RuntimeV2SessionSnapshot {
  return {
    kind: "session-snapshot", schemaVersion: 1, sessionId, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z", workspaceRoot: null, throughJournalSeq, accessState: "read-write",
    metadata: { title: null, pinned: false, archived: false }, messages: [], tools: [], pendingInbox: [], todos: [], delegations: [], usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: null }, activity: { turnCount: 0, completedTurnCount: 0, stepCount: 0, activeTurnId: null, activeStepId: null, compactionCount: 0, activeCompactionId: null, lastCompactionSummary: null }, lineage: null,
  };
}

function live(sessionId: string, liveSeq: number, kind: RuntimeV2LiveEvent["kind"] = "runtime-live"): RuntimeV2LiveEvent {
  return { kind, schemaVersion: 1, runtimeInstanceId: "runtime-1", liveSeq, throughJournalSeq: 0, sessionId, message: "progress" };
}

describe("ClientSessionStore", () => {
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

  it("marks a live sequence gap stale and clears the overlay", () => {
    const store = new ClientSessionStore();
    store.applySnapshot(snapshot("session-1", 0), { runtimeInstanceId: "runtime-1" });
    expect(store.applyLiveEvent(live("session-1", 0))).toBe(true);
    expect(store.getOverlay("session-1")?.message).toBe("progress");
    expect(store.applyLiveEvent(live("session-1", 2))).toBe(false);
    expect(store.get("session-1").liveGap).toBe(true);
    expect(store.getOverlay("session-1")).toBeNull();
  });

  it("accepts revision-bound read-only projection values without replacing the durable snapshot", () => {
    const store = new ClientSessionStore();
    store.applySnapshot(snapshot("session-1", 3), { runtimeInstanceId: "runtime-1" });
    expect(store.applyProjectionValue({ sessionId: "session-1", key: "trajectory", throughJournalSeq: 3, value: { kind: "trajectory", schemaVersion: 1, sessionId: "session-1", throughJournalSeq: 3, nodes: [] } })).toBe(true);
    expect(store.get("session-1").projectionValues.trajectory).toMatchObject({ kind: "trajectory", throughJournalSeq: 3 });
    expect(store.get("session-1").snapshot?.throughJournalSeq).toBe(3);
  });
});
