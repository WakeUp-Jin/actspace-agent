import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import type { AppSettings, InstalledModelView, SettingsV4ConnectionSettings } from "@actspace/shared";
import { ProviderSettings } from "../src/renderer/components/settings/ProviderSettings";
import "../src/renderer/styles/index.css";

const connection: SettingsV4ConnectionSettings = {
  connectionId: "anthropic-relay",
  providerId: "openrouter",
  protocol: "anthropic-messages",
  catalogId: "anthropic-compatible",
  displayName: "Claude 中转站",
  defaultModel: "claude-opus-alias",
  promptCacheMode: "short",
  enabled: true,
  baseUrl: "https://relay.example",
  proxy: { enabled: false, url: null },
  lastConnection: { status: "available", checkedAt: "2026-09-24T12:00:00.000Z" },
  defaultPricingMultiplier: 1,
  additionalCredentials: [],
};

const model: InstalledModelView = {
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
  settings: { enabled: true, addedAt: "2026-09-24T12:00:00.000Z", connectionId: connection.connectionId },
  unavailableReasons: {},
};

const settings = {
  version: 2,
  defaultModelId: null,
  providers: {},
  installedModels: { [model.definition.key]: model.settings },
  customModels: { [model.definition.key]: model.definition },
  taskModels: { defaultChatModel: null, utilityModel: null, exploreModel: null },
  searchProviders: { zhipu: { hasApiKey: false }, tavily: { hasApiKey: false }, tinyfish: { hasApiKey: false }, exa: { hasApiKey: false } },
  imageGeneration: { hasApiKey: false, baseUrl: "", model: "" },
  imageInspection: { modelKey: null },
  agent: { systemPromptPath: "/tmp/main-agent.md", temperature: null, maxTokens: null, disabledTools: [], bashAlwaysAsk: false, exploreModelId: null },
  skills: { disabled: [] },
  shortcuts: { quickOpen: { accelerator: "CommandOrControl+Shift+Space" } },
} as unknown as AppSettings;

window.actspace = {
  listProviders: async () => ({ providers: {}, credentialStorage: { status: "ready" } }),
  getSettingsV4: async () => ({ version: 4, revision: "fixture", settings: { models: { connections: { [connection.connectionId]: connection }, definitions: { [model.definition.key]: model.definition }, installed: { [model.definition.key]: model.settings }, taskBindings: { defaultChat: null, utility: null, explore: null } } } } as never),
  listInstalledModels: async () => ({ models: [model] }),
  testCustomConnection: async () => ({ ok: true, message: "模型测试成功。", checkedAt: new Date().toISOString() }),
  updateModel: async () => ({ ok: true, model }),
  removeModel: async () => ({ ok: false, error: { code: "default_model_requires_replacement", message: "当前是默认模型，请先选择新的默认模型。" } }),
  addCustomModel: async () => ({ ok: true, model }),
  editCustomModel: async () => ({ ok: true, model }),
  setCustomConnectionDefaultModel: async () => ({ ok: true, model }),
  removeCustomConnection: async () => ({ version: 4, revision: "fixture", settings: {} } as never),
} as unknown as Window["actspace"];

function Fixture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("theme") === "dark") document.documentElement.dataset.theme = "dark";
    if (params.get("view") !== "model") return;
    const openConnection = window.setTimeout(() => {
      const connectionButton = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Claude 中转站"));
      connectionButton?.click();
      window.setTimeout(() => {
        const addModelButton = [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "添加模型");
        addModelButton?.click();
      }, 50);
    }, 50);
    return () => window.clearTimeout(openConnection);
  }, []);

  return <main className="min-h-screen bg-app-canvas px-8 py-8 text-text-main max-[600px]:px-4">
    <div className="mx-auto max-w-[880px]">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div><h1 className="text-[18px] font-semibold">Anthropic 自定义连接验收样例</h1><p className="mt-1 text-[12px] text-text-faint">显式测试样例，不访问真实中转站。</p></div>
        <button type="button" className="h-9 rounded-act-md border border-line bg-surface px-3 text-[12px] font-semibold" onClick={() => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; }}>切换主题</button>
      </div>
      <ProviderSettings settings={settings} />
    </div>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
