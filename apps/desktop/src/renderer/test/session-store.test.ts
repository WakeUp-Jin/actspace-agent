import { describe, expect, it } from "vitest";
import { createDesktopSessionBridge } from "../session/desktop-session-bridge";
import type { RuntimeV2LiveEvent, RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";

function snapshot(sessionId: string): RuntimeV2SessionSnapshot {
  return {
    kind: "session-snapshot", schemaVersion: 1, sessionId, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z", workspaceRoot: null, throughJournalSeq: 0, accessState: "read-write",
    metadata: { title: null, pinned: false, archived: false }, messages: [], tools: [], pendingInbox: [], todos: [], delegations: [], usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: null }, activity: { turnCount: 0, completedTurnCount: 0, stepCount: 0, activeTurnId: null, activeStepId: null, compactionCount: 0, activeCompactionId: null, lastCompactionSummary: null }, lineage: null,
  };
}

function live(sessionId: string, throughJournalSeq: number): RuntimeV2LiveEvent {
  return {
    kind: "run-state",
    schemaVersion: 1,
    runtimeInstanceId: "runtime-1",
    liveSeq: throughJournalSeq + 1,
    throughJournalSeq,
    sessionId,
  };
}

describe("DesktopSessionBridge", () => {
  it("loads only the explicitly selected Session through the typed transport", async () => {
    const requested: string[] = [];
    const bridge = createDesktopSessionBridge({
      getSessionProjectionSnapshot: async ({ sessionId }) => { requested.push(sessionId); return { kind: "session-projection", schemaVersion: 1, sessionId, throughJournalSeq: 0, snapshot: snapshot(sessionId), values: {} }; },
      onSessionLiveEvent: () => () => undefined,
    });
    await bridge.open("session-1");
    expect(requested).toEqual(["session-1"]);
    expect(bridge.store.selectedSessionId).toBe("session-1");
    expect(bridge.store.get("session-1").snapshot?.sessionId).toBe("session-1");
  });

  it("refreshes a selected projection when a live event advances the Journal revision", async () => {
    let emit: ((event: RuntimeV2LiveEvent) => void) | undefined;
    let inspectCount = 0;
    const bridge = createDesktopSessionBridge({
      getSessionProjectionSnapshot: async ({ sessionId }) => {
        inspectCount += 1;
        const throughJournalSeq = inspectCount === 1 ? 0 : 1;
        return {
          kind: "session-projection",
          schemaVersion: 1,
          sessionId,
          throughJournalSeq,
          snapshot: { ...snapshot(sessionId), throughJournalSeq },
          values: {
            composer: {
              kind: "composer",
              schemaVersion: 1,
              sessionId,
              throughJournalSeq,
              phase: throughJournalSeq === 0 ? "blank" : "active",
            },
          },
        };
      },
      onSessionLiveEvent: (listener) => {
        emit = (event) => listener({ event });
        return () => { emit = undefined; };
      },
    });

    bridge.start();
    await bridge.open("session-1");
    expect(bridge.store.get("session-1").status).toBe("ready");
    emit?.(live("session-1", 1));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(inspectCount).toBe(2);
    expect(bridge.store.get("session-1").snapshot?.throughJournalSeq).toBe(1);
    expect(bridge.store.get("session-1").projectionValues.composer).toMatchObject({ phase: "active", throughJournalSeq: 1 });
    expect(bridge.store.getOverlay("session-1")).toBeNull();
    bridge.dispose();
  });
});

it('keeps expanded history on live refresh and rejects mixed-revision envelopes', async () => {
  let emit: ((event: RuntimeV2LiveEvent) => void) | undefined;
  const cursors: (number | undefined)[] = [];
  let revision = 100;
  let inconsistent = false;
  const bridge = createDesktopSessionBridge({
    getSessionProjectionSnapshot: async ({ sessionId, trajectoryFromSeq }) => {
      cursors.push(trajectoryFromSeq);
      return { kind: 'session-projection', schemaVersion: 1, sessionId, throughJournalSeq: revision, snapshot: { ...snapshot(sessionId), throughJournalSeq: revision }, values: {
        trajectory: { kind: 'trajectory', schemaVersion: 1, sessionId, throughJournalSeq: inconsistent ? revision - 1 : revision, nodes: [], history: { fromSeq: trajectoryFromSeq ?? 80, previousFromSeq: trajectoryFromSeq === 0 ? null : 0, turnOffset: 0 } },
      } };
    },
    onSessionLiveEvent: listener => { emit = event => listener({ event }); return () => { emit = undefined; }; },
  });
  bridge.start();
  await bridge.open('s');
  await bridge.loadEarlierHistory('s');
  revision++;
  emit?.(live('s', revision));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(cursors).toEqual([undefined, 0, 0]);
  expect(bridge.store.get('s').projectionValues.trajectory).toMatchObject({ history: { fromSeq: 0 }, throughJournalSeq: 101 });
  inconsistent = true;
  await expect(bridge.open('s')).rejects.toThrow('revision mismatch');
  expect(bridge.store.get('s').projectionValues.trajectory).toMatchObject({ throughJournalSeq: 101 });
  bridge.dispose();
});

it('refreshes after a runtime change even when its live revision is zero', async () => {
  let emit: ((event: RuntimeV2LiveEvent) => void) | undefined;
  let reads = 0;
  const bridge = createDesktopSessionBridge({
    getSessionProjectionSnapshot: async ({ sessionId }) => { reads++; return { kind: 'session-projection', schemaVersion: 1, sessionId, throughJournalSeq: 50, snapshot: { ...snapshot(sessionId), throughJournalSeq: 50 }, values: {} }; },
    onSessionLiveEvent: listener => { emit = event => listener({ event }); return () => undefined; },
  });
  bridge.start(); await bridge.open('s');
  emit?.({ ...live('s', 0), liveSeq: 1 });
  emit?.({ ...live('s', 0), liveSeq: 1, runtimeInstanceId: 'runtime-2' });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(reads).toBe(2);
  expect(bridge.store.get('s').liveGap).toBe(false);
  bridge.dispose();
});

it('does not apply a reply after switching Sessions or disposing the bridge', async () => {
  let resolve!: (value: import('@actspace/shared/runtime-v2').RuntimeV2DesktopSessionProjection) => void;
  const bridge = createDesktopSessionBridge({
    getSessionProjectionSnapshot: () => new Promise(done => { resolve = done; }),
    onSessionLiveEvent: () => () => undefined,
  });
  const loading = bridge.open('old');
  bridge.store.select('new');
  resolve({ kind: 'session-projection', schemaVersion: 1, sessionId: 'old', throughJournalSeq: 0, snapshot: snapshot('old'), values: {} });
  await expect(loading).rejects.toThrow('selection changed');
  expect(bridge.store.get('new').snapshot).toBeNull();
  const disposed = bridge.open('new'); bridge.dispose();
  resolve({ kind: 'session-projection', schemaVersion: 1, sessionId: 'new', throughJournalSeq: 0, snapshot: snapshot('new'), values: {} });
  await expect(disposed).rejects.toThrow();
  expect(bridge.store.get('new').snapshot).toBeNull();
});
