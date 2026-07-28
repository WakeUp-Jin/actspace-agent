import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  AppSettings,
  CatalogModelView,
  InstalledModelView,
  ProviderSettingsView,
  UsableModelView,
} from "@actspace/shared";
import { ProviderSettings } from "../components/settings/ProviderSettings";
import { ModelSettings } from "../components/settings/ModelSettings";
import { OpenRouterModelCatalogDialog } from "../components/settings/OpenRouterModelCatalogDialog";

type ActspaceBridge = NonNullable<typeof window.actspace>;

const providerViews: Record<"deepseek" | "kimi" | "openrouter" | "duckcoding", ProviderSettingsView> = {
  deepseek: {
    hasApiKey: true,
    baseUrl: null,
    proxy: { enabled: false, url: null },
    installedModelCount: 2,
    enabledModelCount: 2,
  },
  kimi: {
    hasApiKey: false,
    baseUrl: null,
    proxy: { enabled: false, url: null },
    installedModelCount: 2,
    enabledModelCount: 2,
  },
  openrouter: {
    hasApiKey: false,
    baseUrl: null,
    proxy: { enabled: false, url: null },
    installedModelCount: 3,
    enabledModelCount: 3,
  },
  duckcoding: {
    hasApiKey: false,
    baseUrl: null,
    proxy: { enabled: false, url: null },
    installedModelCount: 0,
    enabledModelCount: 0,
    defaultPricingMultiplier: 1,
    additionalCredentials: [],
  },
};

const openRouterModel: CatalogModelView = {
  provider: "openrouter",
  apiModel: "google/gemini-3.6-flash",
  name: "Gemini 3.6 Flash",
  contextWindow: 1_048_576,
  maxTokens: 65_536,
  input: ["text", "image"],
  toolUse: "declared",
  reasoning: true,
  isFree: false,
  pricing: {
    currency: "USD",
    inputCacheHitPerMillion: 0.15,
    inputCacheMissPerMillion: 1.5,
    outputPerMillion: 7.5,
  },
  added: false,
};

const usableModel: UsableModelView = {
  key: "deepseek:deepseek-v4-pro",
  label: "DeepSeek V4 Pro",
  provider: "deepseek",
  apiModel: "deepseek-v4-pro",
  contextWindow: 1_000_000,
  thinkingDefault: true,
  capabilities: {
    input: ["text"],
    toolUse: "verified",
    reasoning: true,
    thinkingToggle: true,
  },
};

const openRouterUsableModel: UsableModelView = {
  ...usableModel,
  key: "openrouter:deepseek/deepseek-v4-pro",
  provider: "openrouter",
  apiModel: "deepseek/deepseek-v4-pro",
};

const installedModel: InstalledModelView = {
  definition: {
    key: usableModel.key,
    provider: "deepseek",
    api: "anthropic-messages",
    apiModel: usableModel.apiModel,
    label: usableModel.label,
    source: "builtin",
    contextWindow: usableModel.contextWindow,
    maxTokens: 65_536,
    thinkingDefault: true,
    capabilities: usableModel.capabilities,
  },
  settings: {
    enabled: true,
    addedAt: "2026-07-24T00:00:00.000Z",
  },
  unavailableReasons: {},
};

const catalogInstalledModel: InstalledModelView = {
  definition: {
    ...installedModel.definition,
    key: "openrouter:google/gemini-3.6-flash",
    provider: "openrouter",
    api: "openai-completions",
    apiModel: openRouterModel.apiModel,
    label: openRouterModel.name,
    source: "provider-catalog",
  },
  settings: {
    enabled: true,
    addedAt: "2026-07-24T00:00:00.000Z",
  },
  unavailableReasons: {},
};
const duckModel: InstalledModelView = {
  definition: {
    key: "duckcoding:grok-4.5",
    provider: "duckcoding",
    api: "openai-completions",
    apiModel: "grok-4.5",
    label: "Grok 4.5",
    source: "custom",
    contextWindow: 256000,
    maxTokens: 32000,
    thinkingDefault: true,
    capabilities: { input: ["text"], toolUse: "declared", reasoning: true, thinkingToggle: false, reasoningMandatory: true },
    family: "grok",
    pricing: { currency: "USD", inputCacheHitPerMillion: 0.5, inputCacheMissPerMillion: 5, outputPerMillion: 30 },
  },
  settings: { enabled: true, addedAt: "2026-07-27T00:00:00.000Z" },
  unavailableReasons: {},
};
const duckCodexModel: InstalledModelView = {
  definition: {
    key: "duckcoding:gpt-5.6-sol",
    provider: "duckcoding",
    api: "openai-completions",
    apiModel: "gpt-5.6-sol",
    label: "5.6 Sol",
    source: "custom",
    contextWindow: 255000,
    maxTokens: null,
    thinkingDefault: true,
    capabilities: { input: ["text"], toolUse: "declared", reasoning: true, thinkingToggle: false, reasoningMandatory: true },
    family: "codex",
    pricing: { currency: "USD", inputCacheHitPerMillion: 0.5, inputCacheMissPerMillion: 5, inputCacheWritePerMillion: 6.25, outputPerMillion: 30 },
  },
  settings: { enabled: true, addedAt: "2026-07-28T00:00:00.000Z", credentialId: "codex-sale" },
  unavailableReasons: {},
};

