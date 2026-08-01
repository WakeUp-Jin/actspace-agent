import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppSettings, LocalUpdateState, SessionListItem } from "@actspace/shared";
import { SettingsPage } from "../components/settings/SettingsPage";
import { TooltipProvider } from "../components/ui/Tooltip";

function makeSettings(over: Partial<AppSettings> = {}): AppSettings {
  const base: AppSettings = {
    version: 1,
    defaultModelId: null,
    providers: { deepseek: { hasApiKey: false }, kimi: { hasApiKey: true } },
    searchProviders: {
      zhipu: { hasApiKey: false },
      tavily: { hasApiKey: false },
      tinyfish: { hasApiKey: false },
      exa: { hasApiKey: false },
    },
    agent: {
      systemPromptPath: "/tmp/actspace/prompts/main-agent.md",
      temperature: null,
      maxTokens: null,
      disabledTools: [],
      bashAlwaysAsk: false,
      exploreModelId: null,
    },
    kairos: { modelId: null, thinking: "auto", enabledSkills: [] },
    plugins: { repoRoot: null, fsWatch: { enabled: false } },
    skills: { disabled: [] },
  };
  return {
    ...base,
    ...over,
    providers: over.providers ? { ...base.providers, ...over.providers } : base.providers,
    agent: over.agent ? { ...base.agent, ...over.agent } : base.agent,
    kairos: over.kairos ? { ...base.kairos, ...over.kairos } : base.kairos,
  };
}

type ActspaceBridge = NonNullable<typeof window.actspace>;

function makeLocalUpdateState(over: Partial<LocalUpdateState> = {}): LocalUpdateState {
  return {
    sourceRoot: "/repo/actspace-agent",
    sourceValid: true,
    appExecutablePath: "/Applications/Actspace.app/Contents/MacOS/Actspace",
    appIsPackaged: true,
    appPath: "/Applications/Actspace.app",
    installParent: "/Applications",
    canUpdate: true,
    logPath: "/Users/test/Library/Application Support/actspace/tmp/local-update/update.log",
    running: false,
    progress: {
      phase: "idle",
      message: "尚未开始本地更新。",
    },
    ...over,
  };
}

const archivedSessions: SessionListItem[] = [
  {
    id: "session-archived-1",
    title: "Archived planning session",
    updatedAt: "2026-06-01T10:00:00.000Z",
    agentRunCount: 4,
    workspaceRoot: "/repo/actspace-agent",
    archived: true,
  },
];

function renderSettingsPage(props: Parameters<typeof SettingsPage>[0] = { onBack: () => {} }) {
  return render(
    <TooltipProvider delayDuration={0}>
      <SettingsPage {...props} />
    </TooltipProvider>,
  );
}

