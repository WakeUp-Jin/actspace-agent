import { describe, expect, it, vi } from "vitest";
import type { RuntimeV2DesktopLiveEnvelope } from "@actspace/shared/runtime-v2";
import { createLiveEventHub } from "../api/live-events";

// 14 T17：sessionLive 全局只订阅一次，按 message 分发。
function envelope(message: string | null, sessionId = "s1"): RuntimeV2DesktopLiveEnvelope {
  return {
    event: { kind: "runtime-live", schemaVersion: 1, runtimeInstanceId: "rt", liveSeq: 1, throughJournalSeq: 0, sessionId, message },
    emittedAt: "2026-10-06T00:00:00.000Z",
  };
}

function fakeSource() {
  const listeners = new Set<(envelope: RuntimeV2DesktopLiveEnvelope) => void>();
  const release = vi.fn();
  const source = vi.fn((listener: (envelope: RuntimeV2DesktopLiveEnvelope) => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); release(); };
  });
  const emit = (value: RuntimeV2DesktopLiveEnvelope) => { for (const listener of [...listeners]) listener(value); };
  return { source, release, emit, size: () => listeners.size };
}

describe("live event hub", () => {
  it("shares one bridge subscription across consumers and releases it with the last one", () => {
    const { source, release, emit, size } = fakeSource();
    const hub = createLiveEventHub(source);
    const all = vi.fn();
    const queue = vi.fn();
    const title = vi.fn();
    const offAll = hub.subscribe(all);
    const offQueue = hub.onMessage("task-queue-updated", queue);
    const offTitle = hub.onMessage("session-title-updated", title);
    expect(source).toHaveBeenCalledTimes(1);

    emit(envelope("task-queue-updated"));
    emit(envelope(null));
    expect(all).toHaveBeenCalledTimes(2);
    expect(queue).toHaveBeenCalledTimes(1);
    expect(queue.mock.calls[0]![0].event.sessionId).toBe("s1");
    expect(title).not.toHaveBeenCalled();

    offAll();
    offQueue();
    // 重复退订不影响仍在的消费者。
    offQueue();
    expect(release).not.toHaveBeenCalled();
    emit(envelope("session-title-updated"));
    expect(title).toHaveBeenCalledTimes(1);

    offTitle();
    expect(release).toHaveBeenCalledTimes(1);
    expect(size()).toBe(0);

    // 再有消费者时重新订阅（例如 bridge 已被替换）。
    const again = vi.fn();
    const offAgain = hub.subscribe(again);
    expect(source).toHaveBeenCalledTimes(2);
    emit(envelope("task-queue-updated"));
    expect(again).toHaveBeenCalledTimes(1);
    offAgain();
    expect(release).toHaveBeenCalledTimes(2);
  });

  it("keeps delivering to other consumers when one throws, and counts a reused listener twice", () => {
    const { source, emit } = fakeSource();
    const hub = createLiveEventHub(source);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const after = vi.fn();
    hub.subscribe(() => { throw new Error("boom"); });
    const offFirst = hub.subscribe(after);
    hub.subscribe(after);
    emit(envelope("task-queue-updated"));
    expect(after).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledWith("Live event listener failed", expect.any(Error));
    offFirst();
    emit(envelope("task-queue-updated"));
    expect(after).toHaveBeenCalledTimes(3);
    error.mockRestore();
  });
});
