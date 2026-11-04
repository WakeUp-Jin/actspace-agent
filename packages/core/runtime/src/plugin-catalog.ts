import type { PluginManifest } from "@actspace/cordis-adapter";
import { manifest as approvalManifest } from "@actspace/approval/manifest";
import { manifest as autoReviewManifest } from "@actspace/auto-review/manifest";
import { manifest as backgroundTasksToolManifest } from "@actspace/tool-background-tasks/manifest";
import { manifest as browserToolsManifest } from "@actspace/tool-browser/manifest";
import { manifest as compactionManifest } from "@actspace/context-compaction/manifest";
import { manifest as contextBackgroundTasksManifest } from "@actspace/context-background-tasks/manifest";
import { manifest as contextSubagentsManifest } from "@actspace/context-subagents/manifest";
import { manifest as contextConversationManifest } from "@actspace/context-conversation/manifest";
import { manifest as contextDisclosureManifest } from "@actspace/context-disclosure/manifest";
import { manifest as contextEngineManifest } from "@actspace/context-engine/manifest";
import { manifest as contextRulesManifest } from "@actspace/context-rules/manifest";
import { manifest as contextRuntimeManifest } from "@actspace/context-runtime/manifest";
import { manifest as contextSkillsManifest } from "@actspace/context-skills/manifest";
import { manifest as contextSystemManifest } from "@actspace/context-system/manifest";
import { manifest as contextToolsManifest } from "@actspace/context-tools/manifest";
import { manifest as promptManifest } from "@actspace/prompt/manifest";
import { manifest as coreAgentManifest } from "@actspace/agent/manifest";
import { manifest as toolRuntimeManifest } from "@actspace/tool-runtime/manifest";
import { manifest as englishLearningManifest } from "@actspace/english-learning/manifest";
import { manifest as fsReadManifest } from "@actspace/tool-fs-read/manifest";
import { manifest as fsSearchManifest } from "@actspace/tool-fs-search/manifest";
import { manifest as fsWriteManifest } from "@actspace/tool-fs-write/manifest";
import { manifest as pluginManagerManifest } from "@actspace/plugin-manager/manifest";
import { manifest as agentHostManifest } from "@actspace/agent-host/manifest";
import { manifest as desktopAppManifest } from "@actspace/desktop-app/manifest";
import { manifest as headlessManifest } from "@actspace/headless/manifest";
import { manifest as imageGenerationManifest } from "@actspace/tool-image-generation/manifest";
import { manifest as imageInspectionManifest } from "@actspace/tool-image-inspection/manifest";
import { manifest as llmServiceManifest } from "@actspace/llm-service/manifest";
import { manifest as sandboxManifest } from "@actspace/sandbox/manifest";
import { manifest as sandboxNonoManifest } from "@actspace/sandbox-nono/manifest";
import { manifest as sandboxSeatbeltManifest } from "@actspace/sandbox-seatbelt/manifest";
import { manifest as checkpointPolicyManifest } from "@actspace/session-checkpoint-policy/manifest";
import { manifest as sessionJournalManifest } from "@actspace/session-journal/manifest";
import { manifest as sessionPersistenceManifest } from "@actspace/session-persistence/manifest";
import { manifest as sessionJsonlManifest } from "@actspace/session-persistence-jsonl/manifest";
import { manifest as sessionProjectionManifest } from "@actspace/session-projection/manifest";
import { manifest as shellManifest } from "@actspace/tool-shell/manifest";
import { manifest as sideChatManifest } from "@actspace/side-chat/manifest";
import { manifest as sessionTranscriptManifest } from "@actspace/session-transcript/manifest";
import { manifest as subagentToolsManifest } from "@actspace/tool-subagent/manifest";
import { manifest as subagentCodexManifest } from "@actspace/subagent-codex/manifest";
import { manifest as subagentClaudeCodeManifest } from "@actspace/subagent-claude-code/manifest";
import { manifest as todoToolsManifest, projectionManifest as todoProjectionManifest } from "@actspace/tool-todo/manifest";
import { manifest as webManifest } from "@actspace/tool-web/manifest";
import { agentFactoryManifest, agentRuntimeManifest, runtimeManifest, sessionRuntimeManifest } from "./manifests.js";

