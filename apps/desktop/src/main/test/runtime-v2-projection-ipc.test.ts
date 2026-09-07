import { describe, expect, it, vi } from "vitest";
import { RUNTIME_V2_DESKTOP_CHANNELS } from "@actspace/shared/runtime-v2";
import type { AppSettingsV2 } from "@actspace/shared";
import type { SettingsService } from "../settings-service";
import type { DesktopRuntimeV2Registry } from "../runtime-v2/runtime-registry";
import type { ModelStoreService } from "../model-store-service";
import type { QuickOpenShortcutController } from "../quick-open-shortcut-controller";

const { handlers, removeHandler } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return { handlers, removeHandler: vi.fn((channel: string) => handlers.delete(channel)) };
});

vi.mock("electron", () => ({
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => handlers.set(channel, listener),
    removeHandler,
  },
  BrowserWindow: class {},
}));

import { registerRuntimeV2Ipc } from "../runtime-v2/projection-ipc";

describe("runtime v2 projection IPC", () => {
  it("keeps search credentials in Main and rejects unknown providers", async () => {
    handlers.clear();
    const view = settingsView();
    const setProviderKey = vi.fn(async () => ({ ok: true as const }));
    const addProviderCredential = vi.fn(async () => ({ ...view }));
    const settings = {
      getV2: () => view,
      get: () => view,
      updateV2: vi.fn(async () => view),
      setProviderKey,
      addProviderCredential,
      clearProviderKey: vi.fn(async () => ({ ok: true as const })),
    } as unknown as SettingsService;
    const updateModelSettings = vi.fn(async () => ({ ok: true as const }));
    const updateQuickOpen = vi.fn(async (_current: AppSettingsV2["shortcuts"]["quickOpen"], next: AppSettingsV2["shortcuts"]["quickOpen"], persist: () => Promise<unknown>) => ({ ok: true as const, settings: await persist(), status: { registered: next.enabled, accelerator: next.accelerator } }));
    const registration = registerRuntimeV2Ipc({
      registry: { subscribe: () => () => undefined } as unknown as DesktopRuntimeV2Registry,
      settings,
      models: { updateModelSettings } as unknown as ModelStoreService,
      quickOpen: { update: updateQuickOpen } as unknown as QuickOpenShortcutController,
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { id: 7, send: vi.fn() },
      }) as never,
    });
    const handler = handlers.get(RUNTIME_V2_DESKTOP_CHANNELS.configureSecret);
    const event = { sender: { id: 7 } };

    const result = await handler?.(event, { provider: "tavily", apiKey: "secret-tavily-key" });

    expect(setProviderKey).toHaveBeenCalledWith("tavily", "secret-tavily-key");
    expect(result).toEqual(view);
    expect(JSON.stringify(result)).not.toContain("secret-tavily-key");

    const credentialResult = await handlers.get(RUNTIME_V2_DESKTOP_CHANNELS.addProviderCredential)?.(event, { provider: "deepseek", label: "Batch", apiKey: "secret-batch-key", pricingMultiplier: 1.2 });
    expect(addProviderCredential).toHaveBeenCalledWith({ provider: "deepseek", label: "Batch", apiKey: "secret-batch-key", pricingMultiplier: 1.2 });
    expect(JSON.stringify(credentialResult)).not.toContain("secret-batch-key");

    await handlers.get(RUNTIME_V2_DESKTOP_CHANNELS.updateModel)?.(event, { modelKey: "deepseek:deepseek-chat", enabled: false });
    expect(updateModelSettings).toHaveBeenCalledWith("deepseek:deepseek-chat", { modelKey: "deepseek:deepseek-chat", enabled: false });

    await handlers.get(RUNTIME_V2_DESKTOP_CHANNELS.updateSettings)?.(event, { shortcuts: { quickOpen: { enabled: true, accelerator: "CommandOrControl+K" } } });
    expect(updateQuickOpen).toHaveBeenCalledWith(
      view.shortcuts.quickOpen,
      { ...view.shortcuts.quickOpen, enabled: true, accelerator: "CommandOrControl+K" },
      expect.any(Function),
    );
    await expect(Promise.resolve(handler?.(event, { provider: "unknown", apiKey: "secret" }))).rejects.toThrow("Unknown credential provider");

    registration.dispose();
    expect(removeHandler).toHaveBeenCalledWith(RUNTIME_V2_DESKTOP_CHANNELS.configureSecret);
  });
});

function settingsView(): AppSettingsV2 {
  return {
    version: 2,
    providers: {
      deepseek: { hasApiKey: false },
      kimi: { hasApiKey: false },
      openrouter: { hasApiKey: false },
    },
    installedModels: {},
    customModels: {},
    taskModels: { defaultChatModel: null, utilityModel: null, exploreModel: null },
    searchProviders: {
      zhipu: { hasApiKey: false },
      tavily: { hasApiKey: true },
      tinyfish: { hasApiKey: false },
      exa: { hasApiKey: false },
    },
    imageGeneration: { hasApiKey: false, baseUrl: "https://example.com/v1", model: "image" },
    imageInspection: { modelKey: "openrouter:qwen/qwen2.5-vl-32b-instruct:free" },
    agent: { systemPromptPath: "prompt.md", temperature: null, maxTokens: null, disabledTools: [], bashAlwaysAsk: false },
    skills: { disabled: [] },
    shortcuts: { quickOpen: { enabled: false, accelerator: "CommandOrControl+Shift+Space", target: { kind: "automatic" } } },
  };
}
