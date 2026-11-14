import { describe, expect, it, vi } from "vitest";
import { ClientSessionStore } from "@actspace/client/sessions";
import { createDesktopSessionBridge } from "../session/desktop-session-bridge";

function bridgeFixture() {
  const setObservedSessions = vi.fn();
  const store = new ClientSessionStore();
  const bridge = createDesktopSessionBridge(
    {
      getSessionProjectionSnapshot: () => new Promise<never>(() => undefined),
      onSessionLiveEvent: () => () => undefined,
      setObservedSessions,
    },
    store,
    { retryDelaysMs: [] },
  );
  return { bridge, store, setObservedSessions };
}

describe("observed Session report", () => {
  it("reports the selected and watched Sessions as one replaced set, only when it changes", () => {
    const { bridge, store, setObservedSessions } = bridgeFixture();
    bridge.start();
    expect(setObservedSessions).toHaveBeenLastCalledWith([]);
    store.select("b");
    expect(setObservedSessions).toHaveBeenLastCalledWith(["b"]);
    const stopA = bridge.watch("a");
    expect(setObservedSessions).toHaveBeenLastCalledWith(["a", "b"]);
    const calls = setObservedSessions.mock.calls.length;
    // 同一选中会话的 cell 变化不重复上报。
    store.beginRequest("b");
    const stopAgain = bridge.watch("a");
    expect(setObservedSessions).toHaveBeenCalledTimes(calls);
    stopAgain();
    expect(setObservedSessions).toHaveBeenCalledTimes(calls);
    stopA();
    expect(setObservedSessions).toHaveBeenLastCalledWith(["b"]);
    bridge.dispose();
  });

  it("does not report on dispose, and a restarted bridge reports its set again", () => {
    const { bridge, store, setObservedSessions } = bridgeFixture();
    bridge.start();
    store.select("x");
    const calls = setObservedSessions.mock.calls.length;
    bridge.dispose();
    expect(setObservedSessions).toHaveBeenCalledTimes(calls);
    store.select("y");
    expect(setObservedSessions).toHaveBeenCalledTimes(calls);
    bridge.start();
    expect(setObservedSessions).toHaveBeenLastCalledWith(["y"]);
    bridge.dispose();
  });

  it("works without a reporter (web and tests)", () => {
    const store = new ClientSessionStore();
    const bridge = createDesktopSessionBridge(
      {
        getSessionProjectionSnapshot: () => new Promise<never>(() => undefined),
        onSessionLiveEvent: () => () => undefined,
      },
      store,
    );
    bridge.start();
    expect(() => {
      store.select("a");
      bridge.watch("b")();
    }).not.toThrow();
    bridge.dispose();
  });
});
