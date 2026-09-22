import { describe, expect, it } from "vitest";
import { createDesktopSessionBridge } from "../session/desktop-session-bridge";
import { projectionFixture } from "./projection-fixture";
import type { RuntimeV2DesktopSessionProjection, RuntimeV2LiveEvent, SessionEventEnvelopeV1 } from "@actspace/shared/runtime-v2";

function event(seq: number): SessionEventEnvelopeV1 {
  return { recordKind: "event", seq, type: "session/title-set", eventVersion: 1, criticality: "ignorable", time: "2026-09-21T00:00:00Z", source: { ownerPluginId: "@actspace/core" }, data: { title: "new" }, surface: null, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } };
}
function update(seq: number, liveSeq = seq + 1): RuntimeV2LiveEvent {
  return { kind: "journal-update", schemaVersion: 1, runtimeInstanceId: "r1", liveSeq, sessionId: "s", throughJournalSeq: seq,
    update: { sessionId: "s", throughJournalSeq: seq, event: event(seq), values: { metadata: { title: "new", pinned: false, archived: false } } } };
}
describe("Desktop Session event transport", () => {
  it("applies Host values and raw events without re-reading; process-wide live gaps are not Session gaps", async () => {
    let emit!: (event: RuntimeV2LiveEvent) => void; let reads = 0;
    const bridge = createDesktopSessionBridge({
      getSessionProjectionSnapshot: async () => { reads++; return projectionFixture("s", 0, [event(0)]); },
      onSessionLiveEvent: listener => { emit = event => listener({ event }); return () => {}; },
    });
    bridge.start(); await bridge.open("s");
    emit(update(1, 100)); emit(update(2, 200));
    expect(reads).toBe(1);
    expect(bridge.store.get("s").window?.events.map(event => event.seq)).toEqual([0, 1, 2]);
    expect(bridge.store.get("s").snapshot?.metadata.title).toBe("new");
    bridge.dispose();
  });

  it("repairs a missing Journal event with one baseline read", async () => {
    let emit!: (event: RuntimeV2LiveEvent) => void; let reads = 0;
    const bridge = createDesktopSessionBridge({
      getSessionProjectionSnapshot: async () => { const seq = reads++ ? 2 : 0; return projectionFixture("s", seq, Array.from({ length: seq + 1 }, (_, seq) => event(seq))); },
      onSessionLiveEvent: listener => { emit = event => listener({ event }); return () => {}; },
    });
    bridge.start(); await bridge.open("s"); emit(update(2));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(reads).toBe(2); expect(bridge.store.get("s").window?.throughJournalSeq).toBe(2);
    expect(bridge.store.get("s").liveGap).toBe(false); bridge.dispose();
  });

  it("prepends old pages without rolling back newer Host facts or reloading the expanded tail", async () => {
    let resolve!: (value: RuntimeV2DesktopSessionProjection) => void;
    const tail = projectionFixture("s", 2, [event(2)]);
    const bridge = createDesktopSessionBridge({
      getSessionProjectionSnapshot: async input => input.beforeSeq === undefined ? { ...tail, window: { ...tail.window, fromSeq: 2, beforeSeq: 2 } } : new Promise(done => { resolve = done; }),
      onSessionLiveEvent: () => () => {},
    });
    await bridge.open("s"); const loading = bridge.loadEarlierHistory("s");
    bridge.store.applyJournalUpdate(update(3).update!);
    const older = projectionFixture("s", 2, [event(0), event(1)]);
    resolve({ ...older, window: { ...older.window, throughJournalSeq: 1 } });
    await loading;
    expect(bridge.store.get("s").window?.events.map(event => event.seq)).toEqual([0, 1, 2, 3]);
    expect(bridge.store.get("s").snapshot?.metadata.title).toBe("new");
    bridge.dispose();
  });

  it("rejects mixed identity and does not apply responses after disposal", async () => {
    const bridge = createDesktopSessionBridge({ getSessionProjectionSnapshot: async () => projectionFixture("other"), onSessionLiveEvent: () => () => {} });
    await expect(bridge.open("s")).rejects.toThrow("identity mismatch");
    let resolve!: (value: RuntimeV2DesktopSessionProjection) => void;
    const pending = createDesktopSessionBridge({ getSessionProjectionSnapshot: () => new Promise(done => { resolve = done; }), onSessionLiveEvent: () => () => {} });
    const loading = pending.open("s"); pending.dispose(); resolve(projectionFixture("s")); await loading;
    expect(pending.store.get("s").snapshot).toBeNull();
  });
});
