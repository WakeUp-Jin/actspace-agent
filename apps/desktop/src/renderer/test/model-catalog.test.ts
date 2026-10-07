import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { encodeSessionLocator } from "@actspace/shared/session-locator";
import { createRemoteSessionPrefsStore, remoteSessionPrefs } from "../target/remote-session-prefs";
import type { HostDescription } from "../target/host-directory";
import {
  LEGACY_REMOTE_MODELS_KEY, NEW_SESSION_MODEL_PREFIX, createNewSessionModelStore, hostModelCatalog, localModelCatalog,
  migrateLegacyRemoteModels, resolveRemoteModel, useModelCatalog, useRemoteModel,
} from "../target/use-model-catalog";
import { setupBridge } from "./helpers/bridge";

// 15 T8：本机和远端共用的模型目录；远端模型的记忆规则和旧 key 迁移。

const description: HostDescription = { state: "ready", workspaces: [], models: [{ id: "a", name: "Model A" }, { id: "b", name: "Model B" }], defaultModel: "a" };
const remoteKey = encodeSessionLocator({ hostId: "server", sessionId: "s1" });
const otherKey = encodeSessionLocator({ hostId: "server", sessionId: "s2" });

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

function bridgeWithHost() {
  setupBridge({
    "hosts.list": async () => [{ id: "server", hostId: "server", name: "Cloud", endpoint: { kind: "wss", url: "wss://cloud" }, state: "connected" }],
    "events.hostsChanged": () => () => {}, "events.hostEvent": () => () => {},
    "hosts.call": async () => description,
  });
}

afterEach(() => {
  cleanup();
  remoteSessionPrefs.remove(remoteKey);
  remoteSessionPrefs.remove(otherKey);
  window.localStorage.clear();
});

describe("catalog shape", () => {
  it("groups local models by provider connection", () => {
    const catalog = localModelCatalog([
      { id: "deepseek:chat", label: "Chat", provider: "deepseek", apiModel: "deepseek-chat" },
      { id: "kimi:k2", label: "K2", provider: "kimi", apiModel: "kimi-k2" },
    ], "deepseek:chat");
    expect(catalog.source).toBe("local-providers");
    expect(catalog.defaultModelId).toBe("deepseek:chat");
    expect(catalog.groups.flatMap((group) => group.models.map((model) => model.id)).sort()).toEqual(["deepseek:chat", "kimi:k2"]);
    expect(catalog.groups.every((group) => group.models.length === 1)).toBe(true);
  });

  it("puts Host models in one group titled with the Host name", () => {
    expect(hostModelCatalog("Cloud", description)).toEqual({
      source: "host", defaultModelId: "a",
      groups: [{ key: "host", label: "Cloud", models: [{ id: "a", label: "Model A" }, { id: "b", label: "Model B" }] }],
    });
    expect(hostModelCatalog("Cloud", undefined)).toEqual({ source: "host", groups: [] });
  });

  it("falls back to the Host default when the recorded model is gone", () => {
    expect(resolveRemoteModel("b", description)).toBe("b");
    expect(resolveRemoteModel("gone", description)).toBe("a");
    expect(resolveRemoteModel(undefined, description)).toBe("a");
    expect(resolveRemoteModel("b", undefined)).toBe("b");
  });
});

