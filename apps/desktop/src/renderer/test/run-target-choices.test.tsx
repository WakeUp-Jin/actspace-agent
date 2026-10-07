import { encodeSessionLocator } from "@actspace/shared/session-locator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useRunTarget } from "../target/use-run-target";
import { setupBridge } from "./helpers/bridge";

// 15 T14：新建页选择 Host / 工作区 / 模型的逻辑并进 useRunTarget，经 `choices` 交给 Composer 的 3 个 select。
const host = (hostId: string, name: string) => ({ id: hostId, hostId, name, endpoint: { kind: "wss", url: `wss://${hostId}` }, state: "connected" });
const describeHost = async (input: { hostId: string }) => ({
  state: "ready",
  workspaces: [{ id: `${input.hostId}-a`, name: "a", path: "/a" }, { id: `${input.hostId}-b`, name: "b", path: "/b" }],
  models: [{ id: `${input.hostId}/m`, name: "M" }], defaultModel: `${input.hostId}/m`,
});

function bridge(hosts: unknown[]) {
  const listeners = new Set<(hosts: unknown[]) => void>();
  const activate = vi.fn(async (_sessionId: string | null) => {});
  setupBridge({
    "hosts.list": async () => hosts, "hosts.call": describeHost, "hosts.activate": activate,
    "events.hostsChanged": (listener: (hosts: unknown[]) => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    "events.hostEvent": () => () => {},
  });
  return { activate, publish: (next: unknown[]) => act(() => { for (const listener of listeners) listener(next); }) };
}

afterEach(() => { window.localStorage.clear(); });

describe("useRunTarget choices", () => {
  const local = {};

  it("lets the new page pick a Host, its first workspace by default, then another workspace", async () => {
    bridge([host("one", "One"), host("two", "Two")]);
    const { result } = renderHook(() => useRunTarget({ sessionId: null, locked: false, local }));
    await waitFor(() => expect(result.current.choices.hosts).toHaveLength(2));
    expect(result.current.target.kind).toBe("local");
    act(() => result.current.choices.selectHost("one"));
    await waitFor(() => expect(result.current.target).toMatchObject({ kind: "remote", hostId: "one", hostName: "One", workspaceId: "one-a", workspaceName: "a" }));
    expect(result.current.choices.description?.models).toEqual([{ id: "one/m", name: "M" }]);
    expect(result.current.choices.modelId).toBe("one/m");
    act(() => result.current.choices.selectWorkspace("one-b"));
    expect(result.current.target).toMatchObject({ workspaceId: "one-b", workspaceName: "b" });
    // 换 Host 时工作区回到新 Host 的第一个。
    act(() => result.current.choices.selectHost("two"));
    await waitFor(() => expect(result.current.target).toMatchObject({ hostId: "two", hostName: "Two", workspaceId: "two-a" }));
    act(() => result.current.choices.selectHost(null));
    expect(result.current.target.kind).toBe("local");
  });

  it("keeps an existing session on its own Host and falls back to the id when the Host is not listed", async () => {
    bridge([host("other", "Other")]);
    const key = encodeSessionLocator({ hostId: "gone", sessionId: "s1" });
    const { result } = renderHook(() => useRunTarget({ sessionId: key, locked: true, local }));
    await waitFor(() => expect(result.current.choices.hosts).toHaveLength(1));
    act(() => result.current.choices.selectHost("other"));
    expect(result.current.target).toMatchObject({ kind: "remote", hostId: "gone", hostName: "gone" });
  });

  it("activates the session's Host on open and again when the Host list changes", async () => {
    const { activate, publish } = bridge([host("server", "Cloud")]);
    const key = encodeSessionLocator({ hostId: "server", sessionId: "s1" });
    const { result } = renderHook(() => useRunTarget({ sessionId: key, locked: true, local }));
    await waitFor(() => expect(result.current.choices.hosts).toHaveLength(1));
    const before = activate.mock.calls.length;
    expect(before).toBeGreaterThan(0);
    expect(activate).toHaveBeenLastCalledWith(key);
    publish([{ ...host("server", "Cloud"), state: "offline" }]);
    await waitFor(() => expect(activate.mock.calls.length).toBeGreaterThan(before));
    expect(activate).toHaveBeenLastCalledWith(key);
  });
});
