/** Explicit visual fixture for the settings center. Never imported by the application entry point. */
import { createRoot } from "react-dom/client";
import { SettingsPage } from "../../components/settings/SettingsPage";
import type { SettingsSectionId } from "../../components/settings/SettingsNav";
import { TooltipProvider } from "../../components/ui/Tooltip";
import "../../styles/index.css";

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get("theme") ?? "light";

const promptPath = "/Users/me/Library/Application Support/ActSpace/prompts/main-agent.md";
const quickOpen = { enabled: true, accelerator: "CommandOrControl+Shift+Space", target: { kind: "automatic" } };
const settings = {
  version: 1,
  defaultModelId: "deepseek:deepseek-v4-flash",
  providers: { deepseek: { hasApiKey: true }, kimi: { hasApiKey: true }, openrouter: { hasApiKey: false } },
  searchProviders: { zhipu: { hasApiKey: true }, tavily: { hasApiKey: false }, tinyfish: { hasApiKey: false }, exa: { hasApiKey: false } },
  agent: { systemPromptPath: promptPath, temperature: null, maxTokens: null, disabledTools: [], bashAlwaysAsk: false, exploreModelId: null },
  skills: { disabled: [] },
  imageGeneration: { hasApiKey: true, baseUrl: "https://www.duckcoding.ai/v1", model: "gpt-image-2" },
  shortcuts: { quickOpen },
  taskModels: { defaultChatModel: "deepseek:deepseek-v4-flash", utilityModel: null, exploreModel: null },
};
const settingsV4 = {
  version: 4,
  revision: "fixture-1",
  settings: {
    version: 4,
    general: {
      personalization: { displayName: "Jin", responseStyle: "简洁直接，先给结论。" },
      agentInstructions: { systemPromptPath: promptPath },
      taskDefaults: { temperature: null, maxOutputTokens: null, chatCompactionTriggerRatio: 0.8 },
      shortcuts: { quickOpen },
    },
    models: { connections: {}, definitions: {}, installed: {}, taskBindings: { defaultChat: null, utility: null, explore: null } },
    tools: { disabledTools: [], bash: { alwaysAsk: false }, searchProviders: {} },
    media: {
      imageGeneration: { baseUrl: "https://www.duckcoding.ai/v1", model: "gpt-image-2" },
      imageInspection: { modelKey: "openrouter:openai/gpt-5.6-luna" },
      speech: { model: "speech-2.8-turbo", voiceId: "English_Insightful_Speaker", speed: 1 },
    },
    skills: { disabled: [] },
    subagents: { routes: {} },
    activity: { usage: { range: "30d", status: "all", modelFilter: "", showDetails: true, activeTab: "requests" } },
  },
};
const usableModels = [
  { key: "deepseek:deepseek-v4-flash", modelKey: "deepseek:deepseek-v4-flash", provider: "deepseek", apiModel: "deepseek-v4-flash", label: "DeepSeek V4 Flash", enabled: true, contextWindow: 128000, thinkingDefault: true, capabilities: {} },
  { key: "kimi:kimi-k3", modelKey: "kimi:kimi-k3", provider: "kimi", apiModel: "kimi-k3", label: "Kimi K3", enabled: true, contextWindow: 256000, thinkingDefault: false, capabilities: {} },
];
const installedModels = [
  { key: "deepseek:deepseek-v4-flash", apiModel: "deepseek-v4-flash", label: "DeepSeek V4 Flash", enabled: true, contextWindow: 128000 },
  { key: "deepseek:deepseek-v4-pro", apiModel: "deepseek-v4-pro", label: "DeepSeek V4 Pro", enabled: true, contextWindow: 128000 },
  { key: "deepseek:deepseek-coder-v3", apiModel: "deepseek-coder-v3", label: "DeepSeek Coder V3", enabled: false, contextWindow: 64000 },
  { key: "kimi:kimi-k3", apiModel: "kimi-k3", label: "Kimi K3", enabled: true, contextWindow: 256000 },
].map((model) => ({
  definition: {
    key: model.key, provider: model.key.split(":")[0], api: "openai-completions", apiModel: model.apiModel, label: model.label,
    source: "builtin", contextWindow: model.contextWindow, maxTokens: 65536, thinkingDefault: true, capabilities: {},
  },
  settings: { enabled: model.enabled, addedAt: "2026-09-01T00:00:00.000Z" },
  unavailableReasons: {},
}));
const providerView = (provider: string, hasApiKey: boolean, installedModelCount: number, enabledModelCount: number) => ({
  provider, hasApiKey, baseUrl: null, proxy: { enabled: false, url: null }, installedModelCount, enabledModelCount,
});