describe("migrateLegacyRemoteModels", () => {
  it("moves remote entries to the new stores and deletes the old key", () => {
    const storage = memoryStorage({ [LEGACY_REMOTE_MODELS_KEY]: JSON.stringify({ [remoteKey]: "b", "local-session": "x", "new:server": "b", "new:local": "y", "new:other": "c" }) });
    const prefs = createRemoteSessionPrefsStore(() => storage);
    const models = createNewSessionModelStore(() => storage);
    migrateLegacyRemoteModels(storage, prefs, models);
    expect(storage.data.has(LEGACY_REMOTE_MODELS_KEY)).toBe(false);
    expect(prefs.get(remoteKey)?.modelId).toBe("b");
    expect(prefs.get("local-session")).toBeUndefined();
    expect(models.get("server")).toBe("b");
    expect(models.get("other")).toBe("c");
    expect(models.get("local")).toBeUndefined();
  });

  it("does not overwrite newer records, and drops a corrupt value", () => {
    const storage = memoryStorage({ [LEGACY_REMOTE_MODELS_KEY]: JSON.stringify({ [remoteKey]: "old", "new:server": "old" }), [`${NEW_SESSION_MODEL_PREFIX}server`]: "new" });
    const prefs = createRemoteSessionPrefsStore(() => storage);
    prefs.set(remoteKey, { modelId: "new" });
    const models = createNewSessionModelStore(() => storage);
    migrateLegacyRemoteModels(storage, prefs, models);
    expect(prefs.get(remoteKey)?.modelId).toBe("new");
    expect(models.get("server")).toBe("new");

    const corrupt = memoryStorage({ [LEGACY_REMOTE_MODELS_KEY]: "{not json" });
    migrateLegacyRemoteModels(corrupt, createRemoteSessionPrefsStore(() => corrupt), createNewSessionModelStore(() => corrupt));
    expect(corrupt.data.size).toBe(0);
  });

  it("does nothing without the old key", () => {
    const storage = memoryStorage();
    migrateLegacyRemoteModels(storage, createRemoteSessionPrefsStore(() => storage), createNewSessionModelStore(() => storage));
    expect(storage.data.size).toBe(0);
  });
});

describe("useRemoteModel", () => {
  it("remembers the last model per Host on the new-session page", async () => {
    bridgeWithHost();
    const first = renderHook(() => useRemoteModel(null, "server"));
    await waitFor(() => expect(first.result.current.modelId).toBe("a"));
    act(() => first.result.current.selectModel("b"));
    expect(first.result.current.modelId).toBe("b");
    first.unmount();
    expect(window.localStorage.getItem(`${NEW_SESSION_MODEL_PREFIX}server`)).toBe("b");
    const again = renderHook(() => useRemoteModel(null, "server"));
    await waitFor(() => expect(again.result.current.modelId).toBe("b"));
  });

  it("keeps each remote Session's model when switching between Sessions", async () => {
    bridgeWithHost();
    const hook = renderHook(({ sessionId }) => useRemoteModel(sessionId, "server"), { initialProps: { sessionId: remoteKey } });
    await waitFor(() => expect(hook.result.current.modelId).toBe("a"));
    act(() => hook.result.current.selectModel("b"));
    expect(remoteSessionPrefs.get(remoteKey)?.modelId).toBe("b");
    hook.rerender({ sessionId: otherKey });
    expect(hook.result.current.modelId).toBe("a");
    hook.rerender({ sessionId: remoteKey });
    expect(hook.result.current.modelId).toBe("b");
  });

  it("falls back to the Host's last new-session model for a Session without a record", async () => {
    // 与改造前一致：旧会话没有自己的记录时，用该 Host 新建页上次选的模型。
    bridgeWithHost();
    window.localStorage.setItem(`${NEW_SESSION_MODEL_PREFIX}server`, "b");
    const hook = renderHook(() => useRemoteModel(remoteKey, "server"));
    await waitFor(() => expect(hook.result.current.modelId).toBe("b"));
  });

  it("is empty and inert on the local machine", () => {
    const hook = renderHook(() => useRemoteModel(null, null));
    expect(hook.result.current.modelId).toBe("");
    act(() => hook.result.current.selectModel("b"));
    expect(window.localStorage.length).toBe(0);
  });
});

describe("useModelCatalog", () => {
  it("returns the Host catalog for a remote target and the local one otherwise", async () => {
    bridgeWithHost();
    const onSelect = () => {};
    const local = { models: [{ id: "deepseek:chat", label: "Chat", provider: "deepseek" as const, apiModel: "deepseek-chat" }], selectedModelId: "deepseek:chat", onSelect };
    const remote = renderHook(() => useModelCatalog({ kind: "remote", hostId: "server", hostName: "Cloud" }, null, local));
    await waitFor(() => expect(remote.result.current.catalog.groups[0]?.label).toBe("Cloud"));
    expect(remote.result.current.selectedModelId).toBe("a");
    const localHook = renderHook(() => useModelCatalog({ kind: "local" }, null, local));
    expect(localHook.result.current.catalog.source).toBe("local-providers");
    expect(localHook.result.current.selectedModelId).toBe("deepseek:chat");
    expect(localHook.result.current.selectModel).toBe(onSelect);
  });
});
