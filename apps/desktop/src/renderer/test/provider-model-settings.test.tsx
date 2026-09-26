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

  it("groups the catalog, hides the three old protocol entries, and keeps 自定义服务 at the bottom", async () => {
    window.actspace = {
      listProviders: async () => ({ providers: {}, credentialStorage: readyCredentialStorage }),
      getSettingsV4: async () => ({ settings: { models: { connections: { relay: { connectionId: "relay", providerId: "openrouter", catalogId: "anthropic-compatible", displayName: "Existing relay", baseUrl: "https://relay.example", enabled: true } } } } }),
    } as unknown as ActspaceBridge;
    render(<ProviderSettings />);
    // 已保存的旧连接照常显示。
    expect(await screen.findByRole("button", { name: /Existing relay/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "添加服务" }));
    const names = ["Moonshot", "DeepSeek", "MiniMax", "OpenAI", "Anthropic", "Z.AI", "Xiaomi", "火山方舟 Coding Plan", "OpenRouter", "自定义服务"];
    expect(screen.getAllByRole("button", { name: /^选择 / }).map((row) => row.getAttribute("aria-label"))).toEqual(names.map((name) => `选择 ${name}`));
    expect(screen.queryByLabelText("服务商类型")).not.toBeInTheDocument();
    for (const label of ["官方直连", "Coding Plan", "第三方兼容"]) expect(screen.getByText(label)).toBeInTheDocument();
    const fallback = screen.getByRole("heading", { name: "没有找到？" }).closest("section")!;
    expect(within(fallback).getByRole("button", { name: "选择 自定义服务" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("搜索模型服务"), "volc");
    expect(screen.getAllByRole("button", { name: /^选择 / }).map((row) => row.getAttribute("aria-label"))).toEqual(["选择 火山方舟 Coding Plan", "选择 自定义服务"]);
    expect(screen.queryByText("官方直连")).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("搜索模型服务"));
    await userEvent.type(screen.getByLabelText("搜索模型服务"), "nothing-matches");
    expect(screen.getByText("列表里没有匹配的服务商。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择 自定义服务" })).toBeInTheDocument();
  });

  it("walks the custom service wizard: test with Bearer fallback, preselect models, save with reference pricing", async () => {
    const ids = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5", "claude-opus-4-5", "relay-alpha", "relay-beta", "relay-gamma", "relay-delta", "relay-epsilon"];
    const probeCustomConnection = vi.fn(async () => ({ ok: true, message: "ok", checkedAt: "2026-09-26T00:00:00.000Z", resolvedAuth: "bearer", models: ids.map((id) => ({ id })) }));
    const connections: Record<string, unknown> = {};
    const createCustomConnection = vi.fn(async (input: { connectionId: string }) => {
      connections[input.connectionId] = { connectionId: input.connectionId, providerId: "openrouter", protocol: "anthropic-messages", catalogId: "custom", displayName: "relay.example", baseUrl: "https://relay.example", defaultModel: "claude-sonnet-5", proxy: { enabled: false, url: null }, lastConnection: { status: "untested" }, enabled: true };
      return {};
    });
    const testCustomConnection = vi.fn();
    window.actspace = {
      listProviders: async () => ({ providers: {}, credentialStorage: readyCredentialStorage }),
      getSettingsV4: async () => ({ settings: { models: { connections } } }),
      listInstalledModels: async () => ({ models: [] }),
      probeCustomConnection,
      createCustomConnection,
      testCustomConnection,
    } as unknown as ActspaceBridge;
    render(<ProviderSettings />);
    await userEvent.click(await screen.findByRole("button", { name: "添加服务" }));
    await userEvent.click(screen.getByRole("button", { name: "选择 自定义服务" }));
    expect(screen.getByRole("heading", { name: "连接自定义服务" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Anthropic Messages" })).toBeChecked();
    expect(screen.getByRole("button", { name: "测试并继续" })).toBeDisabled();

    await userEvent.type(screen.getByLabelText("服务地址"), "https://relay.example/v1");
    expect(screen.getByTestId("request-url")).toHaveTextContent("https://relay.example/v1/messages");
    expect(screen.getByTestId("request-url")).toHaveTextContent("已去掉 /v1");
    await userEvent.type(screen.getByLabelText("API Key"), "fixture-secret");
    await userEvent.click(screen.getByRole("button", { name: "测试并继续" }));
    expect(probeCustomConnection).toHaveBeenCalledWith({ kind: "draft", protocol: "anthropic-messages", baseUrl: "https://relay.example/v1", apiKey: "fixture-secret", authMode: "auto", proxy: { enabled: false, url: null } });

    expect(await screen.findByRole("heading", { name: "选择模型" })).toBeInTheDocument();
    expect(screen.getByText("已选 3 个")).toBeInTheDocument();
    expect(screen.getByLabelText("搜索模型")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /relay-alpha/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("checkbox", { name: /relay-alpha/ }).textContent).toContain("能力未知");
    // 行本身可以用键盘勾选。
    screen.getByRole("checkbox", { name: /relay-alpha/ }).focus();
    await userEvent.keyboard(" ");
    expect(screen.getByRole("checkbox", { name: /relay-alpha/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/^默认：Claude Sonnet 5/)).not.toHaveTextContent("保存后自动测试");
    await userEvent.click(screen.getByRole("group", { name: "倍率" }).querySelector("button[aria-label='倍率增大']")!);

    await userEvent.click(screen.getByRole("button", { name: "保存连接" }));
    await waitFor(() => expect(createCustomConnection).toHaveBeenCalledOnce());
    const input = createCustomConnection.mock.calls[0]![0] as unknown as Record<string, unknown> & { initialModels: { apiModel: string; pricing: unknown }[] };
    expect(input).toEqual(expect.objectContaining({
      providerId: "openrouter",
      protocol: "anthropic-messages",
      displayName: "",
      baseUrl: "https://relay.example/v1",
      apiKey: "fixture-secret",
      catalogId: "custom",
      authMode: "auto",
      resolvedAuth: "bearer",
      billingMode: "reference",
      pricingMultiplier: 0.35,
      defaultApiModel: "claude-sonnet-5",
      promptCacheMode: "short",
    }));
    expect(input.initialModels.map((model) => model.apiModel)).toEqual(["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5", "relay-alpha"]);
    expect(input.initialModels.every((model) => model.pricing === null)).toBe(true);
    // 保存后进入详情页；已经测通并拿到列表，不再自动测试。
    expect(await screen.findByRole("heading", { name: "relay.example" })).toBeInTheDocument();
    expect(testCustomConnection).not.toHaveBeenCalled();
  });

  it("switches the protocol from a pasted endpoint and adds models by hand when the service has no list", async () => {
    const probeCustomConnection = vi.fn(async () => ({ ok: true, message: "ok", checkedAt: "2026-09-26T00:00:00.000Z", models: null }));
    const connections: Record<string, unknown> = {};
    const createCustomConnection = vi.fn(async (input: { connectionId: string; protocol: string }) => {
      connections[input.connectionId] = { connectionId: input.connectionId, providerId: "openrouter", protocol: input.protocol, catalogId: "custom", displayName: "relay.example", baseUrl: "https://relay.example", defaultModel: "claude-sonnet-5", proxy: { enabled: false, url: null }, enabled: true };
      return {};
    });
    const testCustomConnection = vi.fn(async () => ({ ok: true, message: "ok", checkedAt: "2026-09-26T00:00:00.000Z" }));
    window.actspace = {
      listProviders: async () => ({ providers: {}, credentialStorage: readyCredentialStorage }),
      getSettingsV4: async () => ({ settings: { models: { connections } } }),
      listInstalledModels: async () => ({ models: [] }),
      probeCustomConnection,
      createCustomConnection,
      testCustomConnection,
    } as unknown as ActspaceBridge;
    render(<ProviderSettings />);
    await userEvent.click(await screen.findByRole("button", { name: "添加服务" }));
    await userEvent.click(screen.getByRole("button", { name: "选择 自定义服务" }));
    await userEvent.type(screen.getByLabelText("服务地址"), "https://relay.example/v1/chat/completions");
    expect(screen.getByRole("radio", { name: "OpenAI Chat" })).toBeChecked();
    expect(screen.getByText("已根据地址切换")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Anthropic Messages" }));
    expect(screen.getByText("地址和所选协议不一致。")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "OpenAI Chat" }));
    await userEvent.type(screen.getByLabelText("API Key"), "fixture-secret");
    await userEvent.click(screen.getByRole("button", { name: "测试并继续" }));
    expect(await screen.findByRole("heading", { name: "添加模型" })).toBeInTheDocument();
    // OpenAI 协议不显示 Claude 常用项。
    expect(screen.queryByText("常用")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("模型 ID"), "gpt-relay{Enter}");
    await userEvent.type(screen.getByLabelText("模型 ID"), "gpt-relay-mini");
    await userEvent.click(screen.getByRole("button", { name: "添加" }));
    expect(screen.getByRole("button", { name: "移除 gpt-relay-mini" })).toBeInTheDocument();
    expect(screen.getByText(/保存后自动测试/)).toHaveTextContent("默认：gpt-relay");
    await userEvent.click(screen.getByRole("button", { name: "保存连接" }));
    await waitFor(() => expect(createCustomConnection).toHaveBeenCalledWith(expect.objectContaining({
      protocol: "openai-completions",
      defaultApiModel: "gpt-relay",
      promptCacheMode: "off",
      initialModels: [expect.objectContaining({ apiModel: "gpt-relay" }), expect.objectContaining({ apiModel: "gpt-relay-mini" })],
    })));
    expect(createCustomConnection.mock.calls[0]![0]).not.toHaveProperty("authMode");
    await waitFor(() => expect(testCustomConnection).toHaveBeenCalledOnce());
  });

  it("offers Claude shortcuts without a list, stays on step 1 when the test fails, and voids a passed test after the key changes", async () => {
    const probeCustomConnection = vi.fn()
      .mockResolvedValueOnce({ ok: false, message: "请检查 API Key 是否正确。", checkedAt: "2026-09-26T00:00:00.000Z", errorKind: "auth", statusCode: 401, models: null })
      .mockResolvedValue({ ok: true, message: "ok", checkedAt: "2026-09-26T00:00:00.000Z", models: null });
    window.actspace = {
      listProviders: async () => ({ providers: {}, credentialStorage: readyCredentialStorage }),
      probeCustomConnection,
    } as unknown as ActspaceBridge;
    render(<ProviderSettings />);
    await userEvent.click(await screen.findByRole("button", { name: "添加服务" }));
    await userEvent.click(screen.getByRole("button", { name: "选择 自定义服务" }));
    await userEvent.type(screen.getByLabelText("服务地址"), "https://relay.example");
    await userEvent.type(screen.getByLabelText("API Key"), "wrong-key");
    await userEvent.click(screen.getByRole("button", { name: /^更多设置/ }));
    await userEvent.click(screen.getByRole("radio", { name: "x-api-key" }));
    await userEvent.click(screen.getByRole("button", { name: /^更多设置/ }));
    expect(screen.getByRole("button", { name: /更多设置/ })).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(screen.getByRole("button", { name: "测试并继续" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("认证失败（401）");
    expect(screen.getByRole("button", { name: "测试并继续" })).toBeInTheDocument();
    // 固定了认证方式又认证失败时，展开更多设置提示改用自动。
    expect(screen.getByRole("button", { name: /更多设置/ })).toHaveAttribute("aria-expanded", "true");
    expect(probeCustomConnection).toHaveBeenLastCalledWith(expect.objectContaining({ authMode: "x-api-key" }));

    await userEvent.click(screen.getByRole("radio", { name: "自动" }));
    await userEvent.click(screen.getByRole("button", { name: "测试并继续" }));
    expect(await screen.findByRole("heading", { name: "添加模型" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "claude-sonnet-5" }));
    expect(screen.getByRole("button", { name: "移除 claude-sonnet-5" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "claude-sonnet-5" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "上一步" }));
    expect(screen.getByRole("button", { name: "下一步" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("API Key"), "-fixed");
    expect(screen.getByText("连接信息已修改，需要重新测试")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "测试并继续" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "跳过测试" })).toBeInTheDocument();
  });

  it("connects official Anthropic with only a key and saves it at official prices", async () => {
    const probeCustomConnection = vi.fn(async () => ({ ok: true, message: "ok", checkedAt: "2026-09-26T00:00:00.000Z", models: [{ id: "claude-opus-5" }, { id: "claude-sonnet-5" }, { id: "claude-haiku-4-5" }] }));
    const createCustomConnection = vi.fn(async () => ({}));
    window.actspace = {
      listProviders: async () => ({ providers: {}, credentialStorage: readyCredentialStorage }),
      getSettingsV4: async () => ({ settings: { models: { connections: {} } } }),
      probeCustomConnection,
      createCustomConnection,
    } as unknown as ActspaceBridge;
    render(<ProviderSettings />);
    await userEvent.click(await screen.findByRole("button", { name: "添加服务" }));
    await userEvent.click(screen.getByRole("button", { name: "选择 Anthropic" }));
    expect(screen.getByRole("heading", { name: "连接 Anthropic" })).toBeInTheDocument();
    expect(screen.queryByLabelText("服务地址")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "协议" })).not.toBeInTheDocument();
    expect(screen.queryByText("更多设置")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("API Key"), "sk-ant-fixture");
    await userEvent.click(screen.getByRole("button", { name: "测试连接" }));
    expect(probeCustomConnection).toHaveBeenCalledWith({ kind: "draft", protocol: "anthropic-messages", baseUrl: "https://api.anthropic.com", apiKey: "sk-ant-fixture", authMode: "x-api-key" });
    expect(await screen.findByText("已选 3 个")).toBeInTheDocument();
    expect(screen.queryByText("按官方价计费")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "保存连接" }));
    await waitFor(() => expect(createCustomConnection).toHaveBeenCalledWith(expect.objectContaining({
      protocol: "anthropic-messages",
      baseUrl: "https://api.anthropic.com",
      catalogId: "anthropic",
      displayName: "Anthropic",
      authMode: "x-api-key",
      billingMode: "reference",
      pricingMultiplier: 1,
      promptCacheMode: "short",
      defaultApiModel: "claude-sonnet-5",
    })));
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

  it("renames a custom connection inline without retesting it", async () => {
    let connection = { connectionId: "office", providerId: "openrouter", protocol: "openai-completions", catalogId: "openai", displayName: "Office API", baseUrl: "https://example.com/v1", defaultModel: "office-model", proxy: { enabled: false, url: null }, lastConnection: { status: "available", checkedAt: "2026-09-26T00:00:00.000Z" }, enabled: true };
    const updateCustomConnection = vi.fn(async (input: { displayName: string }) => {
      connection = { ...connection, displayName: input.displayName };
      return { settings: { models: { connections: { office: connection } } } };
    });
    const testCustomConnection = vi.fn();
    window.actspace = {
      listProviders: async () => ({ providers: {}, credentialStorage: readyCredentialStorage }),
      getSettingsV4: async () => ({ settings: { models: { connections: { office: connection } } } }),
      listInstalledModels: async () => ({ models: [] }),
      updateCustomConnection,
      testCustomConnection,
    } as unknown as ActspaceBridge;
    render(<ProviderSettings />);
    const row = await screen.findByRole("button", { name: /Office API/ });
    expect(row.querySelector('[data-provider-logo="openai"]')).toBeInTheDocument();
    expect(row).toHaveTextContent("OpenAI Chat · example.com");
    await userEvent.click(row);
    expect(screen.getByRole("heading", { name: "Office API" })).toBeInTheDocument();
    expect(screen.queryByText("office")).not.toBeInTheDocument();
    expect(screen.getByText("已设置")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "编辑名称" }));
    await userEvent.clear(screen.getByLabelText("名称"));
    await userEvent.type(screen.getByLabelText("名称"), "My Gateway");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(updateCustomConnection).toHaveBeenCalledWith(expect.objectContaining({ connectionId: "office", displayName: "My Gateway", baseUrl: "https://example.com/v1" })));
    expect(updateCustomConnection.mock.calls[0]![0]).not.toHaveProperty("apiKey");
    expect(await screen.findByRole("heading", { name: "My Gateway" })).toBeInTheDocument();
    expect(testCustomConnection).not.toHaveBeenCalled();
  });

  it("previews an edited address, saves it, and retests the connection", async () => {
    let connection = { connectionId: "anthropic-relay", providerId: "openrouter", protocol: "anthropic-messages", catalogId: "custom", displayName: "Anthropic Relay", baseUrl: "https://relay.example", defaultModel: "claude-sonnet-5", authMode: "auto", resolvedAuth: "bearer", promptCacheMode: "short", proxy: { enabled: false, url: null }, lastConnection: { status: "untested" } as { status: string; checkedAt?: string }, enabled: true };
    const snapshot = () => ({ settings: { models: { connections: { [connection.connectionId]: connection } } } });
    const updateCustomConnection = vi.fn(async (input: { baseUrl: string }) => { connection = { ...connection, baseUrl: input.baseUrl.replace(/\/v1\/?$/, "") }; return snapshot(); });
    const testCustomConnection = vi.fn(async () => {
      connection = { ...connection, lastConnection: { status: "available", checkedAt: new Date().toISOString() } };
      return { ok: true, message: "ok", checkedAt: new Date().toISOString() };
    });
    window.actspace = {
      listProviders: async () => ({ providers: {}, credentialStorage: readyCredentialStorage }),
      getSettingsV4: async () => snapshot(),
      listInstalledModels: async () => ({ models: [] }),
      updateCustomConnection,
      testCustomConnection,
    } as unknown as ActspaceBridge;
    render(<ProviderSettings />);
    await userEvent.click(await screen.findByRole("button", { name: /Anthropic Relay/ }));
    expect(screen.getByText("https://relay.example/v1/messages")).toBeInTheDocument();
    expect(screen.getByText("自动识别为 Bearer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "认证方式" })).toHaveTextContent("自动");
    await userEvent.click(screen.getByRole("button", { name: "编辑服务地址" }));
    await userEvent.clear(screen.getByLabelText("服务地址"));
    await userEvent.type(screen.getByLabelText("服务地址"), "https://relay2.example/v1");
    expect(screen.getByTestId("request-url")).toHaveTextContent("https://relay2.example/v1/messages");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(updateCustomConnection).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: "https://relay2.example/v1" })));
    await waitFor(() => expect(testCustomConnection).toHaveBeenCalledWith({ connectionId: "anthropic-relay" }));
    expect(await screen.findByText("刚刚通过")).toBeInTheDocument();
  });

  it("hides name, address and auth rows for the official Anthropic connection and prices it officially", async () => {
    const connection = { connectionId: "official", providerId: "openrouter", protocol: "anthropic-messages", catalogId: "anthropic", displayName: "Anthropic", baseUrl: "https://api.anthropic.com", defaultModel: "claude-sonnet-5", authMode: "x-api-key", billingMode: "reference", defaultPricingMultiplier: 1, promptCacheMode: "short", proxy: { enabled: false, url: null }, enabled: true };
    window.actspace = {
      listProviders: async () => ({ providers: {}, credentialStorage: readyCredentialStorage }),
      getSettingsV4: async () => ({ settings: { models: { connections: { official: connection } } } }),
      listInstalledModels: async () => ({ models: [] }),
    } as unknown as ActspaceBridge;
    render(<ProviderSettings />);
    const row = await screen.findByRole("button", { name: /Anthropic/ });
    expect(row).toHaveTextContent("Anthropic 官方 API");
    await userEvent.click(row);
    expect(screen.getByText("Anthropic 官方")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑服务地址" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑名称" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "认证方式" })).not.toBeInTheDocument();
    expect(screen.getByText("按官方价格")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "计费方式" })).not.toBeInTheDocument();
  });

  it("switches billing to reference pricing and steps the multiplier", async () => {
    let connection = { connectionId: "relay", providerId: "openrouter", protocol: "anthropic-messages", catalogId: "anthropic-compatible", displayName: "Relay", baseUrl: "https://relay.example", defaultModel: "claude-sonnet-5", proxy: { enabled: false, url: null }, defaultPricingMultiplier: 1, enabled: true } as Record<string, unknown>;
    const updateCustomConnection = vi.fn(async (input: Record<string, unknown>) => {
      connection = { ...connection, ...(input.billingMode ? { billingMode: input.billingMode } : {}), ...(input.pricingMultiplier !== undefined ? { defaultPricingMultiplier: input.pricingMultiplier } : {}) };
      return { settings: { models: { connections: { relay: connection } } } };
    });
    window.actspace = {
      listProviders: async () => ({ providers: {}, credentialStorage: readyCredentialStorage }),
      getSettingsV4: async () => ({ settings: { models: { connections: { relay: connection } } } }),
      listInstalledModels: async () => ({ models: [] }),
      updateCustomConnection,
    } as unknown as ActspaceBridge;
    render(<ProviderSettings />);
    await userEvent.click(await screen.findByRole("button", { name: /Relay/ }));
    // 旧连接缺省按「逐个填写单价」。
    expect(screen.getByRole("button", { name: "计费方式" })).toHaveTextContent("逐个填写单价");
    expect(screen.queryByRole("group", { name: "倍率" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "计费方式" }));
    await userEvent.click(screen.getByRole("option", { name: "按官方价折算" }));
    await waitFor(() => expect(updateCustomConnection).toHaveBeenCalledWith(expect.objectContaining({ billingMode: "reference" })));
    expect(await screen.findByRole("group", { name: "倍率" })).toHaveTextContent("× 1.00");
    await userEvent.click(screen.getByRole("button", { name: "倍率减小" }));
    await waitFor(() => expect(updateCustomConnection).toHaveBeenLastCalledWith(expect.objectContaining({ pricingMultiplier: 0.9 })));
  });

  it("labels custom connections by their last test result instead of claiming they are connected", async () => {
    const base = { providerId: "openrouter", protocol: "openai-completions", baseUrl: "https://relay.example/v1", enabled: true };
    window.actspace = {
      listProviders: async () => ({ providers: {}, credentialStorage: readyCredentialStorage }),
      getSettingsV4: async () => ({ settings: { models: { connections: {
        fresh: { ...base, connectionId: "fresh", displayName: "Fresh relay" },
        good: { ...base, connectionId: "good", displayName: "Good relay", lastConnection: { status: "available", checkedAt: "2026-09-26T00:00:00.000Z" } },
        bad: { ...base, connectionId: "bad", displayName: "Bad relay", lastConnection: { status: "unavailable", checkedAt: "2026-09-26T00:00:00.000Z" } },
      } } } }),
    } as unknown as ActspaceBridge;
    render(<ProviderSettings />);
    expect(await screen.findByRole("button", { name: /Fresh relay/ })).toHaveTextContent("未测试");
    expect(screen.getByRole("button", { name: /Good relay/ })).toHaveTextContent("可用");
    expect(screen.getByRole("button", { name: /Bad relay/ })).toHaveTextContent("连接异常");
    expect(screen.queryByText("已连接")).not.toBeInTheDocument();
  });

  it("asks before deleting a custom connection and keeps it on cancel", async () => {
    const connection = { connectionId: "anthropic-relay", providerId: "openrouter", protocol: "anthropic-messages", catalogId: "anthropic-compatible", displayName: "Anthropic Relay", baseUrl: "https://relay.example", defaultModel: "claude-opus-alias", enabled: true };
    const removeCustomConnection = vi.fn(async () => ({}));
    window.actspace = {
      listProviders: async () => ({ providers: {}, credentialStorage: readyCredentialStorage }),
      getSettingsV4: async () => ({ settings: { models: { connections: { [connection.connectionId]: connection } } } }),
      listInstalledModels: async () => ({ models: [customConnectionModel] }),
      removeCustomConnection,
    } as unknown as ActspaceBridge;
    render(<ProviderSettings />);
    await userEvent.click(await screen.findByRole("button", { name: /Anthropic Relay/ }));
    await userEvent.click(screen.getByRole("button", { name: "删除" }));
    const dialog = screen.getByRole("alertdialog", { name: "删除 Anthropic Relay？" });
    expect(within(dialog).getByRole("button", { name: "取消" })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(removeCustomConnection).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "删除" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "删除连接" }));
    await waitFor(() => expect(removeCustomConnection).toHaveBeenCalledWith({ connectionId: "anthropic-relay" }));
  });

  it("asks before deleting a custom model, keeps it on Escape, and never deletes the default model", async () => {
    const connection = { connectionId: "anthropic-relay", providerId: "openrouter", protocol: "anthropic-messages", catalogId: "anthropic-compatible", displayName: "Anthropic Relay", baseUrl: "https://relay.example", defaultModel: "claude-sonnet-5", proxy: { enabled: false, url: null }, enabled: true };
    const defaultModel: InstalledModelView = { ...customConnectionModel, definition: { ...customConnectionModel.definition, key: "openrouter:connection/anthropic-relay/claude-sonnet-5", apiModel: "claude-sonnet-5", label: "Claude Sonnet 5" } };
    const removeModel = vi.fn(async () => ({ ok: true as const, model: customConnectionModel }));
    window.actspace = {
      listProviders: async () => ({ providers: {}, credentialStorage: readyCredentialStorage }),
      getSettingsV4: async () => ({ settings: { models: { connections: { [connection.connectionId]: connection } } } }),
      listInstalledModels: async () => ({ models: [defaultModel, customConnectionModel] }),
      removeModel,
    } as unknown as ActspaceBridge;
    render(<ProviderSettings />);
    await userEvent.click(await screen.findByRole("button", { name: /Anthropic Relay/ }));
    expect(await screen.findByRole("switch", { name: "启用 Claude Sonnet 5" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Claude Sonnet 5 更多操作" }));
    expect(screen.getByRole("menuitem", { name: /删除/ })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "设为默认" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("button", { name: "Claude Opus Relay 更多操作" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "删除" }));
    expect(screen.getByRole("alertdialog", { name: "删除 Claude Opus Relay？" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(removeModel).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Claude Opus Relay 更多操作" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "删除" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "删除模型" }));
    await waitFor(() => expect(removeModel).toHaveBeenCalledWith({ modelKey: customConnectionModel.definition.key }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("adds a model inline and refreshes new models from the service as disabled", async () => {
    const connection = { connectionId: "anthropic-relay", providerId: "openrouter", protocol: "anthropic-messages", catalogId: "custom", displayName: "Anthropic Relay", baseUrl: "https://relay.example", defaultModel: "claude-opus-alias", proxy: { enabled: false, url: null }, enabled: true };
    const addCustomModel = vi.fn(async (input: { apiModel: string }) => ({ ok: true as const, model: { ...customConnectionModel, definition: { ...customConnectionModel.definition, key: `k:${input.apiModel}`, label: input.apiModel } } }));
    const probeCustomConnection = vi.fn(async () => ({ ok: true, message: "ok", checkedAt: "2026-09-26T00:00:00.000Z", models: [{ id: "claude-opus-alias" }, { id: "claude-haiku-4-5", label: "Haiku" }] }));
    window.actspace = {
      listProviders: async () => ({ providers: {}, credentialStorage: readyCredentialStorage }),
      getSettingsV4: async () => ({ settings: { models: { connections: { [connection.connectionId]: connection } } } }),
      listInstalledModels: async () => ({ models: [customConnectionModel] }),
      addCustomModel,
      probeCustomConnection,
    } as unknown as ActspaceBridge;
    render(<ProviderSettings />);
    await userEvent.click(await screen.findByRole("button", { name: /Anthropic Relay/ }));
    await userEvent.click(await screen.findByRole("button", { name: "添加" }));
    await userEvent.type(screen.getByLabelText("模型 ID"), "claude-opus-alias{Enter}");
    expect(await screen.findByText("这个模型已在列表里")).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("模型 ID"));
    await userEvent.type(screen.getByLabelText("模型 ID"), "claude-sonnet-5{Enter}");
    await waitFor(() => expect(addCustomModel).toHaveBeenCalledWith(expect.objectContaining({ connectionId: "anthropic-relay", apiModel: "claude-sonnet-5", enabled: true, contextWindow: 1_000_000, pricing: null, setAsConnectionDefault: false })));

    await userEvent.click(screen.getByRole("button", { name: "刷新" }));
    await waitFor(() => expect(probeCustomConnection).toHaveBeenCalledWith({ kind: "saved", connectionId: "anthropic-relay" }));
    await waitFor(() => expect(addCustomModel).toHaveBeenLastCalledWith(expect.objectContaining({ apiModel: "claude-haiku-4-5", label: "Haiku", enabled: false })));
    expect(await screen.findByText("发现 1 个新模型，默认不启用")).toBeInTheDocument();
  });

  it("edits a model: capabilities follow the catalog, reference price is catalog × multiplier, and own prices are submitted", async () => {
    const connection = { connectionId: "relay", providerId: "openrouter", protocol: "anthropic-messages", catalogId: "custom", displayName: "Relay", baseUrl: "https://relay.example", defaultModel: "claude-sonnet-5", billingMode: "reference", defaultPricingMultiplier: 0.3, proxy: { enabled: false, url: null }, enabled: true };
    const sonnet: InstalledModelView = {
      definition: { key: "openrouter:connection/relay/claude-sonnet-5", provider: "openrouter", api: "anthropic-messages", apiModel: "claude-sonnet-5", label: "Claude Sonnet 5", source: "custom", contextWindow: 1_000_000, maxTokens: 128_000, thinkingDefault: true, reasoningConfig: { mode: "auto" }, capabilities: { input: ["text", "image"], toolUse: "declared", reasoning: true, thinkingToggle: true } },
      settings: { enabled: true, addedAt: "2026-09-26T00:00:00.000Z", connectionId: "relay" },
      unavailableReasons: {},
    };
    const editCustomModel = vi.fn(async () => ({ ok: true as const, model: sonnet }));
    window.actspace = {
      listProviders: async () => ({ providers: {}, credentialStorage: readyCredentialStorage }),
      getSettingsV4: async () => ({ settings: { models: { connections: { relay: connection } } } }),
      listInstalledModels: async () => ({ models: [sonnet] }),
      editCustomModel,
    } as unknown as ActspaceBridge;
    render(<ProviderSettings />);
    await userEvent.click(await screen.findByRole("button", { name: /Relay/ }));
    await userEvent.click(await screen.findByRole("button", { name: "编辑 Claude Sonnet 5" }));
    expect(screen.getByText("已从模型目录匹配")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "手动修改能力" })).not.toBeChecked();
    expect(screen.queryByLabelText("上下文窗口")).not.toBeInTheDocument();
    expect(screen.getByText("输入 $0.60 · 输出 $3.00 · 每百万 Token")).toBeInTheDocument();
    expect(screen.getByText("官方价 × 0.30")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "单独设置单价" }));
    for (const [label, value] of [["输入单价", "1"], ["输出单价", "4"], ["缓存读取单价", "0.1"], ["缓存写入单价", "1.25"]] as const) await userEvent.type(screen.getByLabelText(label), value);
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(editCustomModel).toHaveBeenCalledWith(expect.objectContaining({
      modelKey: sonnet.definition.key,
      contextWindow: 1_000_000,
      reasoningConfig: { mode: "auto" },
      pricing: { currency: "USD", inputCacheMissPerMillion: 1, outputPerMillion: 4, inputCacheHitPerMillion: 0.1, inputCacheWritePerMillion: 1.25 },
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
    await userEvent.click(await screen.findByRole("button", { name: "轻量任务模型" }));
    const listbox = await screen.findByRole("listbox", { name: "轻量任务模型" });
    expect(within(listbox).getByText("DeepSeek")).toBeInTheDocument();
    expect(within(listbox).getByText("OpenRouter")).toBeInTheDocument();
    expect(within(listbox).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "未配置",
      "DeepSeek V4 Pro · DeepSeek",
      "DeepSeek V4 Pro · OpenRouter",
    ]);

    await userEvent.click(within(listbox).getByRole("option", { name: "DeepSeek V4 Pro · OpenRouter" }));
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
