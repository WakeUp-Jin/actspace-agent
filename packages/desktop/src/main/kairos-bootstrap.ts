/**
 * Kairos 装配辅助：负责
 * 1. 在 `<userData>/kairos/` 下创建必备目录、默认 workspace 与缺省 config（preferences.json 等）。
 * 2. 提供 `createKairosToolManagerFactory(...)` 工厂——按 blocklist.toolsDenied 排除主 Agent 工具，
 *    再交给 controller 注册 Sleep。
 * 3. 暴露 `createKairosLlm(modelId)` + `resolveKairosThinkingEnabled(modelId, thinking)` +
 *    `resolveKairosModelId(modelId)`——模型 / 思考链来源是 settings.json 的 kairos 分区；
 *    非法 / 留空回落 Kairos 默认模型。
 */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { KairosConfig } from "@actspace/agent-core";
import {
  DEFAULT_BLOCKLIST,
  DEFAULT_PATHS_CONFIG,
  DEFAULT_PREFERENCES,
  buildLLMConfig,
  createLLMService,
  createToolManager,
  ensureKairosInboxScaffolding,
  resolveAgentEnvConfig,
  resolveKairosEnv,
} from "@actspace/agent-core";
import type { LLMService } from "@actspace/agent-core";
import type { ToolManager } from "@actspace/agent-core";
import type { KairosModelId, KairosThinkingMode } from "@actspace/shared";

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
    mkdir(kairosWorkspaceRoot, { recursive: true }),
    mkdir(join(kairosWorkspaceRoot, "notes"), { recursive: true }),
    mkdir(join(kairosRoot, "config"), { recursive: true }),
    mkdir(join(kairosRoot, "memory", "short-term"), { recursive: true }),
    mkdir(join(kairosRoot, "observe", "watch-manifests"), { recursive: true }),
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
        watch: true,
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

function isLegacyEmptyPathsConfig(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as { tip?: unknown; paths?: unknown };
    return parsed.tip === DEFAULT_PATHS_CONFIG.tip && Array.isArray(parsed.paths) && parsed.paths.length === 0;
  } catch {
    return false;
  }
}

/**
 * 给 controller 用的 LLM 单例。
 *
 * 行为：
 * - 模型来自传入的 `modelId`（settings.json 的 `kairos.modelId`）；非法 / 留空 → 回落 Kairos 默认模型。
 * - API Key / baseUrl / temperature / maxTokens 仍读主 Agent 的 env（DEEPSEEK_API_KEY 等），
 *   provider 由所选 ModelSpec.provider 自动决定（当前 Kairos 仅 deepseek）。
 *
 * 注意：`thinkingEnabled` 不在 LLM service 本身决定，由 controller→runner 沿 loopConfig 传给每次调用。
 *      调用 `resolveKairosThinkingEnabled(modelId, thinking)` 拿到布尔/undefined 再传给 createKairos。
 */
export function createKairosLlm(modelId: KairosModelId | null): LLMService {
  const env = resolveAgentEnvConfig();
  const { modelSpec } = resolveKairosEnv(modelId, "auto");
  const llmConfig = buildLLMConfig(modelSpec, env);
  return createLLMService(llmConfig);
}

/**
 * 返回 settings.json 中 kairos.thinking 解析后的覆写值：
 * - `undefined` → 跟随 ModelSpec.thinkingDefault；
 * - `true / false` → 显式覆写。
 * 已在 `resolveKairosEnv(modelId, thinking)` 内对"模型不支持 toggle"的情况做了兜底（强制 undefined）。
 */
export function resolveKairosThinkingEnabled(
  modelId: KairosModelId | null,
  thinking: KairosThinkingMode,
): boolean | undefined {
  return resolveKairosEnv(modelId, thinking).thinkingEnabled;
}

/**
 * 把 settings.json 的 `kairos.modelId`（可能 null）解析为 Kairos 实际使用的真实模型 id
 * （已回落默认）。用于：(a) 注入 controller 供上下文快照显示；(b) 判断 modelId 是否变化决定是否重建。
 */
export function resolveKairosModelId(modelId: KairosModelId | null): string {
  return resolveKairosEnv(modelId, "auto").modelSpec.id;
}

/**
 * 给 controller 用的 ToolManager 工厂：
 * - 复用主 Agent 同款工具集（read_file / list_directory / grep / glob / write_file / edit_file_diff / bash 等）
 * - 把 `config.blocklist.toolsDenied` 加进 `disabledTools` → 不注册到 manager 上
 * - controller 之后会调 `registerKairosTools(manager)` 把 Sleep 工具加进来
 *
 * `workspaceRoot` 参数应传 Kairos 自己的 workspace 根目录。ToolScheduler 的
 * kairosGuard 仍会用 paths.json 做二次校验，默认 paths.json 与这里保持同一个根。
 */
export function createKairosToolManagerFactory(opts: {
  workspaceRoot: string;
  /** 与 createKairosLlm 同源的 modelId（settings.json）；决定工具暴露的 provider / apiFormat。 */
  modelId: KairosModelId | null;
}) {
  const env = resolveAgentEnvConfig();
  // 注意：toolManager 的 provider / apiFormat 必须和实际 LLM Service 一致，
  // 否则会出现 DeepSeek Anthropic 仍暴露 Kimi-backed web_search 这种错配。
  const { modelSpec } = resolveKairosEnv(opts.modelId, "auto");
  const llmConfig = buildLLMConfig(modelSpec, env);
  return (config: KairosConfig): ToolManager => {
    const combinedDisabled = [...env.disabledTools, ...config.blocklist.toolsDenied];
    return createToolManager({
      workspaceRoot: opts.workspaceRoot,
      primaryProvider: modelSpec.provider,
      apiFormat: llmConfig.apiFormat,
      hasKimiKey: Boolean(env.kimiApiKey),
      disabledTools: combinedDisabled,
      // 不传 approvalGate：Kairos 应避免触发用户审核流；如确需要可由 plan 7 e2e 阶段再补。
    });
  };
}
