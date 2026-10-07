import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSettings } from "../components/settings/use-settings";
import { setupBridge } from "./helpers/bridge";

const legacy = (defaultModelId: string) => ({ defaultModelId, providers: {}, agent: { systemPromptPath: "/tmp/a.md" } }) as never;
const snapshot = (revision: string) => ({ revision, settings: { general: { performanceMonitoring: false } } }) as never;

async function setup(overrides: Parameters<typeof setupBridge>[0] = {}) {
  const get = vi.fn(async () => legacy("loaded"));
  setupBridge({ "settings.get": get, "settings.getV4": async () => snapshot("r1"), ...overrides });
  const onSettingsChange = vi.fn();
  const hook = renderHook(() => useSettings(onSettingsChange));
  await waitFor(() => expect(hook.result.current.settingsV4).not.toBeNull());
  return { hook, get, onSettingsChange };
}

describe("useSettings", () => {
  it("loads both snapshots and reports a load failure", async () => {
    const { hook, onSettingsChange } = await setup();
    expect(hook.result.current.settings).toEqual(legacy("loaded"));
    expect(onSettingsChange).not.toHaveBeenCalled();

    vi.spyOn(console, "error").mockImplementation(() => {});
    setupBridge({ "settings.get": async () => { throw new Error("boom"); } });
    const failed = renderHook(() => useSettings());
    await waitFor(() => expect(failed.result.current.settingsError).toBe("读取设置失败。"));
    expect(failed.result.current.settings).toBeNull();
  });

  it("applies an update optimistically, then takes the saved settings", async () => {
    let resolve!: (value: unknown) => void;
    const { hook, onSettingsChange } = await setup({ "settings.update": () => new Promise((r) => { resolve = r; }) });
    act(() => hook.result.current.update({ defaultModelId: "optimistic" } as never));
    expect(hook.result.current.settings).toMatchObject({ defaultModelId: "optimistic", agent: { systemPromptPath: "/tmp/a.md" } });
    await act(async () => resolve(legacy("saved")));
    expect(hook.result.current.settings).toEqual(legacy("saved"));
    expect(onSettingsChange).toHaveBeenLastCalledWith(legacy("saved"));
  });

  it("sends the revision with namespace updates and surfaces a conflict with the latest snapshot", async () => {
    const updateV4 = vi.fn()
      .mockResolvedValueOnce({ ok: true, snapshot: snapshot("r2") })
      .mockResolvedValueOnce({ latest: snapshot("r9"), message: "设置已在别处修改" });
    const { hook, get, onSettingsChange } = await setup({ "settings.updateV4": updateV4 });
    get.mockResolvedValue(legacy("after-v4"));

    await act(async () => { await hook.result.current.updateNamespace({ namespace: "general", patch: { performanceMonitoring: true } } as never); });
    expect(updateV4).toHaveBeenLastCalledWith(expect.objectContaining({ expectedRevision: "r1" }));
    expect(hook.result.current.settingsV4).toEqual(snapshot("r2"));
    expect(onSettingsChange).toHaveBeenLastCalledWith(legacy("after-v4"));

    let error: unknown;
    await act(async () => { await hook.result.current.updateNamespace({ namespace: "general", patch: {} } as never).catch((cause: unknown) => { error = cause; }); });
    expect(updateV4).toHaveBeenLastCalledWith(expect.objectContaining({ expectedRevision: "r2" }));
    expect(error).toEqual(new Error("设置已在别处修改"));
    expect(hook.result.current.settingsV4).toEqual(snapshot("r9"));
  });

  it("replaces settings and refreshes after saving or clearing a provider key", async () => {
    const setKey = vi.fn().mockResolvedValueOnce({ ok: false, message: "无效" }).mockResolvedValueOnce({ ok: true });
    const clearKey = vi.fn(async () => undefined);
    const { hook, get, onSettingsChange } = await setup({ "providers.setKey": setKey, "providers.clearKey": clearKey });

    act(() => hook.result.current.replaceSettings(legacy("replaced")));
    expect(hook.result.current.settings).toEqual(legacy("replaced"));
    expect(onSettingsChange).toHaveBeenLastCalledWith(legacy("replaced"));

    get.mockClear();
    await act(async () => { await hook.result.current.saveProviderKey("deepseek", "bad"); });
    expect(get).not.toHaveBeenCalled();
    get.mockResolvedValue(legacy("after-key"));
    await act(async () => { await hook.result.current.saveProviderKey("deepseek", "good"); });
    expect(setKey).toHaveBeenLastCalledWith({ provider: "deepseek", apiKey: "good" });
    expect(hook.result.current.settings).toEqual(legacy("after-key"));

    get.mockResolvedValue(legacy("after-clear"));
    await act(async () => { await hook.result.current.clearProviderKey("deepseek"); });
    expect(clearKey).toHaveBeenCalledWith({ provider: "deepseek" });
    expect(onSettingsChange).toHaveBeenLastCalledWith(legacy("after-clear"));
  });
});
