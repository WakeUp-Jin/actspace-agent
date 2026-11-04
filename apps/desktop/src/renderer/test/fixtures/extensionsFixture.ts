import type { AppSettings, BrowserBridgeStatus, PluginListItem, SkillCatalogItem } from "@actspace/shared";

export function extensionsSettings(): AppSettings {
  return {
    version: 1,
    defaultModelId: null,
    providers: { deepseek: { hasApiKey: false }, kimi: { hasApiKey: false } },
    searchProviders: { zhipu: { hasApiKey: false }, tavily: { hasApiKey: false }, tinyfish: { hasApiKey: false }, exa: { hasApiKey: false } },
    agent: { systemPromptPath: "", temperature: null, maxTokens: null, disabledTools: [], bashAlwaysAsk: false },
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

/** Two switchable plugins plus built-ins in both groups; both switchable ones are off and not loaded unless overridden. */
export function extensionPlugins(overrides: Partial<Record<"browser-tools" | "english-learning", Partial<PluginListItem>>> = {}): PluginListItem[] {
  return [
    { id: "english-learning", title: "英语学习", description: "双语回答、生词与朗读", scope: "global", directory: "english-learning", canDisable: true, loaded: false, enabled: false, ...overrides["english-learning"] },
    { id: "session-journal", title: "会话日志", description: "把会话里发生的事按类型记成日志", scope: "global", directory: "session", canDisable: false, loaded: true, enabled: true },
    { id: "side-chat", title: "侧边对话", description: "不打断主对话，在旁边提问", scope: "global", directory: "side-chat", canDisable: false, loaded: true, enabled: true },
    { id: "browser-tools", title: "操控浏览器", description: "通过 Chrome 扩展操作网页", scope: "session", directory: "browser", canDisable: true, loaded: false, enabled: false, ...overrides["browser-tools"] },
    { id: "context-rules", title: "规则", description: "把 AGENTS.md 等规则文件放进上下文", scope: "session", directory: "context", canDisable: false, loaded: true, enabled: true },
    { id: "shell-tools", title: "命令行", description: "运行 Bash 命令", scope: "session", directory: "shell", canDisable: false, loaded: true, enabled: true },
  ];
}
