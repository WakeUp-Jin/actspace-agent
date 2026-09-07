import type { AppSettings, BrowserBridgeStatus, SkillCatalogItem } from "@actspace/shared";

export function extensionsSettings(): AppSettings {
  return {
    version: 1,
    defaultModelId: null,
    providers: { deepseek: { hasApiKey: false }, kimi: { hasApiKey: false } },
    searchProviders: { zhipu: { hasApiKey: false }, tavily: { hasApiKey: false }, tinyfish: { hasApiKey: false }, exa: { hasApiKey: false } },
    agent: { systemPromptPath: "", temperature: null, maxTokens: null, disabledTools: [], bashAlwaysAsk: false, exploreModelId: null },
    skills: { disabled: [] },
  };
}

export const extensionSkills: SkillCatalogItem[] = [
  { name: "writing", description: "整理思路，润色中英文文稿。", scope: "user", source: "actspace-userData", location: "/fixture/skills/writing/SKILL.md", directory: "/fixture/skills/writing", status: "available", removable: true, enabledForAgent: true, shadowed: false },
  { name: "code-review", description: "检查代码中的边界情况和潜在回归。", scope: "project", source: "agents", location: "/fixture/project/.agents/skills/code-review/SKILL.md", directory: "/fixture/project/.agents/skills/code-review", status: "available", removable: false, enabledForAgent: true, shadowed: false },
];

export const extensionBrowserStatus: BrowserBridgeStatus = {
  installed: true, abbPath: "/fixture/bin/abb", extensionDir: "/fixture/browser-bridge/chrome-extension", runState: "ready", doctorChecks: [],
};
