/**
 * Context 按需描述服务
 *
 * 方案 B：持久化的 `context-state.json` 只存 token 统计（buckets/总量），不含逐条明细。
 * 右侧 Context 完整视图打开时调用本服务：重新装配该会话的 ContextManager（一次性吃完
 * session.jsonl），用 `buildContextEntries` 现场产出**逐条全文** entries（每条消息 / 每个
 * 工具一条），**不调用 LLM**。打开频率低，现算才能体现实时性。
 *
 * 失败一律返回 null，由 renderer 回退到持久化快照（仅有 token 统计），绝不影响主流程。
 */

import { join } from "node:path";
import type { ContextState, DescribeContextInput, ModelId, ModelSelectionId } from "@actspace/shared";
import {
  buildAgentConfig,
  buildAgentConfigFromRuntime,
  buildContextEntries,
  createAgentForSession,
  createContextState,
  createSessionStorePaths,
  readMeta,
} from "@actspace/agent-core";
import type { AgentRuntimeContextLoader, AppDataRoots } from "./agent-run";
import type { ModelRuntimeService } from "./model-runtime-service";

export async function describeSessionContext(
  input: DescribeContextInput,
  roots: AppDataRoots,
  loadRuntimeContext?: AgentRuntimeContextLoader,
  modelRuntime?: ModelRuntimeService,
): Promise<ContextState | null> {
  const sessionDir = join(roots.sessionRoot, input.sessionId);
  const sessionPaths = createSessionStorePaths(sessionDir);

  const meta = await readMeta(sessionPaths.metaPath);
  if (!meta) return null;

  // lastModel 由 meta.json 动态写入，未声明在 SessionMeta 类型上；缺省时由 resolveModelSpec 取默认模型。
  const model = (meta as { lastModel?: ModelSelectionId }).lastModel;
  const workspaceRoot = meta.workspaceRoot ?? roots.defaultWorkspaceRoot;
  const runtimeContext = await loadRuntimeContext?.(workspaceRoot);

  const agentRuntimeContext = {
    tmpRoot: roots.tmpRoot,
    sessionId: input.sessionId,
    ...runtimeContext,
  };
  const legacyModel = model && !model.includes(":") ? model as ModelId : undefined;
  const config = modelRuntime
    ? buildDynamicContextConfig(modelRuntime, model, workspaceRoot, agentRuntimeContext)
    : buildAgentConfig({ model: legacyModel }, workspaceRoot, undefined, agentRuntimeContext);
  if (!config) return null;
  const deps = await createAgentForSession(config, {
    sessionPath: sessionPaths.sessionPath,
  });

  // 与 Agent.run 一致：把工具定义注入 context，才能算出 tools bucket 的 token 与预览。
  deps.contextManager.setTools(deps.toolManager.getToolDefinitions());

  const snapshot = deps.contextManager.getUsageSnapshot();
  const entries = buildContextEntries(deps.contextManager.getContext());
  // 这是「实时重建」而非某轮 turn 的快照，activeAgentRunId 用 "live" 标识来源。
  return createContextState(snapshot, input.sessionId, "live", entries);
}

function buildDynamicContextConfig(
  runtime: ModelRuntimeService,
  model: ModelSelectionId | undefined,
  workspaceRoot: string,
  runtimeContext: Parameters<typeof buildAgentConfigFromRuntime>[3],
) {
  const main = runtime.resolveMainModel(model);
  if (!main.ok) return null;
  const utility = runtime.resolveUtilityModel(main.model);
  const explore = runtime.resolveExploreModel(main.model);
  return buildAgentConfigFromRuntime({
    main: { definition: main.model.definition, runtime: main.model.providerRuntime },
    ...(utility.ok && { utility: { definition: utility.model.definition, runtime: utility.model.providerRuntime } }),
    ...(explore.ok && { explore: { definition: explore.model.definition, runtime: explore.model.providerRuntime } }),
    toolEnvironment: runtime.getToolEnvironment(),
  }, workspaceRoot, undefined, runtimeContext);
}