describe("SettingsPage", () => {
  const getSettings = vi.fn(async () => makeSettings());
  const updateSettings = vi.fn(async (input) => makeSettings(input as Partial<AppSettings>));
  const readAgentSystemPrompt = vi.fn(async () => ({
    path: "/tmp/actspace/prompts/main-agent.md",
    content: "Default main agent prompt",
  }));
  const writeAgentSystemPrompt = vi.fn(async (input: { content: string }) => ({
    path: "/tmp/actspace/prompts/main-agent.md",
    content: input.content,
  }));

  it("opens analysis observability from the settings navigation", async () => {
    const onOpenAnalysis = vi.fn();
    renderSettingsPage({ onBack: () => {}, onOpenAnalysis });
    await userEvent.click(await screen.findByRole("button", { name: "分析观测" }));
    expect(onOpenAnalysis).toHaveBeenCalledTimes(1);
  });
  const setProviderKey = vi.fn(async () => ({ ok: true }));
  const clearProviderKey = vi.fn(async () => ({ ok: true }));
  const testProviderConnection = vi.fn(async () => ({ ok: true, message: "连接成功" }));
  const listProviders = vi.fn(async () => ({
    providers: {
      deepseek: { provider: "deepseek" as const, hasApiKey: false, baseUrl: null, proxy: { enabled: false, url: null }, installedModelCount: 2, enabledModelCount: 2 },
      kimi: { provider: "kimi" as const, hasApiKey: true, baseUrl: null, proxy: { enabled: false, url: null }, installedModelCount: 2, enabledModelCount: 2 },
      openrouter: { provider: "openrouter" as const, hasApiKey: false, baseUrl: null, proxy: { enabled: false, url: null }, installedModelCount: 0, enabledModelCount: 0 },
    },
  }));
  const connectProvider = vi.fn(async () => ({ ok: true as const, provider: (await listProviders()).providers.deepseek }));
  const updateProvider = vi.fn(async () => ({ ok: true as const, provider: (await listProviders()).providers.openrouter }));
  const disconnectProvider = vi.fn(async () => ({ ok: true as const, provider: (await listProviders()).providers.kimi }));
  const getProviderBalance = vi.fn(async ({ provider }: { provider: "deepseek" | "kimi" | "openrouter" }) => ({
    provider,
    isConfigured: true,
    isAvailable: true,
    generatedAt: "2026-07-25T08:00:00.000Z",
    displayBalance: provider === "openrouter"
      ? { amount: "74.75", currency: "USD" }
      : { amount: "31.11", currency: "CNY" },
  }));
  const listInstalledModels = vi.fn(async () => ({ models: [] }));
  const listUsableModels = vi.fn(async () => ({ models: [] }));
  const updateImageGeneration = vi.fn(async () => ({ ok: true as const }));
  const getLocalUpdateState = vi.fn(async () => makeLocalUpdateState());
  const selectLocalUpdateSource = vi.fn(async () => ({ canceled: false, state: makeLocalUpdateState({ sourceRoot: "/repo/new" }) }));
  const startLocalUpdate = vi.fn(async () => ({
    ok: true,
    state: makeLocalUpdateState({
      running: true,
      canUpdate: false,
      progress: {
        phase: "building",
        message: "正在从源码构建 Actspace.app…",
        startedAt: "2026-06-04T15:00:00.000Z",
        updatedAt: "2026-06-04T15:00:01.000Z",
      },
    }),
  }));
  const listSessions = vi.fn(async (input?: { archived?: boolean }) => (input?.archived ? archivedSessions : []));
  const archiveSession = vi.fn(async () => ({ ok: true }));
  const listWorkspaces = vi.fn(async () => ({ version: 1 as const, defaultWorkspaceId: "default", items: [] }));
  const getQuickOpenShortcutStatus = vi.fn(async () => ({
    registered: true,
    accelerator: "CommandOrControl+Shift+Space",
  }));
  const updateQuickOpenShortcut = vi.fn(async (input: { enabled?: boolean }) => {
    const settings = makeSettings({
      shortcuts: {
        quickOpen: {
          enabled: input.enabled ?? true,
          accelerator: "CommandOrControl+Shift+Space",
          target: { kind: "automatic" },
        },
      },
    });
    return {
      ok: true as const,
      settings,
      status: { registered: input.enabled ?? true, accelerator: "CommandOrControl+Shift+Space" },
    };
  });
  const setUiZoom = vi.fn();
  const setNativeTheme = vi.fn();

  beforeEach(() => {
    getSettings.mockClear();
    updateSettings.mockClear();
    readAgentSystemPrompt.mockClear();
    writeAgentSystemPrompt.mockClear();
    setProviderKey.mockClear();
    clearProviderKey.mockClear();
    testProviderConnection.mockClear();
    listProviders.mockClear();
    connectProvider.mockClear();
    updateProvider.mockClear();
    disconnectProvider.mockClear();
    getProviderBalance.mockClear();
    listInstalledModels.mockClear();
    listUsableModels.mockClear();
    updateImageGeneration.mockClear();
    getLocalUpdateState.mockReset();
    selectLocalUpdateSource.mockClear();
    startLocalUpdate.mockReset();
    listSessions.mockClear();
    archiveSession.mockClear();
    listWorkspaces.mockClear();
    getQuickOpenShortcutStatus.mockClear();
    updateQuickOpenShortcut.mockClear();
    setUiZoom.mockClear();
    setNativeTheme.mockClear();
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    getLocalUpdateState.mockImplementation(async () => makeLocalUpdateState());
    startLocalUpdate.mockImplementation(async () => ({
      ok: true,
      state: makeLocalUpdateState({
        running: true,
        canUpdate: false,
        progress: {
          phase: "building",
          message: "正在从源码构建 Actspace.app…",
          startedAt: "2026-06-04T15:00:00.000Z",
          updatedAt: "2026-06-04T15:00:01.000Z",
        },
      }),
    }));
    window.actspace = {
      getSettings,
      updateSettings,
      readAgentSystemPrompt,
      writeAgentSystemPrompt,
      setProviderKey,
      clearProviderKey,
      testProviderConnection,
      listProviders,
      connectProvider,
      updateProvider,
      disconnectProvider,
      getProviderBalance,
      listInstalledModels,
      listUsableModels,
      updateImageGeneration,
      getLocalUpdateState,
      selectLocalUpdateSource,
      startLocalUpdate,
      listSessions,
      archiveSession,
      listWorkspaces,
      getQuickOpenShortcutStatus,
      updateQuickOpenShortcut,
      setUiZoom,
      setNativeTheme,
    } as unknown as ActspaceBridge;
  });

  afterEach(() => {
    delete (window as { actspace?: ActspaceBridge }).actspace;
  });

  it("loads settings and renders the general section by default", async () => {
    renderSettingsPage();
    expect(await screen.findByRole("switch", { name: "自动审查" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "通用" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "更新" })).toBeInTheDocument();
    expect(screen.getByLabelText("界面语言")).toBeDisabled();
    expect(getLocalUpdateState).not.toHaveBeenCalled();
  });

  it("shows the quick open shortcut section and persists its enabled state", async () => {
    renderSettingsPage();
    await userEvent.click(await screen.findByRole("button", { name: "快捷键" }));
    const toggle = await screen.findByRole("switch", { name: "启用快速唤起" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "录制快速唤起快捷键" })).toHaveTextContent("CommandOrControl+Shift+Space");

    await userEvent.click(toggle);

    expect(updateQuickOpenShortcut).toHaveBeenCalledWith({ enabled: false });
  });

  it("keeps the settings nav fixed while the content pane owns vertical scrolling", async () => {
    renderSettingsPage();
    expect(await screen.findByRole("switch", { name: "自动审查" })).toBeInTheDocument();

    expect(screen.getByTestId("settings-page-shell")).toHaveClass("h-screen", "overflow-hidden");
    expect(screen.getByRole("navigation", { name: "设置导航" })).not.toHaveClass("overflow-y-auto");
    expect(screen.getByRole("main", { name: "设置内容" })).toHaveClass("overflow-y-auto");
  });

  it("toggling 自动审查 calls updateSettings with bashAlwaysAsk", async () => {
    renderSettingsPage();
    const toggle = await screen.findByRole("switch", { name: "自动审查" });
    await userEvent.click(toggle);
    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({ agent: { bashAlwaysAsk: true } });
    });
  });

  it("本地更新分区可选择源码目录并启动更新", async () => {
    getLocalUpdateState
      .mockResolvedValueOnce(makeLocalUpdateState())
      .mockResolvedValue(makeLocalUpdateState({
        running: true,
        canUpdate: false,
        progress: {
          phase: "building",
          message: "正在从源码构建 Actspace.app…",
          startedAt: "2026-06-04T15:00:00.000Z",
          updatedAt: "2026-06-04T15:00:01.000Z",
        },
      }));

    renderSettingsPage();
    await screen.findByRole("switch", { name: "自动审查" });

    await userEvent.click(screen.getByRole("button", { name: "更新" }));

    expect(await screen.findByText("/repo/actspace-agent")).toBeInTheDocument();
    expect(screen.getByText("/Applications/Actspace.app")).toBeInTheDocument();
    expect(screen.getByText("当前进程：/Applications/Actspace.app/Contents/MacOS/Actspace")).toBeInTheDocument();
    expect(screen.getByText("Electron packaged：是")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "选择目录" }));
    await waitFor(() => {
      expect(selectLocalUpdateSource).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("/repo/new")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "构建并更新" }));
    await waitFor(() => {
      expect(startLocalUpdate).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("本地更新已启动，正在构建。")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "本地更新进度" })).toBeInTheDocument();
    expect(screen.getByText("正在从源码构建 Actspace.app…")).toBeInTheDocument();
    expect(screen.getByText("构建阶段不会退出应用；构建完成后才会关闭窗口并执行替换。")).toBeInTheDocument();
  });

  it("本地更新弹窗可显示失败状态并关闭", async () => {
    startLocalUpdate.mockResolvedValueOnce({
      ok: true,
      state: makeLocalUpdateState({
        running: true,
        canUpdate: false,
        progress: {
          phase: "building",
          message: "正在从源码构建 Actspace.app…",
          startedAt: "2026-06-04T15:00:00.000Z",
          updatedAt: "2026-06-04T15:00:01.000Z",
        },
      }),
    });
    getLocalUpdateState
      .mockResolvedValueOnce(makeLocalUpdateState())
      .mockResolvedValueOnce(makeLocalUpdateState({
        running: false,
        canUpdate: true,
        progress: {
          phase: "failed",
          message: "未找到 pnpm，请确认 Homebrew 路径已加入环境。",
          startedAt: "2026-06-04T15:00:00.000Z",
          updatedAt: "2026-06-04T15:00:02.000Z",
          finishedAt: "2026-06-04T15:00:02.000Z",
        },
      }));

    renderSettingsPage();
    await screen.findByRole("switch", { name: "自动审查" });
    await userEvent.click(screen.getByRole("button", { name: "更新" }));
    await userEvent.click(await screen.findByRole("button", { name: "构建并更新" }));

    expect(await screen.findByText("未找到 pnpm，请确认 Homebrew 路径已加入环境。")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog", { name: "本地更新进度" })).not.toBeInTheDocument();
  });

  it("connecting a provider opens the key modal and saves the key", async () => {
    renderSettingsPage();
    await screen.findByRole("switch", { name: "自动审查" });

    await userEvent.click(screen.getByRole("button", { name: "服务商" }));
    await userEvent.click(await screen.findByRole("button", { name: "添加服务" }));
    await userEvent.click(screen.getByRole("button", { name: "选择 DeepSeek" }));

    const input = await screen.findByLabelText("DeepSeek API Key");
    await userEvent.type(input, "sk-test-123");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(connectProvider).toHaveBeenCalledWith({
        provider: "deepseek",
        apiKey: "sk-test-123",
        baseUrl: null,
        proxy: { enabled: false, url: null },
      });
    });
  });

  it("服务商卡片显示账户余额并支持手动刷新", async () => {
    renderSettingsPage();
    await screen.findByRole("switch", { name: "自动审查" });

    await userEvent.click(screen.getByRole("button", { name: "服务商" }));
    const balance = await screen.findByLabelText("Kimi 账户余额");
    expect(balance).toHaveTextContent("¥31.11 CNY");

    await userEvent.click(screen.getByRole("button", { name: "刷新 Kimi 账户余额" }));
    await waitFor(() => expect(getProviderBalance).toHaveBeenCalledTimes(2));
  });

  it("图片生成服务用摘要卡片打开配置弹窗，并把兼容地址收进高级设置", async () => {
    getSettings.mockResolvedValueOnce(makeSettings({
      imageGeneration: {
        hasApiKey: false,
        baseUrl: "https://www.duckcoding.ai/v1",
        model: "gpt-image-2",
      },
    }));
    renderSettingsPage();
    await screen.findByRole("switch", { name: "自动审查" });

    await userEvent.click(screen.getByRole("button", { name: "服务商" }));
    expect(await screen.findByText("未配置")).toBeInTheDocument();
    expect(screen.queryByLabelText("图片生成服务 API Key")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "配置图片生成服务" }));
    expect(screen.getByRole("dialog", { name: "配置图片生成服务" })).toBeInTheDocument();
    expect(screen.getByLabelText("图片生成服务 API Key")).toBeInTheDocument();
    expect(screen.queryByLabelText("Base URL")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "高级设置" }));
    expect(screen.getByLabelText("Base URL")).toHaveValue("https://www.duckcoding.ai/v1");
    expect(screen.getByLabelText("模型名称")).toHaveValue("gpt-image-2");

    await userEvent.type(screen.getByLabelText("图片生成服务 API Key"), "sk-image-test");
    await userEvent.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() => {
      expect(updateImageGeneration).toHaveBeenCalledWith({
        apiKey: "sk-image-test",
        baseUrl: "https://www.duckcoding.ai/v1",
        model: "gpt-image-2",
      });
    });
  });

  it("图片分析默认使用 OpenRouter Luna，并可切换到 Kimi 已有凭据", async () => {
    getSettings.mockResolvedValueOnce(makeSettings({
      providers: {
        deepseek: { hasApiKey: false },
        kimi: { hasApiKey: true },
        openrouter: { hasApiKey: true },
      },
      imageInspection: { modelKey: "openrouter:openai/gpt-5.6-luna" },
    }));
    renderSettingsPage();
    await screen.findByRole("switch", { name: "自动审查" });

    await userEvent.click(screen.getByRole("button", { name: "服务商" }));
    expect(await screen.findByText("openai/gpt-5.6-luna")).toBeInTheDocument();
    expect(screen.getByText("可用")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("图片分析模型"));
    await userEvent.click(await screen.findByRole("option", { name: "Kimi K2.7 Code · Kimi" }));

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({
        imageInspection: { modelKey: "kimi:kimi-k2.7-code", credentialId: undefined },
      });
    });
  });

  it("已配置的图片服务不回显 Key，并可从弹窗更换或断开", async () => {
    getSettings.mockResolvedValueOnce(makeSettings({
      imageGeneration: {
        hasApiKey: true,
        baseUrl: "https://www.duckcoding.ai/v1",
        model: "gpt-image-2",
      },
    }));
    renderSettingsPage();
    await screen.findByRole("switch", { name: "自动审查" });

    await userEvent.click(screen.getByRole("button", { name: "服务商" }));
    expect(await screen.findByText("已配置")).toBeInTheDocument();
    expect(screen.getByText("gpt-image-2 · www.duckcoding.ai")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "编辑图片生成服务配置" }));
    expect(screen.getByText("API Key 已安全保存")).toBeInTheDocument();
    expect(screen.queryByLabelText("图片生成服务 API Key")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "更换 Key" }));
    expect(screen.getByLabelText("图片生成服务 API Key")).toHaveAttribute("placeholder", "输入新 Key；留空保持现有 Key");

    await userEvent.click(screen.getByRole("button", { name: "断开服务" }));
    await waitFor(() => {
      expect(clearProviderKey).toHaveBeenCalledWith({ provider: "image-generation" });
    });
  });

  it("OpenRouter 编辑弹窗可保存独立 Management Key", async () => {
    listProviders.mockResolvedValueOnce({
      providers: {
        deepseek: { provider: "deepseek" as const, hasApiKey: false, baseUrl: null, proxy: { enabled: false, url: null }, installedModelCount: 2, enabledModelCount: 2 },
        kimi: { provider: "kimi" as const, hasApiKey: false, baseUrl: null, proxy: { enabled: false, url: null }, installedModelCount: 2, enabledModelCount: 2 },
        openrouter: { provider: "openrouter" as const, hasApiKey: true, baseUrl: null, proxy: { enabled: false, url: null }, installedModelCount: 1, enabledModelCount: 1 },
      },
    });
    renderSettingsPage();
    await screen.findByRole("switch", { name: "自动审查" });

    await userEvent.click(screen.getByRole("button", { name: "服务商" }));
    await userEvent.click(await screen.findByRole("button", { name: "编辑" }));
    await userEvent.type(screen.getByLabelText("OpenRouter Management Key"), "sk-or-management");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(updateProvider).toHaveBeenCalledWith(expect.objectContaining({
        provider: "openrouter",
        managementKey: "sk-or-management",
      }));
    });
  });

  it("disabling a tool writes it into disabledTools", async () => {
    renderSettingsPage();
    await screen.findByRole("switch", { name: "自动审查" });

    await userEvent.click(screen.getByRole("button", { name: "工具" }));
    const readToggle = await screen.findByRole("switch", { name: "读取文件" });
    expect(readToggle).toHaveAttribute("aria-checked", "true");

    await userEvent.click(readToggle);
    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({ agent: { disabledTools: ["read_file"] } });
    });
  });

  it("groups browser tools behind one master switch and collapsed advanced settings", async () => {
    renderSettingsPage();
    await screen.findByRole("switch", { name: "自动审查" });

    await userEvent.click(screen.getByRole("button", { name: "工具" }));
    expect(screen.getByRole("switch", { name: "浏览器" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("switch", { name: "浏览器 CUA" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "浏览器高级设置" }));
    expect(screen.getByRole("switch", { name: "浏览器 CUA" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "浏览器文件上传" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "浏览器" }));
    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({ agent: { disabledTools: ["browser"] } });
    });
    expect(screen.getByRole("switch", { name: "浏览器 CUA" })).toBeDisabled();
  });

  it("editing 主 Agent 系统提示词 saves it through the prompt file", async () => {
    renderSettingsPage();
    await screen.findByRole("switch", { name: "自动审查" });

    await userEvent.click(screen.getByRole("button", { name: "智能体" }));
    const promptInput = await screen.findByLabelText("主 Agent 自定义系统提示词");
    expect(promptInput).toHaveValue("Default main agent prompt");

    await userEvent.clear(promptInput);
    await userEvent.type(promptInput, "Use short Chinese answers.");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(writeAgentSystemPrompt).toHaveBeenCalledWith({ content: "Use short Chinese answers." });
    });
    expect(updateSettings).not.toHaveBeenCalledWith(expect.objectContaining({ agent: expect.anything() }));
  });

  it("separates provider connection state from model task selection", async () => {
    renderSettingsPage();
    await screen.findByRole("switch", { name: "自动审查" });

    await userEvent.click(screen.getByRole("button", { name: "服务商" }));
    expect(await screen.findByRole("button", { name: "断开" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "模型" }));
    expect(await screen.findByLabelText("默认会话模型")).toBeInTheDocument();
    expect(screen.getByLabelText("轻量任务模型")).toBeInTheDocument();
  });

  it("归档会话分区加载归档列表并支持恢复", async () => {
    const onArchivedSessionsChange = vi.fn();
    renderSettingsPage({ onBack: () => {}, onArchivedSessionsChange });
    await screen.findByRole("switch", { name: "自动审查" });

    await userEvent.click(screen.getByRole("button", { name: "归档会话" }));

    expect(await screen.findByText("Archived planning session")).toBeInTheDocument();
    expect(listSessions).toHaveBeenCalledWith({ archived: true });

    await userEvent.click(screen.getByRole("button", { name: "恢复" }));

    await waitFor(() => {
      expect(archiveSession).toHaveBeenCalledWith({ sessionId: "session-archived-1", archived: false });
      expect(onArchivedSessionsChange).toHaveBeenCalledTimes(1);
    });
  });

  it("归档会话分区显示空状态", async () => {
    listSessions.mockResolvedValueOnce([]);
    renderSettingsPage();
    await screen.findByRole("switch", { name: "自动审查" });

    await userEvent.click(screen.getByRole("button", { name: "归档会话" }));

    expect(await screen.findByText("暂无归档会话")).toBeInTheDocument();
  });

  it("外观分区可改字体与字号并持久化", async () => {
    renderSettingsPage();
    await screen.findByRole("switch", { name: "自动审查" });

    await userEvent.click(screen.getByRole("button", { name: "外观" }));

    await userEvent.click(await screen.findByLabelText("界面字体"));
    await userEvent.click(await screen.findByRole("option", { name: "阅读衬线" }));
    expect(document.documentElement.style.getPropertyValue("--act-font-ui")).toContain("Georgia");
    expect(localStorage.getItem("actspace.appearance.v1")).toContain("serif-reading");

    await userEvent.click(screen.getByRole("button", { name: "代码字号增大" }));
    expect(document.documentElement.style.getPropertyValue("--act-font-mono-size")).toBe("14px");

    await userEvent.click(screen.getByRole("button", { name: "界面字号增大" }));
    expect(localStorage.getItem("actspace.appearance.v1")).toContain('"uiFontSize":15');
    expect(setUiZoom).toHaveBeenCalledWith(15 / 14);
  });

  it("外观字号步进器图标按钮有可读 tooltip", async () => {
    renderSettingsPage();
    await screen.findByRole("switch", { name: "自动审查" });

    await userEvent.click(screen.getByRole("button", { name: "外观" }));
    const increaseButton = screen.getByRole("button", { name: "代码字号增大" });

    await userEvent.hover(increaseButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("增大 代码字号");
  });

  it("外观分区切换主题写 data-theme、同步原生主题并持久化", async () => {
    renderSettingsPage();
    await screen.findByRole("switch", { name: "自动审查" });

    await userEvent.click(screen.getByRole("button", { name: "外观" }));

    await userEvent.click(await screen.findByRole("radio", { name: "深色" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(setNativeTheme).toHaveBeenCalledWith("dark");
    expect(localStorage.getItem("actspace.appearance.v1")).toContain('"theme":"dark"');

    await userEvent.click(screen.getByRole("radio", { name: "跟随系统" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("system");
    expect(setNativeTheme).toHaveBeenCalledWith("system");
  });
});