const bridge: Record<string, unknown> = {
  getSettings: async () => settings,
  getSettingsV4: async () => settingsV4,
  updateSettings: async () => settings,
  updateSettingsV4: async () => ({ ok: true, snapshot: settingsV4 }),
  readAgentSystemPrompt: async () => ({ path: promptPath, content: "你是 ActSpace 的主 Agent。\n- 先理解需求，再动手修改。" }),
  listProviders: async () => ({
    credentialStorage: { status: "ready" },
    providers: {
      deepseek: providerView("deepseek", true, 3, 2),
      kimi: providerView("kimi", true, 2, 2),
      openrouter: providerView("openrouter", false, 0, 0),
    },
  }),
  getProviderBalance: async ({ provider }: { provider: string }) => ({
    provider, isConfigured: true, isAvailable: true, generatedAt: "2026-09-25T08:00:00.000Z", displayBalance: { amount: "31.11", currency: "CNY" },
  }),
  listInstalledModels: async () => ({ models: installedModels }),
  listUsableModels: async () => ({ models: usableModels }),
  getLocalUpdateState: async () => ({
    sourceRoot: "/Users/me/code/actspace-agent", sourceValid: true, appExecutablePath: "/Applications/Actspace.app/Contents/MacOS/Actspace",
    appIsPackaged: true, appPath: "/Applications/Actspace.app", installParent: "/Applications", canUpdate: true, logPath: "/tmp/update.log",
    running: false, progress: { phase: "idle", message: "尚未开始本地更新。" },
  }),
  listSessions: async () => [
    { id: "a1", title: "重构设置中心导航", updatedAt: "2026-09-20T10:00:00.000Z", agentRunCount: 4, workspaceRoot: "/Users/me/code/actspace-agent", archived: true },
    { id: "a2", title: "排查使用统计费用估算", updatedAt: "2026-09-18T10:00:00.000Z", agentRunCount: 2, workspaceRoot: "/Users/me/code/actspace-agent", archived: true },
  ],
  listWorkspaces: async () => ({ version: 1, defaultWorkspaceId: "default", items: [] }),
  getQuickOpenShortcutStatus: async () => ({ registered: true, accelerator: "CommandOrControl+Shift+Space" }),
  getEnglishLearningState: async () => ({ revision: 1, hasApiKey: false, speechStatus: "idle", error: null }),
  getSearchUsage: async () => ({ ok: false, error: "预览样例：不查询用量。" }),
};

// Any bridge method the fixture does not model resolves to an empty success so the page renders.
window.actspace = new Proxy(bridge, {
  get(target, prop: string) {
    if (prop in target) return target[prop];
    if (prop.startsWith("on")) return () => () => {};
    return async () => ({ ok: true, models: [], items: [], entries: [] });
  },
}) as unknown as NonNullable<typeof window.actspace>;

const section = (query.get("section") ?? "general") as SettingsSectionId;
// ?detail=DeepSeek opens that connection's detail route after the list loads.
const detail = query.get("detail");
if (detail) {
  const open = () => {
    const row = document.querySelector<HTMLButtonElement>(`button[aria-label^="${detail}"]`);
    if (row) row.click();
    else window.setTimeout(open, 50);
  };
  window.setTimeout(open, 50);
}

createRoot(document.getElementById("root")!).render(
  <TooltipProvider delayDuration={0}>
    <SettingsPage onBack={() => {}} initialSection={section} />
  </TooltipProvider>,
);
