import { encodeSessionLocator } from "@actspace/shared/session-locator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createRemoteSessionPrefsStore, remoteSessionPrefs, REMOTE_SESSION_PREFS_KEY, resolveRemoteWorkspaceId } from "../target/remote-session-prefs";
import { useRunTarget } from "../target/use-run-target";
import { setupBridge } from "./helpers/bridge";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: vi.fn((key: string) => data.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { data.set(key, value); }), data };
}

const description = { state: "ready", workspaces: [{ id: "w1", name: "api", path: "/srv/api" }, { id: "w2", name: "web", path: "/srv/web" }], models: [], defaultModel: "" };

describe("remote session prefs store", () => {
  it("merges patches, skips unchanged writes and persists", () => {
    const storage = memoryStorage();
    const store = createRemoteSessionPrefsStore(() => storage, () => 7);
    const listener = vi.fn();
    store.subscribe(listener);
    store.set("host:a", { workspaceId: "w1" });
    store.set("host:a", { modelId: "m" });
    store.set("host:a", { workspaceId: "w1" });
    expect(store.get("host:a")).toEqual({ workspaceId: "w1", modelId: "m", recordedAt: 7 });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(JSON.parse(storage.data.get(REMOTE_SESSION_PREFS_KEY)!)).toEqual({ "host:a": { workspaceId: "w1", modelId: "m", recordedAt: 7 } });
    store.remove("host:a");
    expect(store.get("host:a")).toBeUndefined();
    expect(JSON.parse(storage.data.get(REMOTE_SESSION_PREFS_KEY)!)).toEqual({});
  });

  it("treats corrupt or unavailable storage as empty", () => {
    expect(createRemoteSessionPrefsStore(() => memoryStorage({ [REMOTE_SESSION_PREFS_KEY]: "{oops" })).get("host:a")).toBeUndefined();
    expect(createRemoteSessionPrefsStore(() => memoryStorage({ [REMOTE_SESSION_PREFS_KEY]: "[1]" })).get("0")).toBeUndefined();
    const failing = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); } };
    const store = createRemoteSessionPrefsStore(() => failing);
    store.set("host:a", { workspaceId: "w1" });
    expect(store.get("host:a")?.workspaceId).toBe("w1");
  });

  it("resolves the workspace from the record first and from the path otherwise", () => {
    expect(resolveRemoteWorkspaceId({ workspaceId: "w2", recordedAt: 1 }, "/srv/api", description)).toEqual({ workspaceId: "w2", fromPath: false });
    expect(resolveRemoteWorkspaceId(undefined, "/srv/api", description)).toEqual({ workspaceId: "w1", fromPath: true });
    expect(resolveRemoteWorkspaceId(undefined, "/srv/gone", description)).toEqual({ workspaceId: "", fromPath: false });
    expect(resolveRemoteWorkspaceId(undefined, "/srv/api", undefined)).toEqual({ workspaceId: "", fromPath: false });
    // 复核：记录的 id 在 Host 上已经没有（id 改了、路径没变）时按路径找回，并写回新 id。
    expect(resolveRemoteWorkspaceId({ workspaceId: "renamed", recordedAt: 1 }, "/srv/web", description)).toEqual({ workspaceId: "w2", fromPath: true });
    // 路径也对不上时保留记录的 id，readiness 给出 workspace-missing 和这个 id。
    expect(resolveRemoteWorkspaceId({ workspaceId: "renamed", recordedAt: 1 }, "/srv/gone", description)).toEqual({ workspaceId: "renamed", fromPath: false });
    // describe 还没回来时不判断记录是否失效。
    expect(resolveRemoteWorkspaceId({ workspaceId: "renamed", recordedAt: 1 }, "/srv/web", undefined)).toEqual({ workspaceId: "renamed", fromPath: false });
  });
});

describe("useRunTarget workspace write-back", () => {
  const key = encodeSessionLocator({ hostId: "server", sessionId: "s1" });
  afterEach(() => { remoteSessionPrefs.remove(key); });

  it("looks an old session's workspace up by path once and records it", async () => {
    const call = vi.fn(async () => description);
    setupBridge({
      "hosts.list": async () => [{ id: "server", hostId: "server", name: "Cloud", endpoint: { kind: "wss", url: "wss://cloud" }, state: "connected" }],
      "hosts.call": call, "hosts.activate": async () => {},
      "events.hostsChanged": () => () => {}, "events.hostEvent": () => () => {},
    });
    const local = {};
    const { result, rerender } = renderHook((props: { path: string }) => useRunTarget({ sessionId: key, sessionWorkspacePath: props.path, locked: true, local }), { initialProps: { path: "/srv/web" } });
    await waitFor(() => expect(result.current.target).toMatchObject({ kind: "remote", hostId: "server", hostName: "Cloud", workspaceId: "w2", workspaceName: "web" }));
    expect(remoteSessionPrefs.get(key)?.workspaceId).toBe("w2");
    expect(result.current.capabilities.newWorktree.enabled).toBe(false);
    // 用第二个工作区：没有解析时新建页默认选第一个，不能碰巧对上。记下之后不再反查，路径变了也仍用记录的工作区。
    rerender({ path: "/srv/api" });
    expect(result.current.target).toMatchObject({ workspaceId: "w2" });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("keeps the same value while nothing changes", async () => {
    const local = { workspaceRoot: "/repo", branch: "main" };
    const { result, rerender } = renderHook(() => useRunTarget({ sessionId: null, locked: false, local }));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(first.target).toEqual({ kind: "local", workspaceRoot: "/repo", branch: "main", worktree: undefined });
  });
});