/** Where a plugin is loaded: the Host's Cordis loader (`cordis.yml`), a session's Harness, or both. */
export type PluginLoader = "host" | "harness";

export type PluginCatalogEntry = {
  /** Entry id; unchanged from the loader and Harness tables, persisted in logs and Harness records. */
  readonly id: string;
  readonly manifest: PluginManifest;
  /** Load entry (package subpath) resolved by the Host loader and the default-Harness bundler. */
  readonly module: string;
  readonly loaders: readonly PluginLoader[];
  /** Codec subpath for plugins that own session event codecs. */
  readonly codec?: string;
  /** Capability directory under `packages/`; shown on the plugin page. */
  readonly directory: string;
  /** The Host composition admits this manifest (host capability checks, codecs, plugin list). */
  readonly admitOnHost?: boolean;
};

const host = ["host"] as const;
const harness = ["harness"] as const;

/**
 * The single place where a plugin is registered. Order is load order: Host rows follow the previous
 * `cordis.yml` order, Harness rows the previous default-Harness order (`llm-service` is both).
 * `cordis.yml`, the Host loader table, the default-Harness rows and the Harness bundle inputs are
 * all derived from this list.
 */
export const PLUGIN_CATALOG: readonly PluginCatalogEntry[] = Object.freeze([
  { id: "actspace-runtime", manifest: runtimeManifest, module: "@actspace/runtime/cordis", loaders: host, directory: "core" },
  { id: "session-journal", manifest: sessionJournalManifest, module: "@actspace/session-journal/plugin", loaders: host, codec: "@actspace/session-journal/codec", directory: "session" },
  { id: "session-persistence", manifest: sessionPersistenceManifest, module: "@actspace/session-persistence/plugin", loaders: host, directory: "session" },
  { id: "session-jsonl", manifest: sessionJsonlManifest, module: "@actspace/session-persistence-jsonl/plugin", loaders: host, directory: "session" },
  { id: "session-projection", manifest: sessionProjectionManifest, module: "@actspace/session-projection/plugin", loaders: host, directory: "session" },
  { id: "session-runtime", manifest: sessionRuntimeManifest, module: "@actspace/runtime/session", loaders: host, directory: "core" },
  { id: "session-checkpoint-policy", manifest: checkpointPolicyManifest, module: "@actspace/session-checkpoint-policy/plugin", loaders: host, directory: "session" },
  { id: "llm-service", manifest: llmServiceManifest, module: "@actspace/llm-service/plugin", loaders: ["host", "harness"], directory: "llm" },
  { id: "todo-projection", manifest: todoProjectionManifest, module: "@actspace/tool-todo/projection", loaders: host, directory: "todo" },
  { id: "core-agent", manifest: coreAgentManifest, module: "@actspace/agent/plugin", loaders: host, directory: "core" },
  { id: "agent-runtime", manifest: agentRuntimeManifest, module: "@actspace/runtime/agent-runtime", loaders: host, directory: "core" },
  { id: "headless-runner", manifest: headlessManifest, module: "@actspace/headless/plugin", loaders: host, directory: "host" },
  { id: "agent-host", manifest: agentHostManifest, module: "@actspace/agent-host/plugin", loaders: host, directory: "host" },
  { id: "desktop-app", manifest: desktopAppManifest, module: "@actspace/desktop-app/plugin", loaders: host, directory: "host" },
  { id: "english-learning", manifest: englishLearningManifest, module: "@actspace/english-learning/plugin", loaders: host, directory: "english-learning" },
  { id: "side-chat", manifest: sideChatManifest, module: "@actspace/side-chat/plugin", loaders: host, directory: "side-chat" },
  { id: "session-transcript", manifest: sessionTranscriptManifest, module: "@actspace/session-transcript/plugin", loaders: host, directory: "session" },

  { id: "auto-review", manifest: autoReviewManifest, module: "@actspace/auto-review/plugin", loaders: harness, directory: "approval" },
  { id: "tools-approval", manifest: approvalManifest, module: "@actspace/approval/plugin", loaders: harness, directory: "approval" },
  { id: "sandbox", manifest: sandboxManifest, module: "@actspace/sandbox/plugin", loaders: harness, directory: "sandbox", admitOnHost: true },
  { id: "sandbox-nono", manifest: sandboxNonoManifest, module: "@actspace/sandbox-nono/plugin", loaders: harness, directory: "sandbox", admitOnHost: true },
  { id: "sandbox-seatbelt", manifest: sandboxSeatbeltManifest, module: "@actspace/sandbox-seatbelt/plugin", loaders: harness, directory: "sandbox", admitOnHost: true },
  { id: "tools-runtime", manifest: toolRuntimeManifest, module: "@actspace/tool-runtime/plugin", loaders: harness, directory: "core" },
  { id: "context-engine", manifest: contextEngineManifest, module: "@actspace/context-engine/plugin", loaders: harness, codec: "@actspace/context-engine/codec", directory: "context" },
  { id: "prompt-runtime", manifest: promptManifest, module: "@actspace/prompt/plugin", loaders: harness, directory: "context" },
  { id: "context-system", manifest: contextSystemManifest, module: "@actspace/context-system/plugin", loaders: harness, directory: "context" },
  { id: "context-rules", manifest: contextRulesManifest, module: "@actspace/context-rules/plugin", loaders: harness, directory: "context" },
  { id: "context-skills", manifest: contextSkillsManifest, module: "@actspace/context-skills/plugin", loaders: harness, directory: "context" },
  { id: "context-runtime", manifest: contextRuntimeManifest, module: "@actspace/context-runtime/plugin", loaders: harness, directory: "context" },
  { id: "context-conversation", manifest: contextConversationManifest, module: "@actspace/context-conversation/plugin", loaders: harness, directory: "context" },
  { id: "context-tools", manifest: contextToolsManifest, module: "@actspace/context-tools/plugin", loaders: harness, directory: "context" },
  { id: "context-background-tasks", manifest: contextBackgroundTasksManifest, module: "@actspace/context-background-tasks/plugin", loaders: harness, directory: "context" },
  { id: "context-subagents", manifest: contextSubagentsManifest, module: "@actspace/context-subagents/plugin", loaders: harness, directory: "context" },
  { id: "context-disclosure", manifest: contextDisclosureManifest, module: "@actspace/context-disclosure/plugin", loaders: harness, directory: "context" },
  { id: "compaction-runtime", manifest: compactionManifest, module: "@actspace/context-compaction/plugin", loaders: harness, directory: "context" },
  { id: "filesystem-read", manifest: fsReadManifest, module: "@actspace/tool-fs-read/plugin", loaders: harness, directory: "fs", admitOnHost: true },
  { id: "filesystem-search", manifest: fsSearchManifest, module: "@actspace/tool-fs-search/plugin", loaders: harness, directory: "fs", admitOnHost: true },
  { id: "filesystem-write", manifest: fsWriteManifest, module: "@actspace/tool-fs-write/plugin", loaders: harness, directory: "fs", admitOnHost: true },
  { id: "web-tools", manifest: webManifest, module: "@actspace/tool-web/plugin", loaders: harness, directory: "web", admitOnHost: true },
  { id: "image-generation", manifest: imageGenerationManifest, module: "@actspace/tool-image-generation/plugin", loaders: harness, directory: "image", admitOnHost: true },
  { id: "shell-tools", manifest: shellManifest, module: "@actspace/tool-shell/plugin", loaders: harness, directory: "shell", admitOnHost: true },
  { id: "image-inspection", manifest: imageInspectionManifest, module: "@actspace/tool-image-inspection/plugin", loaders: harness, directory: "image", admitOnHost: true },
  { id: "todo-tools", manifest: todoToolsManifest, module: "@actspace/tool-todo/plugin", loaders: harness, codec: "@actspace/tool-todo/codec", directory: "todo", admitOnHost: true },
  { id: "browser-tools", manifest: browserToolsManifest, module: "@actspace/tool-browser/plugin", loaders: harness, directory: "browser" },
  { id: "background-tasks", manifest: backgroundTasksToolManifest, module: "@actspace/tool-background-tasks/plugin", loaders: harness, directory: "background-tasks" },
  { id: "subagent-tools", manifest: subagentToolsManifest, module: "@actspace/tool-subagent/plugin", loaders: harness, directory: "subagent" },
  { id: "subagent-codex", manifest: subagentCodexManifest, module: "@actspace/subagent-codex/plugin", loaders: harness, directory: "subagent" },
  { id: "subagent-claude-code", manifest: subagentClaudeCodeManifest, module: "@actspace/subagent-claude-code/plugin", loaders: harness, directory: "subagent" },
  { id: "plugin-manager", manifest: pluginManagerManifest, module: "@actspace/plugin-manager/plugin", loaders: harness, directory: "harness-evolution" },
  { id: "agent-factory", manifest: agentFactoryManifest, module: "@actspace/runtime/agent-factory", loaders: harness, directory: "core" },
]);

