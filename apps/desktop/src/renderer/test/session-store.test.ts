import { afterEach, describe, expect, it, vi } from "vitest";
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

// 14 T19：live 事件触发的 refresh 失败后按 1s、2s、4s 退避重试，错误经 cell 的 status/error 暴露。
describe("Desktop Session refresh retries", () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  function gapBridge(read: (attempt: number) => Promise<RuntimeV2DesktopSessionProjection>) {
    let emit!: (event: RuntimeV2LiveEvent) => void; let reads = 0;
    const bridge = createDesktopSessionBridge({
      getSessionProjectionSnapshot: () => read(reads++),
      onSessionLiveEvent: listener => { emit = event => listener({ event }); return () => {}; },
    });
    return { bridge, emit: (event: RuntimeV2LiveEvent) => emit(event), reads: () => reads };
  }
  const baseline = () => Promise.resolve(projectionFixture("s", 0, [event(0)]));
  const repaired = () => Promise.resolve(projectionFixture("s", 2, [event(0), event(1), event(2)]));

  it("sets the cell error on a failed refresh and clears it once a retry succeeds", async () => {
    vi.useFakeTimers();
    const { bridge, emit, reads } = gapBridge((attempt) => attempt === 0 ? baseline() : attempt === 1 ? Promise.reject(new Error("IPC 断开")) : repaired());
    bridge.start(); await bridge.open("s");
    emit(update(2));
    await vi.advanceTimersByTimeAsync(0);
    expect(reads()).toBe(2);
    expect(bridge.store.get("s")).toMatchObject({ status: "error", error: "IPC 断开" });

    await vi.advanceTimersByTimeAsync(999);
    expect(reads()).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(reads()).toBe(3);
    expect(bridge.store.get("s")).toMatchObject({ status: "ready", error: null });
    expect(bridge.store.get("s").window?.throughJournalSeq).toBe(2);
    bridge.dispose();
  });

  it("gives up after three retries spaced 1s, 2s, 4s and leaves the error on the cell", async () => {
    vi.useFakeTimers();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { bridge, emit, reads } = gapBridge((attempt) => attempt === 0 ? baseline() : Promise.reject(new Error("Host 不可用")));
    bridge.start(); await bridge.open("s");
    emit(update(2));
    await vi.advanceTimersByTimeAsync(0);
    expect(reads()).toBe(2);
    for (const [delay, expected] of [[1000, 3], [2000, 4], [4000, 5]] as const) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(reads()).toBe(expected - 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(reads()).toBe(expected);
    }
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reads()).toBe(5);
    expect(bridge.store.get("s")).toMatchObject({ status: "error", error: "Host 不可用" });
    expect(error).toHaveBeenCalledWith("Session refresh failed after retries", expect.any(Error));
    bridge.dispose();
  });

  it("stops retrying once disposed", async () => {
    vi.useFakeTimers();
    const { bridge, emit, reads } = gapBridge((attempt) => attempt === 0 ? baseline() : Promise.reject(new Error("断开")));
    bridge.start(); await bridge.open("s");
    emit(update(2));
    await vi.advanceTimersByTimeAsync(0);
    bridge.dispose();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reads()).toBe(2);
  });
});

it('observes related sessions without selecting them and stops repairing after release', async () => {
  let emit!: (event: RuntimeV2LiveEvent) => void;
  const read = vi.fn(async ({ sessionId }: { sessionId: string }) => projectionFixture(sessionId, 0, [event(0)]));
  const bridge = createDesktopSessionBridge({ getSessionProjectionSnapshot: read, onSessionLiveEvent: listener => { emit = event => listener({ event }); return () => {}; } });
  bridge.start(); await bridge.open('parent');
  const release = bridge.watch('s');
  await vi.waitFor(() => expect(bridge.store.get('s').snapshot).not.toBeNull());
  expect(bridge.store.selectedSessionId).toBe('parent');
  emit(update(1));
  expect(bridge.store.get('s').window?.events).toHaveLength(2);
  release();
  emit(update(3));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(read).toHaveBeenCalledTimes(2);
  expect(bridge.store.selectedSessionId).toBe('parent');
  bridge.dispose();
});

it('keeps related-session read failures visible and retries without changing the parent', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  let fail = true;
  const bridge = createDesktopSessionBridge({ getSessionProjectionSnapshot: async ({ sessionId }) => {
    if (sessionId === 'child' && fail) throw new Error('child unavailable');
    return projectionFixture(sessionId);
  }, onSessionLiveEvent: () => () => {} }, undefined, { retryDelaysMs: [] });
  bridge.start(); await bridge.open('parent');
  const release = bridge.watch('child');
  await vi.waitFor(() => expect(bridge.store.get('child').error).toBe('child unavailable'));
  fail = false; await bridge.refreshRelated('child');
  expect(bridge.store.get('child').error).toBeNull();
  expect(bridge.store.selectedSessionId).toBe('parent');
  release(); bridge.dispose(); error.mockRestore();
});
