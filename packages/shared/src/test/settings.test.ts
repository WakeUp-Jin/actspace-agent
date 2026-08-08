import { describe, expect, it } from "vitest";
import type { AppSettingsV2 } from "../settings";

describe("settings v2 contract", () => {
  it("serializes only non-sensitive provider and model state", () => {
    const settings: AppSettingsV2 = {
      version: 2,
      providers: {
        deepseek: {
          hasApiKey: true,
          enabled: true,
          baseUrl: null,
          proxy: { enabled: false, url: null },
          lastConnection: { status: "available", checkedAt: "2026-07-24T00:00:00.000Z" },
          installedModelCount: 2,
          enabledModelCount: 2,
        },
        kimi: { hasApiKey: false, enabled: true },
        openrouter: {
          hasApiKey: true,
          enabled: true,
          baseUrl: "https://openrouter.ai/api/v1",
          proxy: { enabled: true, url: "http://127.0.0.1:7890" },
          lastConnection: { status: "untested" },
        },
        duckcoding: {
          hasApiKey: true,
          enabled: true,
          defaultPricingMultiplier: 1,
          additionalCredentials: [{
            id: "sale",
            label: "CodeX-Sale",
            pricingMultiplier: 0.2,
            lastConnection: { status: "available", checkedAt: "2026-07-24T00:00:00.000Z" },
            hasApiKey: true,
          }],
        },
      },
      installedModels: {
        "deepseek:deepseek-v4-pro": { enabled: true, addedAt: "2026-07-24T00:00:00.000Z" },
        "duckcoding:grok-4.5": {
          enabled: true,
          addedAt: "2026-07-24T00:00:00.000Z",
          credentialId: "sale",
        },
      },
      customModels: {},
      taskModels: {
        defaultChatModel: "deepseek:deepseek-v4-pro",
        utilityModel: "deepseek:deepseek-v4-flash",
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
      },
      kairos: {
        featureEnabled: false,
        modelId: "deepseek:deepseek-v4-flash",
        thinking: "auto",
        enabledSkills: [],
      },
      plugins: { repoRoot: null, fsWatch: { enabled: false } },
      skills: { disabled: [] },
    };

    const serialized = JSON.stringify(settings);
    expect(serialized).toContain("openrouter");
    expect(serialized).not.toContain('"apiKey":');
    expect(serialized).not.toMatch(/authorization|bearer/i);
  });
});