/** Packages that ship a `plugin.ts` but are intentionally not part of the default composition. */
export const PLUGIN_PACKAGES_OUTSIDE_DEFAULT: readonly { readonly package: string; readonly reason: string }[] = Object.freeze([
  { package: "@actspace/agent-loop", reason: "只在 CLI 装配（apps/cli/cordis.yml）里加载" },
  { package: "@actspace/agent-service", reason: "Codec 由基础 Bundle 准入，行为由应用直接调用" },
  { package: "@actspace/harness-control", reason: "Agent 运行时当库用，直接调用" },
  { package: "@actspace/harness-hmr", reason: "Agent 运行时当库用，直接调用" },
  { package: "@actspace/harness-evaluation", reason: "评估候选 Harness 时单独装配" },
  { package: "@actspace/scope", reason: "只提供作用域类，由 Agent 注册表等包直接引用" },
  { package: "@actspace/subagent", reason: "子智能体管理器与工具定义，由运行时创建、tool-subagent 注册" },
  { package: "@actspace/llm-pi-ai", reason: "模型适配库，由桌面端和远程 Host 直接构造适配器，运行时只重新导出" },
]);

const byId = new Map(PLUGIN_CATALOG.map(entry => [entry.id, entry]));

export function pluginCatalogEntry(id: string): PluginCatalogEntry | undefined {
  return byId.get(id);
}

/**
 * Harness entries a user turns on in 扩展 › 插件 (`canDisable`, `defaultEnabled: false`). A Host without
 * plugin switches (CLI, remote Host) leaves them off, e.g. the external subagents that run local CLIs.
 */
export function harnessEntriesOffByDefault(): readonly string[] {
  return PLUGIN_CATALOG
    .filter(entry => entry.loaders.includes("harness") && entry.manifest.display?.canDisable === true && entry.manifest.display.defaultEnabled === false)
    .map(entry => entry.id);
}

/**
 * Optional Harness entries (manifest `required: false`) whose manifest requires a Host capability the Host
 * does not have; they are not loaded. Required entries are never dropped silently (for example approval):
 * a missing capability there must fail loudly instead.
 */
export function harnessEntriesMissingHostCapabilities(capabilityCeiling: readonly string[]): readonly string[] {
  return PLUGIN_CATALOG
    .filter(entry => entry.loaders.includes("harness") && entry.manifest.behaviors[0]?.required === false && entry.manifest.behaviors[0].host.required.some(capability => !capabilityCeiling.includes(capability)))
    .map(entry => entry.id);
}
