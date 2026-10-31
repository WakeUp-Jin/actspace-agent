import { createContext, useContext } from "react";
import type { ClientSessionStore } from "@actspace/client/sessions";
import type { ComposerMode, ModelSelectionId, SessionListItem, SideChatOpenResult, UsableModelView } from "@actspace/shared";
import type { LiveRunStore } from "../../../session/live-runs/live-run-store";
import type { SessionLocalStore } from "../../../session/session-local-store";
import type { ComposerSendOptions } from "../../Composer";
import type { SessionUiStatusKind } from "../../sidebar/session-status";

/**
 * 右栏侧边对话用到的 App 能力（见 side-chat-design.md）。
 * 侧边对话是普通的会话：消息、流式和审批走 App 已有的 store 与事件流，这里只把它们按会话 id 暴露出来。
 */
export type SideChatRuntimeValue = {
  readonly sessionStore: ClientSessionStore;
  readonly liveRuns: LiveRunStore;
  readonly localStore: SessionLocalStore;
  /** 运行中、未读、待审批等状态（与左侧会话栏同一份），tab 用它显示提示。 */
  readonly statuses: Readonly<Record<string, SessionUiStatusKind>>;
  readonly models?: UsableModelView[];
  readonly defaultModelId?: ModelSelectionId;
  /** 主会话输入框当前选的模型：新开的侧边对话默认用它。 */
  readonly parentModelId: ModelSelectionId;
  /** 远端运行目标暂不支持侧边对话。 */
  readonly available: boolean;
  /** 某个会话的一次性提示（发送核对等）。 */
  readonly notice: { readonly sessionId: string; readonly text: string } | null;
  readonly open: (parentSessionId: string) => Promise<SideChatOpenResult>;
  readonly list: (parentSessionId: string) => Promise<SessionListItem[]>;
  readonly send: (sessionId: string, text: string, options: ComposerSendOptions) => Promise<void>;
  readonly abort: (sessionId: string) => void;
  readonly setMode: (sessionId: string, mode: ComposerMode) => Promise<void>;
  readonly markRead: (sessionId: string) => void;
  /** 把第一条问题写成会话标题：分叉时标题是从主会话复制的，收起后列表要靠它认出这条对话。 */
  readonly rename: (sessionId: string, title: string) => Promise<void>;
  /** 打开着的侧边对话常驻 store（不被 cell 保留策略清掉）；返回释放函数。 */
  readonly retain: (sessionId: string) => () => void;
};

export const SideChatRuntimeContext = createContext<SideChatRuntimeValue | null>(null);

export function useSideChatRuntime(): SideChatRuntimeValue | null {
  return useContext(SideChatRuntimeContext);
}
