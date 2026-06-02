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
import type { ContextState, DescribeContextInput, ModelId } from "@actspace/shared";
import {
  buildAgentConfig,
  buildContextEntries,
  createAgentForSession,
  createContextState,
  createSessionStorePaths,
  readMeta,
} from "@actspace/agent-core";
import type { AgentRuntimeContextLoader, AppDataRoots } from "./agent-turn";

export async function describeSessionContext(
  input: DescribeContextInput,
  roots: AppDataRoots,
  loadRuntimeContext?: AgentRuntimeContextLoader,
): Promise<ContextState | null> {
  const sessionDir = join(roots.sessionRoot, input.sessionId);
  const sessionPaths = createSessionStorePaths(sessionDir);

  const meta = await readMeta(sessionPaths.metaPath);
  if (!meta) return null;

  // lastModel 由 meta.json 动态写入，未声明在 SessionMeta 类型上；缺省时由 resolveModelSpec 取默认模型。
  const model = (meta as { lastModel?: ModelId }).lastModel;
  const workspaceRoot = meta.workspaceRoot ?? roots.defaultWorkspaceRoot;
  const runtimeContext = await loadRuntimeContext?.(workspaceRoot);

  const config = buildAgentConfig({ model }, workspaceRoot, undefined, {
    tmpRoot: roots.tmpRoot,
    sessionId: input.sessionId,
    ...runtimeContext,
  });
  const deps = await createAgentForSession(config, {
    sessionPath: sessionPaths.sessionPath,
  });

  // 与 Agent.run 一致：把工具定义注入 context，才能算出 tools bucket 的 token 与预览。
  deps.contextManager.setTools(deps.toolManager.getToolDefinitions());

  const snapshot = deps.contextManager.getUsageSnapshot();
  const entries = buildContextEntries(deps.contextManager.getContext());
  // 这是「实时重建」而非某轮 turn 的快照，activeTurnId 用 "live" 标识来源。
  return createContextState(snapshot, input.sessionId, "live", entries);
}
