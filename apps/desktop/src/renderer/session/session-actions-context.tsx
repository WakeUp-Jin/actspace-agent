import { createContext, useContext } from "react";
import type { MainAgentForm } from "@actspace/shared";

/** 新建会话时带上的位置和形态；侧栏工作区行上的「+」会填 Host 和工作区。 */
export type NewSessionInput = {
  runLocation?: import("@actspace/shared").SessionRunLocation;
  branch?: string;
  hostId?: string;
  workspaceId?: string;
  workspaceRoot?: string;
  agentForm?: MainAgentForm;
};

/**
 * 会话与工作区的操作（14 S7，02 §3.3）：新建 / 选择 / 置顶 / 重命名 / 复制 / fork / 归档 / 取消归档，以及工作区的打开 / 归档 / 移除。
 * 由 App 提供，WorkbenchLayout 和 Sidebar 读取。未提供的操作在侧栏里只做视觉占位。
 */
export type SessionActionsValue = {
  readonly onNewSession?: (input?: NewSessionInput) => void;
  readonly onAddWorkspace?: () => void;
  readonly onSelectSession?: (sessionId: string) => void;
  readonly onTogglePin?: (sessionId: string, nextPinned: boolean) => void;
  readonly onRenameSession?: (sessionId: string, title: string) => void;
  readonly onCopySessionId?: (sessionId: string) => void;
  readonly onCopyTranscript?: (sessionId: string) => void;
  readonly onForkSession?: (sessionId: string) => void;
  readonly onArchiveSession?: (sessionId: string) => void;
  /** 取消归档；侧栏筛选显示已归档时用。 */
  readonly onRestoreSession?: (sessionId: string) => void;
  readonly onOpenWorkspace?: (workspaceId: string) => void;
  readonly onArchiveWorkspace?: (workspaceId: string, workspaceRoot?: string) => void;
  readonly onRemoveWorkspace?: (workspaceId: string, workspaceRoot?: string) => void;
};

export const SessionActionsContext = createContext<SessionActionsValue | null>(null);

export function useSessionActions(): SessionActionsValue {
  const value = useContext(SessionActionsContext);
  if (!value) throw new Error("useSessionActions 需要 SessionActionsContext");
  return value;
}
