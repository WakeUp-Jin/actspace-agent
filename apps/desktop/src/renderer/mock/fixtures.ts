import {
  BUILTIN_MODEL_LIST,
  DEFAULT_IMAGE_GENERATION_BASE_URL,
  DEFAULT_IMAGE_GENERATION_MODEL,
  DEFAULT_IMAGE_INSPECTION_MODEL_KEY,
  DEFAULT_QUICK_OPEN_ACCELERATOR,
  DEFAULT_SPEECH_SETTINGS,
  type AppSettings,
  type BootstrapState,
  type BrowserBridgeStatus,
  type EnglishLearningState,
  type InstalledModelView,
  type LocalUpdateState,
  type ModelDefinition,
  type ProviderId,
  type ProviderSettingsView,
  type ProvidersListResult,
  type SettingsV4Snapshot,
  type ShortcutsSettings,
  type UsableModelView,
} from "@actspace/shared";

/** 浏览器 mock 的静态样例数据。只服务 `renderer/mock/`，生产构建不会引用。 */

export const MOCK_WORKSPACE_ROOT = "/Users/mock/code/actspace-demo";
const MOCK_DATA_ROOT = "/Users/mock/Library/Application Support/ActSpace";
const PROMPT_PATH = `${MOCK_DATA_ROOT}/prompts/main-agent.md`;

export const mockBootstrapState: BootstrapState = {
  appVersion: "0.0.0-mock",
  dataRoot: MOCK_DATA_ROOT,
  sessionRoot: `${MOCK_DATA_ROOT}/sessions`,
  logRoot: `${MOCK_DATA_ROOT}/logs`,
  tmpRoot: `${MOCK_DATA_ROOT}/tmp`,
  workspaceRoot: MOCK_WORKSPACE_ROOT,
};

const MOCK_PROVIDERS: readonly ProviderId[] = ["deepseek", "kimi"];

export const mockModels: readonly ModelDefinition[] = BUILTIN_MODEL_LIST.filter((model) =>
  (MOCK_PROVIDERS as readonly string[]).includes(model.provider),
);

export const MOCK_DEFAULT_MODEL_KEY = mockModels[0]?.key ?? null;

const shortcuts: ShortcutsSettings = {
  quickOpen: { enabled: true, accelerator: DEFAULT_QUICK_OPEN_ACCELERATOR, target: { kind: "automatic" } },
};

function providerView(provider: ProviderId): ProviderSettingsView {
  const models = mockModels.filter((model) => model.provider === provider);
  return {
    hasApiKey: true,
    baseUrl: null,
    proxy: { enabled: false, url: null },
    installedModelCount: models.length,
    enabledModelCount: models.length,
  };
}

const unconfigured: ProviderSettingsView = { hasApiKey: false };

export function mockAppSettings(): AppSettings {
  return {
    version: 2,
    defaultModelId: null,
    providers: { deepseek: providerView("deepseek"), kimi: providerView("kimi") },
    searchProviders: { deepseek: unconfigured, zhipu: unconfigured, tavily: unconfigured, tinyfish: unconfigured, exa: unconfigured },
    agent: { systemPromptPath: PROMPT_PATH, temperature: null, maxTokens: null, disabledTools: [], bashAlwaysAsk: false, exploreModelId: null },
    skills: { disabled: [] },
    taskModels: { defaultChatModel: MOCK_DEFAULT_MODEL_KEY, utilityModel: null, exploreModel: null },
    imageGeneration: { hasApiKey: false, baseUrl: DEFAULT_IMAGE_GENERATION_BASE_URL, model: DEFAULT_IMAGE_GENERATION_MODEL },
    imageInspection: { modelKey: DEFAULT_IMAGE_INSPECTION_MODEL_KEY },
    shortcuts,
  };
}

export function mockSettingsV4(): SettingsV4Snapshot {
  return {
    version: 4,
    revision: "mock-1",
    settings: {
      version: 4,
      general: {
        personalization: { displayName: "", responseStyle: "" },
        agentInstructions: { systemPromptPath: PROMPT_PATH },
        taskDefaults: { temperature: null, maxOutputTokens: null, chatCompactionTriggerRatio: 0.8 },
        shortcuts,
      },
      models: {
        connections: {},
        definitions: {},
        installed: {},
        taskBindings: { defaultChat: MOCK_DEFAULT_MODEL_KEY, utility: null, explore: null },
      },
      tools: { disabledTools: [], bash: { alwaysAsk: false }, searchProviders: {} },
      media: {
        speech: { ...DEFAULT_SPEECH_SETTINGS },
        imageGeneration: { baseUrl: DEFAULT_IMAGE_GENERATION_BASE_URL, model: DEFAULT_IMAGE_GENERATION_MODEL },
        imageInspection: { modelKey: DEFAULT_IMAGE_INSPECTION_MODEL_KEY },
      },
      skills: { disabled: [] },
      subagents: { routes: {} },
      activity: { usage: { range: "30d", status: "all", modelFilter: "", showDetails: true, activeTab: "requests" } },
    },
  };
}

export function mockProviders(): ProvidersListResult {
  return {
    credentialStorage: { status: "ready" },
    providers: { deepseek: providerView("deepseek"), kimi: providerView("kimi"), openrouter: unconfigured },
  };
}

export function mockInstalledModels(): InstalledModelView[] {
  return mockModels.map((definition) => ({
    definition,
    settings: { enabled: true, addedAt: "2026-10-01T00:00:00.000Z" },
    unavailableReasons: {},
  }));
}

export function mockUsableModels(): UsableModelView[] {
  return mockModels.map((model) => ({
    key: model.key,
    label: model.label,
    provider: model.provider as ProviderId,
    apiModel: model.apiModel,
    contextWindow: model.contextWindow ?? null,
    thinkingDefault: model.thinkingDefault ?? false,
    capabilities: model.capabilities,
    ...(model.pricing ? { pricing: model.pricing } : {}),
  }));
}

export function mockLocalUpdateState(): LocalUpdateState {
  return {
    sourceRoot: null,
    sourceValid: false,
    appPath: null,
    installParent: null,
    canUpdate: false,
    reason: "浏览器 mock 模式不支持本地更新。",
    logPath: `${MOCK_DATA_ROOT}/logs/update.log`,
    running: false,
    progress: { phase: "idle", message: "浏览器 mock 模式不支持本地更新。" },
  };
}

export function mockEnglishLearningState(): EnglishLearningState {
  return {
    enabled: false,
    targetSessionId: null,
    revision: 1,
    promptStatus: "off",
    speechStatus: "unconfigured",
    queuedSegments: 0,
    hasApiKey: false,
    notice: null,
    error: null,
  };
}

export function mockBrowserBridgeStatus(): BrowserBridgeStatus {
  return { installed: false, abbPath: `${MOCK_DATA_ROOT}/browser-bridge`, runState: "not_installed", doctorChecks: [] };
}
