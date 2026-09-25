import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import { TaskModelDefaultsSection } from "../components/settings/SettingsPage";
import { OpenRouterModelCatalogDialog } from "../components/settings/OpenRouterModelCatalogDialog";
import { ProviderLogo } from "../components/settings/ProviderLogo";

type ActspaceBridge = NonNullable<typeof window.actspace>;
const readyCredentialStorage = { status: "ready" as const };

const providerViews: Record<"deepseek" | "kimi" | "openrouter", ProviderSettingsView> = {
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
const customConnectionModel: InstalledModelView = {
  definition: {
    key: "openrouter:connection/anthropic-relay/claude-opus-alias",
    provider: "openrouter",
    api: "anthropic-messages",
    apiModel: "claude-opus-alias",
    label: "Claude Opus Relay",
    source: "custom",
    contextWindow: 1_000_000,
    maxTokens: 128_000,
    thinkingDefault: true,
    reasoningConfig: { mode: "manual", support: "supported", efforts: ["low", "medium", "high"], defaultEffort: "medium", allowOff: true },
    capabilities: { input: ["text", "image"], toolUse: "declared", reasoning: true, thinkingToggle: true, reasoningEfforts: ["low", "medium", "high"], reasoningDefaultEffort: "medium" },
    pricing: { currency: "USD", inputCacheMissPerMillion: 5, outputPerMillion: 25, inputCacheHitPerMillion: 0.5, inputCacheWritePerMillion: 6.25 },
  },
  settings: { enabled: true, addedAt: "2026-09-24T00:00:00.000Z", connectionId: "anthropic-relay" },
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
  skills: { disabled: [] },
} as AppSettings;

describe("provider and model settings", () => {
  afterEach(() => {
    delete (window as { actspace?: ActspaceBridge }).actspace;
  });

  it("shows connection-shaped rows while local settings are pending, then replaces the skeleton", async () => {
    let resolveProviders!: (value: unknown) => void;
    let resolveSettings!: (value: unknown) => void;
    window.actspace = {
      listProviders: () => new Promise((resolve) => { resolveProviders = resolve; }),
      getSettingsV4: () => new Promise((resolve) => { resolveSettings = resolve; }),
    } as unknown as ActspaceBridge;
    render(<ProviderSettings />);
    const loading = screen.getByLabelText("正在加载服务商");
    expect(loading).toHaveAttribute("aria-busy", "true");
    const rows = within(loading).getAllByRole("listitem", { hidden: true });
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toHaveClass("min-h-[68px]", "flex");
      expect(row.querySelector(".h-9.w-9")).not.toBeNull();
    }
    expect(loading).not.toHaveClass("md:grid-cols-2");
    await act(async () => { resolveProviders({ providers: providerViews, credentialStorage: readyCredentialStorage }); });
    expect(screen.getByLabelText("正在加载服务商")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "DeepSeek" })).not.toBeInTheDocument();
    await act(async () => { resolveSettings({ settings: { models: { connections: {} } } }); });
    expect(screen.getByRole("button", { name: "DeepSeek" })).toBeInTheDocument();
    expect(screen.queryByLabelText("正在加载服务商")).not.toBeInTheDocument();
  });

  it("allows opening connections while balance is pending and confines failure to the balance row", async () => {
    let rejectBalance!: (error: Error) => void;
    const getProviderBalance = vi.fn(() => new Promise((_, reject) => { rejectBalance = reject; }));
    window.actspace = {
      listProviders: async () => ({ providers: providerViews, credentialStorage: readyCredentialStorage }),
      getProviderBalance,
    } as unknown as ActspaceBridge;
    render(<ProviderSettings />);
    await waitFor(() => expect(getProviderBalance).toHaveBeenCalledOnce());
    expect(screen.queryByLabelText("正在加载服务商")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加服务" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "DeepSeek" }));
    expect(screen.getByText("正在刷新…")).toBeInTheDocument();
    await act(async () => { rejectBalance(new Error("fixture balance offline")); });
    expect(screen.getByText("刷新失败，已保留上次结果")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "更换模型密钥" })).toBeEnabled();
  });

  it("saves an OpenRouter key and a provider-scoped proxy without echoing the key", async () => {
    const connectProvider = vi.fn(async () => ({ ok: true as const, provider: providerViews.openrouter }));
    window.actspace = {
      listProviders: async () => ({ providers: providerViews, credentialStorage: readyCredentialStorage }),
      connectProvider,
    } as unknown as ActspaceBridge;

    render(<ProviderSettings settings={settings} />);
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

  it("surfaces credential storage failures and blocks adding services without claiming keys are absent", async () => {
    const unavailableProviders = Object.fromEntries(
      Object.entries(providerViews).map(([id, provider]) => [id, { ...provider, hasApiKey: false }]),
    ) as typeof providerViews;
    window.actspace = {
      listProviders: async () => ({
        providers: unavailableProviders,
        credentialStorage: {
          status: "unavailable" as const,
          code: "migration_failed" as const,
          message: "旧版凭据无法解密。请使用最后一次能读取这些 Key 的 Actspace 版本启动后再迁移。",
        },
      }),
    } as unknown as ActspaceBridge;

    render(<ProviderSettings />);

    expect(await screen.findByRole("alert")).toHaveTextContent("本地凭据暂时无法读取");
    expect(screen.getByRole("button", { name: "添加服务" })).toBeDisabled();
    expect(screen.queryByText("还没有连接模型服务")).not.toBeInTheDocument();
  });

  it("filters the provider catalog and returns to the connection list", async () => {
    window.actspace = {
      listProviders: async () => ({ providers: providerViews, credentialStorage: readyCredentialStorage }),
    } as unknown as ActspaceBridge;

    render(<ProviderSettings />);
    await userEvent.click(await screen.findByRole("button", { name: "添加服务" }));
    expect(screen.getByRole("heading", { name: "添加连接", level: 3 })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("搜索模型服务"), "open");
    expect(screen.getByRole("button", { name: "选择 OpenRouter" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "选择 Moonshot" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "返回连接" }));
    expect(await screen.findByRole("heading", { name: "模型连接", level: 3 })).toBeInTheDocument();
  });

  it("shows the selected provider catalog and routes API providers to setup", async () => {
    const createCustomConnection = vi.fn(async () => ({}));
    window.actspace = {
      listProviders: async () => ({ providers: providerViews, credentialStorage: readyCredentialStorage }),
      createCustomConnection,
    } as unknown as ActspaceBridge;

    render(<ProviderSettings />);
    await userEvent.click(await screen.findByRole("button", { name: "添加服务" }));
    expect(screen.getByRole("button", { name: "选择 OpenAI" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择 MiniMax" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择 Anthropic" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "选择 OpenAI" }));
    expect(await screen.findByRole("heading", { name: "连接 OpenAI", level: 3 })).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://api.openai.com/v1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("gpt-4o-mini")).toBeInTheDocument();
  });

  it("lists exactly nine providers and three reusable custom protocols as equal logo rows", async () => {
    window.actspace = {
      listProviders: async () => ({ providers: {}, credentialStorage: readyCredentialStorage }),
      getSettingsV4: async () => ({ settings: { models: { connections: { relay: { connectionId: "relay", providerId: "openrouter", catalogId: "anthropic-compatible", displayName: "Existing relay", enabled: true } } } } }),
    } as unknown as ActspaceBridge;
    render(<ProviderSettings />);
    await userEvent.click(await screen.findByRole("button", { name: "添加服务" }));
    const names = ["Moonshot", "DeepSeek", "MiniMax", "OpenAI", "Anthropic", "Z.AI", "Xiaomi", "火山方舟 Coding Plan", "OpenRouter", "自定义服务（OpenAI Chat）", "自定义服务（OpenAI Responses）", "自定义服务（Anthropic）"];
    const rows = screen.getAllByRole("button", { name: /^选择 / });
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual(names.map((name) => `选择 ${name}`));
    expect(new Set(rows.map((row) => row.parentElement)).size).toBe(1);
    for (const row of rows) expect(row.querySelector('[data-provider-logo]:not([data-provider-logo="generic"])')).not.toBeNull();
    await userEvent.selectOptions(screen.getByLabelText("服务商类型"), "custom");
    expect(screen.getAllByRole("button", { name: /^选择 / })).toHaveLength(3);
    await userEvent.type(screen.getByLabelText("搜索模型服务"), "responses");
    expect(screen.getAllByRole("button", { name: /^选择 / })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "选择 自定义服务（OpenAI Responses）" })).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("搜索模型服务"));
    await userEvent.selectOptions(screen.getByLabelText("服务商类型"), "coding");
    expect(screen.getAllByRole("button", { name: /^选择 / })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "选择 火山方舟 Coding Plan" })).toBeInTheDocument();
  });

  it.each([
    ["OpenAI Chat", "openai-completions", "openai-compatible"],
    ["OpenAI Responses", "openai-responses", "openai-responses-compatible"],
    ["Anthropic", "anthropic-messages", "anthropic-compatible"],
  ])("saves the %s form with its protocol and preserves a failed draft for retry", async (label, protocol, catalogId) => {
    const createCustomConnection = vi.fn().mockRejectedValueOnce(new Error("暂时无法写入")).mockResolvedValue({});
    const onChanged = vi.fn();
    window.actspace = {
      listProviders: async () => ({ providers: {}, credentialStorage: readyCredentialStorage }),
      createCustomConnection,
    } as unknown as ActspaceBridge;
    render(<ProviderSettings onChanged={onChanged} />);
    await userEvent.click(await screen.findByRole("button", { name: "添加服务" }));
    await userEvent.click(screen.getByRole("button", { name: `选择 自定义服务（${label}）` }));
    expect(screen.getByRole("button", { name: "保存供应商" })).toBeDisabled();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
    await userEvent.type(screen.getByLabelText("API Key"), "fixture-secret");
    const anthropic = protocol === "anthropic-messages";
    const baseUrl = anthropic ? "https://relay.example" : "https://relay.example/v1";
    await userEvent.type(screen.getByPlaceholderText(anthropic ? "https://example.com" : "https://example.com/v1"), baseUrl);
    await userEvent.type(screen.getByPlaceholderText("例如 claude-opus-5-5"), "vendor/model-id");
    await userEvent.click(screen.getByRole("button", { name: "保存供应商" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("暂时无法写入");
    expect(screen.getByLabelText("API Key")).toHaveValue("fixture-secret");
    await userEvent.click(screen.getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(createCustomConnection).toHaveBeenLastCalledWith(expect.objectContaining({
      protocol,
      catalogId,
      connectionId: undefined,
      defaultModel: "vendor/model-id",
      baseUrl,
      apiKey: "fixture-secret",
      promptCacheMode: anthropic ? "short" : "off",
      initialModel: expect.objectContaining({ apiModel: "vendor/model-id", pricing: null }),
    }));
    await userEvent.click(screen.getByRole("button", { name: "添加服务" }));
    expect(screen.getByRole("button", { name: `选择 自定义服务（${label}）` })).toBeInTheDocument();
  });

  it("uses the Maka flat catalog and a single page h2", async () => {
    window.actspace = {
      listProviders: async () => ({ providers: providerViews, credentialStorage: readyCredentialStorage }),
    } as unknown as ActspaceBridge;

    render(<ProviderSettings />);
    expect(screen.queryAllByRole("heading", { level: 4 })).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "添加服务" }));
    expect(screen.getByRole("heading", { name: "添加连接", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "添加模型服务", level: 3 })).not.toBeInTheDocument();
    expect(document.querySelector("article")).toBeNull();
    expect(document.querySelector("[class*='rounded-act-lg'][class*='border']")).toBeNull();
  });

  it("maps each supported provider to its own provider mark", () => {
    render(
      <div>
        <ProviderLogo provider="deepseek" />
        <ProviderLogo provider="kimi" />
        <ProviderLogo provider="openrouter" />
      </div>,
    );

    expect(document.querySelector('[data-provider-logo="deepseek"]')).toBeInTheDocument();
    expect(document.querySelector('[data-provider-logo="moonshot"]')).toBeInTheDocument();
    expect(document.querySelector('[data-provider-logo="openrouter"]')).toBeInTheDocument();
  });

  it("renders a required key label and primary save action on setup", async () => {
    window.actspace = {
      listProviders: async () => ({ providers: providerViews, credentialStorage: readyCredentialStorage }),
    } as unknown as ActspaceBridge;

    render(<ProviderSettings />);
    await userEvent.click(await screen.findByRole("button", { name: "添加服务" }));
    await userEvent.click(screen.getByRole("button", { name: "选择 Moonshot" }));
    expect(screen.getByRole("heading", { name: "连接 Moonshot", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("API Key · 必填")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("输入或粘贴 API Key")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toHaveClass("bg-action");
    expect(screen.getByRole("button", { name: "返回连接" })).toBeInTheDocument();
  });

  it("returns from compatible setup to the filtered catalog with its search intact", async () => {
    window.actspace = { listProviders: async () => ({ providers: providerViews, credentialStorage: readyCredentialStorage }) } as unknown as ActspaceBridge;
    render(<ProviderSettings />);
    await userEvent.click(await screen.findByRole("button", { name: "添加服务" }));
    await userEvent.type(screen.getByLabelText("搜索模型服务"), "minimax");
    await userEvent.click(screen.getByRole("button", { name: "选择 MiniMax" }));
    expect(screen.getByLabelText("API Key")).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "显示 API Key" }));
    expect(screen.getByLabelText("API Key")).toHaveAttribute("type", "text");
    await userEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.getByLabelText("搜索模型服务")).toHaveValue("minimax");
    expect(screen.getByRole("button", { name: "选择 MiniMax" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "选择 OpenAI" })).not.toBeInTheDocument();
  });

  it("submits a replacement key for an existing provider and retains the draft on failure", async () => {
    const updateProvider = vi.fn().mockRejectedValueOnce(new Error("network unavailable")).mockResolvedValue({ ok: true, provider: providerViews.deepseek });
    window.actspace = { listProviders: async () => ({ providers: providerViews, credentialStorage: readyCredentialStorage }), updateProvider } as unknown as ActspaceBridge;
    render(<ProviderSettings />);
    await userEvent.click(await screen.findByRole("button", { name: "DeepSeek" }));
    await userEvent.click(screen.getByRole("button", { name: "更换模型密钥" }));
    await userEvent.type(screen.getByLabelText("DeepSeek API Key"), "replacement-test-key");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("保存失败");
    expect(screen.getByLabelText("DeepSeek API Key")).toHaveValue("replacement-test-key");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(updateProvider).toHaveBeenLastCalledWith(expect.objectContaining({ provider: "deepseek", apiKey: "replacement-test-key" }));
    await waitFor(() => expect(screen.queryByLabelText("DeepSeek API Key")).not.toBeInTheDocument());
  });

  it("opens custom connection editing, preserves its key, and uses its catalog logo", async () => {
    const connection = { connectionId: "office", providerId: "openrouter", catalogId: "openai", displayName: "Office API", baseUrl: "https://example.com/v1", defaultModel: "office-model", enabled: true };
    const updateCustomConnection = vi.fn(async () => ({}));
    window.actspace = {
      listProviders: async () => ({ providers: {}, credentialStorage: readyCredentialStorage }),
      getSettingsV4: async () => ({ settings: { models: { connections: { office: connection } } } }),
      updateCustomConnection,
    } as unknown as ActspaceBridge;
    render(<ProviderSettings />);
    const row = await screen.findByRole("button", { name: /Office API/ });
    expect(row.querySelector('[data-provider-logo="openai"]')).toBeInTheDocument();
    expect(screen.queryByText("还没有连接模型服务")).not.toBeInTheDocument();
    await userEvent.click(row);
    await userEvent.click(screen.getByRole("button", { name: "编辑服务名称" }));
    expect(screen.getByRole("heading", { name: "编辑 Office API" })).toBeInTheDocument();
    expect(screen.getByLabelText("API Key")).toHaveValue("");
    await userEvent.clear(screen.getByLabelText("显示名称"));
    await userEvent.type(screen.getByLabelText("显示名称"), "My Gateway");
    await userEvent.click(screen.getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(updateCustomConnection).toHaveBeenCalledWith(expect.objectContaining({ connectionId: "office", displayName: "My Gateway", apiKey: undefined })));
  });

  it("shows an Anthropic request URL, tests the default model, and exposes manual model pricing", async () => {
    const connection = { connectionId: "anthropic-relay", providerId: "openrouter", protocol: "anthropic-messages", catalogId: "anthropic-compatible", displayName: "Anthropic Relay", baseUrl: "https://relay.example", defaultModel: "claude-opus-alias", promptCacheMode: "short", proxy: { enabled: false, url: null }, enabled: true };
    const getSettingsV4 = vi.fn(async () => ({ settings: { models: { connections: { [connection.connectionId]: connection } } } }));
    const testCustomConnection = vi.fn(async () => ({ ok: true, message: "模型测试成功。", checkedAt: "2026-09-24T00:00:00.000Z" }));
    window.actspace = {
      listProviders: async () => ({ providers: {}, credentialStorage: readyCredentialStorage }),
      getSettingsV4,
      listInstalledModels: async () => ({ models: [customConnectionModel] }),
      testCustomConnection,
    } as unknown as ActspaceBridge;

    render(<ProviderSettings />);
    await userEvent.click(await screen.findByRole("button", { name: /Anthropic Relay/ }));
    expect(await screen.findByText("https://relay.example/v1/messages")).toBeInTheDocument();
    expect(screen.getByText("短缓存")).toBeInTheDocument();
    expect(screen.getByText("手动价格")).toBeInTheDocument();
    expect(screen.getByText(/写缓存 6.25\/M/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "测试默认模型" }));
    await waitFor(() => expect(testCustomConnection).toHaveBeenCalledWith({ connectionId: "anthropic-relay" }));
    expect(await screen.findByText("模型测试成功。")).toBeInTheDocument();
  });

  it("adds a second custom model with four manual prices", async () => {
    const connection = { connectionId: "anthropic-relay", providerId: "openrouter", protocol: "anthropic-messages", catalogId: "anthropic-compatible", displayName: "Anthropic Relay", baseUrl: "https://relay.example", defaultModel: "claude-opus-alias", promptCacheMode: "short", proxy: { enabled: false, url: null }, enabled: true };
    const addCustomModel = vi.fn(async () => ({ ok: true as const, model: customConnectionModel }));
    window.actspace = {
      listProviders: async () => ({ providers: {}, credentialStorage: readyCredentialStorage }),
      getSettingsV4: async () => ({ settings: { models: { connections: { [connection.connectionId]: connection } } } }),
      listInstalledModels: async () => ({ models: [customConnectionModel] }),
      addCustomModel,
    } as unknown as ActspaceBridge;

    render(<ProviderSettings />);
    await userEvent.click(await screen.findByRole("button", { name: /Anthropic Relay/ }));
    await userEvent.click(await screen.findByRole("button", { name: "添加模型" }));
    await userEvent.type(screen.getByPlaceholderText("例如 claude-opus-5-5"), "claude-backup");
    await userEvent.type(screen.getByPlaceholderText("留空时使用 API 模型 ID"), "Backup");
    await userEvent.click(screen.getByRole("switch", { name: "启用手动价格" }));
    const prices = screen.getAllByPlaceholderText("0.00");
    for (const [index, value] of ["5", "25", "0.5", "6.25"].entries()) await userEvent.type(prices[index], value);
    await userEvent.click(screen.getByRole("button", { name: "保存模型" }));
    await waitFor(() => expect(addCustomModel).toHaveBeenCalledWith(expect.objectContaining({
      connectionId: "anthropic-relay",
      apiModel: "claude-backup",
      label: "Backup",
      setAsConnectionDefault: false,
      pricing: { currency: "USD", inputCacheMissPerMillion: 5, outputPerMillion: 25, inputCacheHitPerMillion: 0.5, inputCacheWritePerMillion: 6.25 },
    })));
  });

  it("preserves an existing proxy when editing OpenRouter without re-entering its address", async () => {
    const configured = {
      ...providerViews,
      openrouter: {
        ...providerViews.openrouter,
        hasApiKey: true,
        hasManagementKey: true,
        proxy: { enabled: true, url: "http://127.0.0.1:••••" },
      },
    };
    const updateProvider = vi.fn(async () => ({ ok: true as const, provider: configured.openrouter }));
    window.actspace = {
      listProviders: async () => ({ providers: configured, credentialStorage: readyCredentialStorage }),
      updateProvider,
    } as unknown as ActspaceBridge;

    render(<ProviderSettings />);
    await screen.findByRole("heading", { name: "OpenRouter" });
    await userEvent.click(screen.getByRole("button", { name: "OpenRouter" }));
    await userEvent.click(screen.getByRole("button", { name: "更换模型密钥" }));

    const proxyInput = screen.getByLabelText("HTTP(S) 代理地址");
    expect(proxyInput).toHaveAttribute("placeholder", "已配置；留空保持不变");
    const save = screen.getByRole("button", { name: "保存" });
    expect(save).toBeEnabled();
    await userEvent.type(screen.getByLabelText("OpenRouter Management Key"), "replacement-management-key");
    await userEvent.click(save);

    await waitFor(() => {
      expect(updateProvider).toHaveBeenCalledWith({
        provider: "openrouter",
        managementKey: "replacement-management-key",
        baseUrl: null,
      });
    });
  });

  it("removes a provider after confirmation and returns it to the add-service list", async () => {
    let current = { ...providerViews };
    const removeProvider = vi.fn(async () => {
      current = {
        ...current,
        deepseek: { ...current.deepseek, hasApiKey: false },
      };
      return { ok: true as const, provider: current.deepseek };
    });
    window.actspace = {
      listProviders: async () => ({ providers: current, credentialStorage: readyCredentialStorage }),
      removeProvider,
    } as unknown as ActspaceBridge;

    render(<ProviderSettings />);
    await userEvent.click(await screen.findByRole("button", { name: /^DeepSeek/ }));
    await userEvent.click(screen.getByRole("button", { name: "删除" }));
    const dialog = screen.getByRole("alertdialog", { name: "移除 DeepSeek？" });
    expect(within(dialog).getByText(/已添加模型、历史会话与用量记录会保留/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "移除服务商" }));

    await waitFor(() => expect(removeProvider).toHaveBeenCalledWith({ provider: "deepseek" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "DeepSeek" })).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "添加服务" }));
    expect(screen.getByRole("button", { name: "选择 DeepSeek" })).toBeInTheDocument();
  });

  it("uses an inline setup route and returns to the provider catalog after Escape", async () => {
    window.actspace = {
      listProviders: async () => ({ providers: providerViews, credentialStorage: readyCredentialStorage }),
    } as unknown as ActspaceBridge;

    render(<ProviderSettings />);
    const opener = await screen.findByRole("button", { name: "添加服务" });
    await userEvent.click(opener);
    await userEvent.click(screen.getByRole("button", { name: "选择 OpenRouter" }));
    const setupRoute = document.querySelector('[data-provider-route="setup"]');
    expect(setupRoute).not.toBeNull();
    const apiKey = screen.getByLabelText("OpenRouter API Key");
    await userEvent.type(apiKey, "test-key");
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByRole("heading", { name: "添加连接", level: 3 })).toBeInTheDocument();
  });

  it("renders only connected providers as a flat connection list", async () => {
    window.actspace = {
      listProviders: async () => ({ providers: providerViews, credentialStorage: readyCredentialStorage }),
    } as unknown as ActspaceBridge;

    render(<ProviderSettings />);
    await screen.findByRole("heading", { name: "DeepSeek" });
    expect(screen.getByText(/DeepSeek 官方 API · 2 \/ 2 个模型启用/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "测试" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /移除 DeepSeek/ })).not.toBeInTheDocument();
    expect(screen.queryByText("官方 API（直连）")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("DeepSeek 账户余额")).not.toBeInTheDocument();
    expect(document.querySelector("article")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Moonshot" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "OpenRouter" })).not.toBeInTheDocument();
  });

  it("opens a provider detail route and returns to the connection list", async () => {
    window.actspace = {
      listProviders: async () => ({ providers: providerViews, credentialStorage: readyCredentialStorage }),
    } as unknown as ActspaceBridge;

    render(<ProviderSettings />);
    await screen.findByRole("heading", { name: "DeepSeek" });
    await userEvent.click(screen.getByRole("button", { name: "DeepSeek" }));

    expect(await screen.findByRole("heading", { name: "DeepSeek", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回连接" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "测试连接" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "返回连接" }));
    expect(await screen.findByRole("heading", { name: "DeepSeek", level: 4 })).toBeInTheDocument();
  });

  it("keeps provider detail aligned to the Maka two-column sections", async () => {
    const updateModel = vi.fn(async () => ({ ok: true as const, model: installedModel }));
    window.actspace = {
      listProviders: async () => ({ providers: providerViews, credentialStorage: readyCredentialStorage }),
      listInstalledModels: async () => ({ models: [installedModel] }),
      updateModel,
    } as unknown as ActspaceBridge;

    render(<ProviderSettings settings={settings} />);
    await userEvent.click(await screen.findByRole("button", { name: /^DeepSeek/ }));

    expect(screen.getByRole("heading", { name: "DeepSeek", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "连接", level: 4 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "高级连接设置", level: 4 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑自定义请求头" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑额外请求体（JSON）" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "模型", level: 4 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "删除连接", level: 4 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择启用模型" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "测试连接" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "更新模型目录" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "测试" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "移除" })).not.toBeInTheDocument();
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

    render(<TaskModelDefaultsSection settings={settings} />);
    await screen.findByLabelText("轻量任务模型");
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

  });

  it("updates model enablement from the model directory", async () => {
    const updateModel = vi.fn(async () => ({ ok: true as const, model: installedModel }));
    window.actspace = {
      listInstalledModels: async () => ({ models: [installedModel] }),
      updateModel,
    } as unknown as ActspaceBridge;

    render(<ModelSettings settings={settings} />);
    await userEvent.click(await screen.findByRole("switch", { name: `启用 ${installedModel.definition.label}` }));
    await waitFor(() => expect(updateModel).toHaveBeenCalledWith({ modelKey: installedModel.definition.key, enabled: false }));
  });

  it("uses a searchable multi-select for models inside provider details", async () => {
    const updateModel = vi.fn(async () => ({ ok: true as const, model: installedModel }));
    window.actspace = {
      listInstalledModels: async () => ({ models: [installedModel] }),
      updateModel,
    } as unknown as ActspaceBridge;

    render(<ModelSettings settings={settings} embedded providerFilter="deepseek" />);
    await userEvent.click(await screen.findByRole("button", { name: "选择启用模型" }));
    expect(screen.getByRole("textbox", { name: "搜索模型" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "全部启用" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: installedModel.definition.label }));
    await waitFor(() => expect(updateModel).toHaveBeenCalledWith({ modelKey: installedModel.definition.key, enabled: false }));
  });

  it("shows the blocking references when an in-use catalog model cannot be removed", async () => {
    const removeModel = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: "model_in_use" as const,
        message: "模型正在使用中，不能删除。",
        references: ["utilityModel" as const, "exploreModel" as const],
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
    expect(screen.getByRole("alert")).toHaveTextContent("模型正在使用中，不能删除。（utilityModel、exploreModel）");
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

it("refreshes the DeepSeek catalog, reloads installed models, and reports errors without dropping them", async () => {
  const listInstalledModels = vi.fn(async () => ({ models: [] }));
  const reloadModelCatalog = vi.fn(async () => ({ provider: "deepseek" as const, state: "fresh" as const, stale: false, models: [{ ...openRouterModel, provider: "deepseek" as const, apiModel: "deepseek-flash" }], skippedCount: 0, fetchedAt: "2026-09-10T05:00:00Z" }));
  const onChanged = vi.fn();
  window.actspace = { listProviders: async () => ({ providers: providerViews, credentialStorage: readyCredentialStorage }), listInstalledModels, reloadModelCatalog } as unknown as ActspaceBridge;
  render(<ProviderSettings settings={{ providers: providerViews } as AppSettings} onChanged={onChanged} />);
  await userEvent.click(await screen.findByRole("button", { name: /^DeepSeek/ }));
  const before = listInstalledModels.mock.calls.length;
  await userEvent.click(screen.getByRole("button", { name: "更新模型目录" }));
  expect(reloadModelCatalog).toHaveBeenCalledWith({ provider: "deepseek" });
  await screen.findByText(/已更新 1 个模型/);
  expect(onChanged).toHaveBeenCalled();
  expect(listInstalledModels.mock.calls.length).toBeGreaterThan(before);
  reloadModelCatalog.mockRejectedValueOnce(new Error("network"));
  await userEvent.click(screen.getByRole("button", { name: "更新模型目录" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("已保留本地目录");
  expect(screen.getByRole("button", { name: "更新模型目录" })).toBeEnabled();
});

it("adds a DeepSeek catalog model using its own provider and refreshes consumers", async () => {
  const onAdded = vi.fn();
  const listModelCatalog = vi.fn(async () => ({ provider: "deepseek", state: "fresh", stale: false, models: [{ ...openRouterModel, provider: "deepseek", apiModel: "deepseek-flash", name: "DeepSeek V4.1 Flash" }], skippedCount: 0 }));
  const addModel = vi.fn(async () => ({ ok: true }));
  window.actspace = { listModelCatalog, addModel } as unknown as ActspaceBridge;
  render(<OpenRouterModelCatalogDialog provider="deepseek" onAdded={onAdded} onClose={() => {}} />);
  await userEvent.click(await screen.findByRole("button", { name: "添加" }));
  expect(addModel).toHaveBeenCalledWith({ provider: "deepseek", apiModel: "deepseek-flash" });
  expect(onAdded).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "已添加" })).toBeDisabled();
});
