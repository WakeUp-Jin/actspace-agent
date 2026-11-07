import { createContext, useContext } from "react";
import type { SubagentCardStatus } from "@actspace/client/sessions";

const NO_STATUSES: ReadonlyMap<string, SubagentCardStatus> = new Map();

/**
 * 会话里每个子智能体的状态（子智能体 id → 派发卡片状态），由 `ConversationView` 用 `subagentStatusByAgent` 算出。
 * 来信卡片从这里取发送方的状态，所以同一个子智能体的所有卡片一起变（front-子Agent与后台任务规范 §2.1）。
 */
export const SubagentStatusContext = createContext<ReadonlyMap<string, SubagentCardStatus>>(NO_STATUSES);

export function useSubagentStatus(agentId: string): SubagentCardStatus | undefined {
  return useContext(SubagentStatusContext).get(agentId);
}
