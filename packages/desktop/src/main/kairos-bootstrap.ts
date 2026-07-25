/**
 * Kairos 装配辅助：负责
 * 1. 在 `<userData>/kairos/` 下创建必备目录、默认 workspace 与缺省 config（preferences.json 等）。
 * 2. 提供动态 ToolManager 工厂——依据已解析的 ModelDefinition / LLMConfig 暴露工具，
 *    按 blocklist.toolsDenied 排除主 Agent 工具，再交给 controller 注册 Sleep。
 * 3. 依据模型能力解析 Kairos 的 thinking 覆写；模型选择与回退由 ModelRuntimeService 统一处理。
 */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { KairosConfig } from "@actspace/agent-core";
import {
  DEFAULT_BLOCKLIST,
  DEFAULT_PATHS_CONFIG,
  DEFAULT_PREFERENCES,
  createToolManager,
  ensureKairosInboxScaffolding,
} from "@actspace/agent-core";
import type { LLMConfig } from "@actspace/agent-core";
import type { ToolManager } from "@actspace/agent-core";
import type { KairosThinkingMode, ModelDefinition } from "@actspace/shared";

const DEFAULT_RULE_MD = `# Kairos 用户规则

> 此文件由用户编辑，会被注入到 Kairos 的 system prompt [4] 段。

- 默认保持安静，不要在没明确信号的情况下打扰用户。
- 优先复盘最近的主 Agent 会话，整理可下一步执行的小任务。
`;

const KAIROS_WORKSPACE_DIR = "workspace";

export function getKairosWorkspaceRoot(kairosRoot: string): string {
  return join(kairosRoot, KAIROS_WORKSPACE_DIR);
}

export async function ensureKairosScaffolding(kairosRoot: string): Promise<void> {
  const kairosWorkspaceRoot = getKairosWorkspaceRoot(kairosRoot);

  await Promise.all([
    mkdir(join(kairosRoot, "inbox"), { recursive: true }),
    mkdir(kairosWorkspaceRoot, { recursive: true }),
    mkdir(join(kairosWorkspaceRoot, "notes"), { recursive: true }),
    mkdir(join(kairosRoot, "config"), { recursive: true }),
    mkdir(join(kairosRoot, "memory", "short-term"), { recursive: true }),
    mkdir(join(kairosRoot, "observe"), { recursive: true }),
    mkdir(join(kairosRoot, "briefs", "tasks"), { recursive: true }),
    ensureKairosInboxScaffolding(kairosRoot),
  ]);

  await writeIfMissing(
    join(kairosRoot, "config", "preferences.json"),
    JSON.stringify(DEFAULT_PREFERENCES, null, 2) + "\n",
  );
  await writePathsConfigIfMissingOrLegacyDefault(kairosRoot);
  await writeIfMissing(
    join(kairosRoot, "config", "blocklist.json"),
    JSON.stringify(DEFAULT_BLOCKLIST, null, 2) + "\n",
  );
  await writeIfMissing(join(kairosRoot, "config", "rule.md"), DEFAULT_RULE_MD);
}

async function writeIfMissing(path: string, content: string): Promise<void> {
  try {
    await access(path);
    return;
  } catch {
    await writeFile(path, content, "utf8");
  }
}

function defaultPathsConfigForKairosWorkspace(kairosRoot: string) {
  return {
    ...DEFAULT_PATHS_CONFIG,
    tip:
      "Kairos 可读写的本地路径；默认只授权 Kairos 自己的 workspace，新增路径前请确认不会暴露敏感目录。",
    paths: [
      {
        path: getKairosWorkspaceRoot(kairosRoot),
        tip: "Kairos 的默认工作空间，文件工具的相对路径会落在这里。",
      },
    ],
  };
}

async function writePathsConfigIfMissingOrLegacyDefault(kairosRoot: string): Promise<void> {
  const path = join(kairosRoot, "config", "paths.json");
  const content = JSON.stringify(defaultPathsConfigForKairosWorkspace(kairosRoot), null, 2) + "\n";
  try {
    const current = await readFile(path, "utf8");
    if (isLegacyEmptyPathsConfig(current)) {
      await writeFile(path, content, "utf8");
    }
    return;
  } catch {
    await writeFile(path, content, "utf8");
  }
}

/** 巡检管道退役前的默认 tip；老安装的空 paths.json 仍带这句，需要一并识别成 legacy。 */
const LEGACY_PATHS_CONFIG_TIP = "在此声明 Kairos 可读的本地路径；watch=true 表示同时纳入巡检差异检测。";

function isLegacyEmptyPathsConfig(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as { tip?: unknown; paths?: unknown };
    const isKnownDefaultTip = parsed.tip === DEFAULT_PATHS_CONFIG.tip || parsed.tip === LEGACY_PATHS_CONFIG_TIP;
    return isKnownDefaultTip && Array.isArray(parsed.paths) && parsed.paths.length === 0;
  } catch {
    return false;
  }
}

export function resolveDynamicKairosThinking(
  definition: ModelDefinition,
  thinking: KairosThinkingMode,
): boolean | undefined {
  if (!definition.capabilities.thinkingToggle) return undefined;
  if (thinking === "on") return true;
  if (thinking === "off") return false;
  return undefined;
}

export function createDynamicKairosToolManagerFactory(opts: {
  workspaceRoot: string;
  definition: ModelDefinition;
  llmConfig: LLMConfig;
  toolEnvironment: { hasKimiKey: boolean; hasWebSearchKey: boolean; disabledTools: string[] };
}) {
  return (config: KairosConfig): ToolManager => createToolManager({
    workspaceRoot: opts.workspaceRoot,
    primaryProvider: opts.definition.provider,
    apiFormat: opts.llmConfig.apiFormat,
    hasKimiKey: opts.toolEnvironment.hasKimiKey,
    hasWebSearchKey: opts.toolEnvironment.hasWebSearchKey,
    disabledTools: [...opts.toolEnvironment.disabledTools, ...config.blocklist.toolsDenied],
  });
}