const settings = {
  version: 2,
  defaultModelId: "deepseek-v4-pro",
  providers: providerViews,
  installedModels: { [installedModel.definition.key]: installedModel.settings },
  customModels: {},
  taskModels: {
    defaultChatModel: usableModel.key,
    utilityModel: null,
    exploreModel: null,
  },
  kairosModelKey: null,
  searchProviders: {
    zhipu: { hasApiKey: false },
    tavily: { hasApiKey: false },
    tinyfish: { hasApiKey: false },
    exa: { hasApiKey: false },
  },
  agent: {
    systemPromptPath: "/tmp/main-agent.md",
    temperature: null,
    maxTokens: null,
    disabledTools: [],
    bashAlwaysAsk: false,
    exploreModelId: null,
  },
  kairos: { modelId: null, thinking: "auto", enabledSkills: [] },
  plugins: { repoRoot: null, fsWatch: { enabled: false } },
  skills: { disabled: [] },
} as AppSettings;

describe("provider and model settings", () => {
  afterEach(() => {
    delete (window as { actspace?: ActspaceBridge }).actspace;
  });

  it("saves an OpenRouter key and a provider-scoped proxy without echoing the key", async () => {
    const connectProvider = vi.fn(async () => ({ ok: true as const, provider: providerViews.openrouter }));
    window.actspace = {
      listProviders: async () => ({ providers: providerViews }),
      connectProvider,
    } as unknown as ActspaceBridge;

    render(<ProviderSettings />);
    await userEvent.click(await screen.findByRole("button", { name: "添加服务" }));
    await userEvent.click(screen.getByRole("button", { name: "选择 OpenRouter" }));
    await userEvent.type(screen.getByLabelText("OpenRouter API Key"), "test-openrouter-key");
    await userEvent.click(screen.getByLabelText("仅为此服务商启用代理"));
    await userEvent.type(screen.getByLabelText("HTTP(S) 代理地址"), "http://127.0.0.1:7890");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(connectProvider).toHaveBeenCalledWith({
        provider: "openrouter",
        apiKey: "test-openrouter-key",
        managementKey: null,
        baseUrl: null,
        proxy: { enabled: true, url: "http://127.0.0.1:7890" },
      });
    });
    expect(screen.queryByDisplayValue("test-openrouter-key")).not.toBeInTheDocument();
  });

  it("traps focus in the provider modal and restores the add-service trigger after Escape", async () => {
    window.actspace = {
      listProviders: async () => ({ providers: providerViews }),
    } as unknown as ActspaceBridge;

    render(<ProviderSettings />);
    const opener = await screen.findByRole("button", { name: "添加服务" });
    await userEvent.click(opener);
    await userEvent.click(screen.getByRole("button", { name: "选择 OpenRouter" }));
    const dialog = screen.getByRole("dialog", { name: "添加 OpenRouter" });
    const apiKey = screen.getByLabelText("OpenRouter API Key");
    const first = screen.getByRole("button", { name: "关闭" });
    const last = screen.getByRole("button", { name: "保存" });

    await userEvent.type(apiKey, "test-key");
    first.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("renders only connected providers as compact grouped cards", async () => {
    window.actspace = {
      listProviders: async () => ({ providers: providerViews }),
    } as unknown as ActspaceBridge;

    render(<ProviderSettings />);
    const heading = await screen.findByRole("heading", { name: "DeepSeek" });
    const card = heading.closest("article");

    expect(card).not.toBeNull();
    expect(screen.getByText("官方 API（直连）")).toBeInTheDocument();
    expect(within(card!).getByText("官方直连")).toBeInTheDocument();
    expect(within(card!).getByText("api.deepseek.com/anthropic")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Kimi" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "OpenRouter" })).not.toBeInTheDocument();
  });

  it("keeps DuckCoding manageable when the default Key is absent but an extra Key remains", async () => {
    const extraOnly = {
      ...providerViews,
      duckcoding: {
        ...providerViews.duckcoding,
        additionalCredentials: [{
          id: "codex-sale",
          label: "CodeX-Sale",
          pricingMultiplier: 0.2,
          hasApiKey: true,
          lastConnection: { status: "available" as const },
        }],
      },
    };
    window.actspace = {
      listProviders: async () => ({ providers: extraOnly }),
    } as unknown as ActspaceBridge;

    render(<ProviderSettings />);

    const heading = await screen.findByRole("heading", { name: "DuckCoding" });
    const card = heading.closest("article");
    expect(card).not.toBeNull();
    expect(within(card!).queryByRole("button", { name: "断开" })).not.toBeInTheDocument();
    await userEvent.click(within(card!).getByRole("button", { name: "编辑" }));
    expect(screen.getByRole("dialog", { name: "编辑 DuckCoding" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("CodeX-Sale")).toBeInTheDocument();
  });

  it("uses purpose-filtered models for task selection and updates model enablement", async () => {
    const updateTaskModels = vi.fn(async (input: Partial<AppSettings["taskModels"]>) => ({
      taskModels: { ...settings.taskModels, ...input },
    }));
    const updateModel = vi.fn(async () => ({ ok: true as const, model: installedModel }));
    window.actspace = {
      listInstalledModels: async () => ({ models: [installedModel] }),
      listUsableModels: async () => ({ models: [usableModel, openRouterUsableModel] }),
      updateTaskModels,
      updateModel,
    } as unknown as ActspaceBridge;

    render(<ModelSettings settings={settings} />);
    await screen.findByText("已添加模型");
    const utilitySelect = screen.getByLabelText("轻量任务模型") as HTMLSelectElement;
    const providerGroups = Array.from(utilitySelect.querySelectorAll("optgroup"));
    expect(providerGroups.map((group) => group.label)).toEqual(["DeepSeek", "OpenRouter"]);
    expect(Array.from(utilitySelect.options).map((option) => option.text)).toEqual([
      "未配置",
      "DeepSeek V4 Pro · DeepSeek",
      "DeepSeek V4 Pro · OpenRouter",
    ]);

    await userEvent.selectOptions(utilitySelect, openRouterUsableModel.key);
    await waitFor(() => expect(updateTaskModels).toHaveBeenCalledWith({ utilityModel: openRouterUsableModel.key }));

    await userEvent.click(await screen.findByRole("switch", { name: `启用 ${usableModel.label}` }));
    await waitFor(() => expect(updateModel).toHaveBeenCalledWith({ modelKey: usableModel.key, enabled: false }));
  });

  it("keeps the model Key selector hidden for a single-key DuckCoding provider", async () => {
    const singleKeySettings = {
      ...settings,
      providers: { ...settings.providers, duckcoding: { ...providerViews.duckcoding, hasApiKey: true } },
    } as AppSettings;
    window.actspace = {
      listInstalledModels: async () => ({ models: [duckModel] }),
      listUsableModels: async () => ({ models: [] }),
    } as unknown as ActspaceBridge;

    render(<ModelSettings settings={singleKeySettings} />);

    expect(await screen.findByText("Grok 4.5")).toBeInTheDocument();
    expect(screen.queryByLabelText("Grok 4.5 调用 Key")).not.toBeInTheDocument();
  });

  it("shows a selector only after DuckCoding has extra Keys and persists the selected Key", async () => {
    const updateModel = vi.fn(async () => ({ ok: true as const, model: duckModel }));
    const multiKeySettings = {
      ...settings,
      providers: {
        ...settings.providers,
        duckcoding: {
          ...providerViews.duckcoding,
          hasApiKey: true,
          additionalCredentials: [{
            id: "codex-sale",
            label: "CodeX-Sale",
            pricingMultiplier: 0.2,
            hasApiKey: true,
            lastConnection: { status: "available" as const },
          }],
        },
      },
    } as AppSettings;
    window.actspace = {
      listInstalledModels: async () => ({ models: [duckModel] }),
      listUsableModels: async () => ({ models: [] }),
      updateModel,
    } as unknown as ActspaceBridge;

    render(<ModelSettings settings={multiKeySettings} />);
    await userEvent.selectOptions(await screen.findByLabelText("Grok 4.5 调用 Key"), "codex-sale");

    await waitFor(() => expect(updateModel).toHaveBeenCalledWith({ modelKey: "duckcoding:grok-4.5", credentialId: "codex-sale" }));
  });

  it("shows the Codex base price after applying the selected Key multiplier", async () => {
    const multiKeySettings = {
      ...settings,
      providers: {
        ...settings.providers,
        duckcoding: {
          ...providerViews.duckcoding,
          hasApiKey: true,
          additionalCredentials: [{
            id: "codex-sale",
            label: "CodeX-Sale",
            pricingMultiplier: 0.2,
            hasApiKey: true,
            lastConnection: { status: "available" as const },
          }],
        },
      },
    } as AppSettings;
    window.actspace = {
      listInstalledModels: async () => ({ models: [duckCodexModel] }),
      listUsableModels: async () => ({ models: [] }),
    } as unknown as ActspaceBridge;

    render(<ModelSettings settings={multiKeySettings} />);

    expect(await screen.findByText(/CodeX-Sale · 0\.2x · 估算输入 \$1 \/ 输出 \$6 \/ 1M/)).toBeInTheDocument();
  });

  it("adds a DuckCoding local-catalog model with a context override and a provider-owned Key", async () => {
    const addModel = vi.fn(async () => ({ ok: true as const, model: duckModel }));
    const multiKeySettings = {
      ...settings,
      providers: {
        ...settings.providers,
        duckcoding: {
          ...providerViews.duckcoding,
          hasApiKey: true,
          additionalCredentials: [{
            id: "codex-sale",
            label: "CodeX-Sale",
            pricingMultiplier: 0.2,
            hasApiKey: true,
            lastConnection: { status: "available" as const },
          }],
        },
      },
    } as AppSettings;
    window.actspace = {
      listInstalledModels: async () => ({ models: [] }),
      listUsableModels: async () => ({ models: [] }),
      addModel,
    } as unknown as ActspaceBridge;

    render(<ModelSettings settings={multiKeySettings} />);
    await userEvent.click(await screen.findByRole("button", { name: "添加 DuckCoding 模型" }));
    expect(screen.getByText("5.6 Sol")).toBeInTheDocument();
    expect(screen.getByText("5.6 Terra")).toBeInTheDocument();
    expect(screen.getByText("5.6 Luna")).toBeInTheDocument();
    expect(screen.getByText("gpt-5.6-sol-high")).toBeInTheDocument();
    expect(screen.getByText("gpt-5.6-sol-ultra")).toBeInTheDocument();
    expect(screen.getByText("Light")).toBeInTheDocument();
    expect(screen.getByText("Extra High")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Grok 4\.5/ }));
    await userEvent.clear(screen.getByLabelText("DuckCoding 最大上下文"));
    await userEvent.type(screen.getByLabelText("DuckCoding 最大上下文"), "255000");
    await userEvent.selectOptions(screen.getByLabelText("DuckCoding 模型调用 Key"), "codex-sale");
    await userEvent.click(screen.getByRole("button", { name: "添加模型" }));

    await waitFor(() => expect(addModel).toHaveBeenCalledWith({
      provider: "duckcoding",
      apiModel: "grok-4.5",
      catalogModelId: "grok:grok-4.5",
      contextWindow: 255000,
      maxTokens: null,
      credentialId: "codex-sale",
    }));
  });

  it("shows the blocking references when an in-use catalog model cannot be removed", async () => {
    const removeModel = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: "model_in_use" as const,
        message: "模型正在使用中，不能删除。",
        references: ["utilityModel" as const, "kairosModel" as const],
      },
    }));
    window.actspace = {
      listInstalledModels: async () => ({ models: [catalogInstalledModel] }),
      listUsableModels: async () => ({ models: [] }),
      removeModel,
    } as unknown as ActspaceBridge;

    render(<ModelSettings settings={settings} />);
    await userEvent.click(await screen.findByRole("button", { name: `删除 ${catalogInstalledModel.definition.label}` }));

    await waitFor(() => expect(removeModel).toHaveBeenCalledWith({ modelKey: catalogInstalledModel.definition.key }));
    expect(screen.getByRole("alert")).toHaveTextContent("模型正在使用中，不能删除。（utilityModel、kairosModel）");
  });

  it("searches the cached OpenRouter catalog, adds a model, and closes with Escape", async () => {
    const onClose = vi.fn();
    const onAdded = vi.fn();
    const listModelCatalog = vi.fn(async (input: { query?: string }) => ({
      provider: "openrouter" as const,
      state: "fresh" as const,
      fetchedAt: "2026-07-24T00:00:00.000Z",
      stale: false,
      models: input.query && !openRouterModel.name.toLowerCase().includes(input.query.toLowerCase()) ? [] : [openRouterModel],
      skippedCount: 0,
    }));
    const addModel = vi.fn(async () => ({ ok: true as const, model: installedModel }));
    window.actspace = { listModelCatalog, addModel } as unknown as ActspaceBridge;

    render(<OpenRouterModelCatalogDialog onClose={onClose} onAdded={onAdded} />);
    expect(await screen.findByText(openRouterModel.name)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("搜索模型"), "gemini");
    await waitFor(() => expect(listModelCatalog).toHaveBeenLastCalledWith({ provider: "openrouter", query: "gemini" }));
    await userEvent.click(screen.getByRole("button", { name: "添加" }));
    await waitFor(() => {
      expect(addModel).toHaveBeenCalledWith({ provider: "openrouter", apiModel: openRouterModel.apiModel });
      expect(onAdded).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("button", { name: "已添加" })).toBeDisabled();

    fireEvent.keyDown(screen.getByRole("dialog", { name: "为 OpenRouter 添加模型" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("notifies the app model list immediately after adding a catalog model", async () => {
    const onChanged = vi.fn();
    const addModel = vi.fn(async () => ({ ok: true as const, model: catalogInstalledModel }));
    window.actspace = {
      listInstalledModels: async () => ({ models: [installedModel] }),
      listUsableModels: async () => ({ models: [usableModel] }),
      listModelCatalog: async () => ({
        provider: "openrouter" as const,
        state: "fresh" as const,
        stale: false,
        models: [openRouterModel],
        skippedCount: 0,
      }),
      addModel,
    } as unknown as ActspaceBridge;

    render(<ModelSettings settings={settings} onChanged={onChanged} />);
    await userEvent.click(await screen.findByRole("button", { name: "从 OpenRouter 添加" }));
    await userEvent.click(await screen.findByRole("button", { name: "添加" }));

    await waitFor(() => {
      expect(addModel).toHaveBeenCalledWith({ provider: "openrouter", apiModel: openRouterModel.apiModel });
      expect(onChanged).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps a stale catalog visible and offers an explicit reload recovery action", async () => {
    const onReloaded = vi.fn();
    const listModelCatalog = vi.fn(async () => ({
      provider: "openrouter" as const,
      state: "stale" as const,
      fetchedAt: "2026-07-22T00:00:00.000Z",
      stale: true,
      models: [openRouterModel],
      skippedCount: 0,
      error: { code: "network", message: "模型目录加载失败，已保留上次缓存。" },
    }));
    const reloadModelCatalog = vi.fn(async () => ({
      provider: "openrouter" as const,
      state: "fresh" as const,
      fetchedAt: "2026-07-24T00:00:00.000Z",
      stale: false,
      models: [openRouterModel],
      skippedCount: 0,
    }));
    window.actspace = { listModelCatalog, reloadModelCatalog } as unknown as ActspaceBridge;

    render(<OpenRouterModelCatalogDialog onClose={() => {}} onAdded={() => {}} onReloaded={onReloaded} />);
    expect(await screen.findByText(openRouterModel.name)).toBeInTheDocument();
    expect(screen.getByText("模型目录加载失败，已保留上次缓存。")).toBeInTheDocument();
    expect(screen.getByText(/缓存已过期/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "重新加载" }));
    await waitFor(() => expect(onReloaded).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(reloadModelCatalog).toHaveBeenCalledWith({ provider: "openrouter", query: "" }));
    await waitFor(() => expect(screen.queryByText("模型目录加载失败，已保留上次缓存。")).not.toBeInTheDocument());
  });

  it("cycles catalog focus and restores the opener when the modal closes", async () => {
    window.actspace = {
      listModelCatalog: async () => ({
        provider: "openrouter" as const,
        state: "fresh" as const,
        stale: false,
        models: [openRouterModel],
        skippedCount: 0,
      }),
    } as unknown as ActspaceBridge;

    function Harness() {
      const [open, setOpen] = useState(false);
      return <><button type="button" onClick={() => setOpen(true)}>打开目录</button>{open ? <OpenRouterModelCatalogDialog onClose={() => setOpen(false)} onAdded={() => {}} /> : null}</>;
    }

    render(<Harness />);
    const opener = screen.getByRole("button", { name: "打开目录" });
    await userEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "为 OpenRouter 添加模型" });
    const close = screen.getByRole("button", { name: "关闭模型目录" });
    const add = await screen.findByRole("button", { name: "添加" });

    add.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
