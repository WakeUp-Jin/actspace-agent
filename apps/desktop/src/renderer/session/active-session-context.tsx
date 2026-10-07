import { createContext, useContext } from "react";
import type { ContextState, ContextUsageSnapshot, MessageBlock } from "@actspace/shared";
import type { ComposerSendOptions } from "../components/Composer";

/**
 * 当前会话（14 S7，02 §3.3）：正文、运行状态和 run 动作。由 App 提供，WorkbenchLayout / ConversationView 读取。
 * 字段名沿用原来的 prop 名，`sessionId` 对应原来 WorkbenchLayout 的 `activeSessionId`。
 * 上下文用量和会话是否就绪是 App 的原始值，WorkbenchLayout 会再和投影合并后传给 ConversationView。
 */
export type ActiveSessionValue = {
  readonly sessionId: string | null;
  readonly title: string;
  readonly messages: MessageBlock[];
  readonly contextSnapshot: ContextUsageSnapshot | null;
  readonly contextState?: ContextState | null;
  readonly isStreaming: boolean;
  readonly isAborting: boolean;
  /** 上下文压缩进行中：停止按钮置灰（压缩不可中止）。 */
  readonly isCompacting: boolean;
  readonly isSessionReady: boolean;
  readonly sendScrollRequestId: number;
  readonly composerFocusRequestId: number;
  readonly onSend?: (text: string, options: ComposerSendOptions) => void;
  readonly onAbort?: () => void;
  /** 压缩失败分隔线上的「重试」。 */
  readonly onRetryCompaction?: () => void;
};

export const ActiveSessionContext = createContext<ActiveSessionValue | null>(null);

export function useActiveSession(): ActiveSessionValue {
  const value = useContext(ActiveSessionContext);
  if (!value) throw new Error("useActiveSession 需要 ActiveSessionContext");
  return value;
}
