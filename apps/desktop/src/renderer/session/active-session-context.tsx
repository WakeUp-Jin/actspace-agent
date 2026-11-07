import { createContext, useContext } from "react";
import type { ContextState, ContextUsageSnapshot } from "@actspace/shared";
import type { TaskSnapshot } from "@actspace/shared/runtime-v2";
import type { ComposerSendOptions } from "../components/Composer";

/** 编辑提问重发（agent-edit-resend-rewind.md §5.2）：从 `runId` 这一轮（用户消息的 durable 序号 `fromSeq`）重来。 */
export type TurnResend = {
  readonly sessionId: string;
  readonly runId: string;
  readonly fromSeq: number;
  readonly text: string;
  readonly options: ComposerSendOptions;
};

/**
 * 当前会话（14 S7，02 §3.3）：运行状态和 run 动作。由 App 提供，WorkbenchLayout / ConversationView 读取。
 * 消息序列流式时每帧都变，不在这里：见 transcript-context.tsx 的 `useTranscriptSelect`。这个 value 流式时保持稳定。
 * 字段名沿用原来的 prop 名，`sessionId` 对应原来 WorkbenchLayout 的 `activeSessionId`。
 * 上下文用量和会话是否就绪是 App 的原始值，WorkbenchLayout 会再和投影合并后传给 ConversationView。
 */
export type ActiveSessionValue = {
  readonly sessionId: string | null;
  readonly title: string;
  readonly contextSnapshot: ContextUsageSnapshot | null;
  readonly contextState?: ContextState | null;
  readonly isStreaming: boolean;
  readonly isAborting: boolean;
  /** 上下文压缩进行中；是否可停止由 onAbort 能力决定。 */
  readonly isCompacting: boolean;
  readonly isSessionReady: boolean;
  readonly sendScrollRequestId: number;
  /** New Quick Open intent: reveal chat in the workbench, then focus its composer. */
  readonly composerFocusRequestId: number;
  readonly onSend?: (text: string, options: ComposerSendOptions) => void;
  readonly onAbort?: () => void;
  /** 压缩失败分隔线上的「重试」。 */
  readonly onRetryCompaction?: () => void;
  /** 编辑提问后重发；失败时抛出，文案已经显示在 Composer 的提示行。 */
  readonly onResendTurn?: (edit: TurnResend) => Promise<void>;
  /** 会话的 Host 任务快照：编辑器从这一轮的任务取原始内容。 */
  readonly readTaskSnapshot?: (sessionId: string) => TaskSnapshot | undefined;
};

export const ActiveSessionContext = createContext<ActiveSessionValue | null>(null);

export function useActiveSession(): ActiveSessionValue {
  const value = useContext(ActiveSessionContext);
  if (!value) throw new Error("useActiveSession 需要 ActiveSessionContext");
  return value;
}
