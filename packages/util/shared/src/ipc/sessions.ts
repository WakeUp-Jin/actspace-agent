// 会话管理 IPC（`sessions.*`、`sideChat.*`）：列表、读取、创建、分叉、改名、钉住、归档、模式切换。
// 会话事件与投影类型本身在 `../session`。

import type { HostConnectionState } from "../host-protocol";
import type { ModelKey } from "../model-config";
import type { RuntimeDesktopSessionProjection } from "../runtime-v2";
import type { PermissionMode } from "../runtime-v2/permission";
import type { MainAgentForm } from "../runtime-v2/runtime";
import type {
  ContextState,
  ContextUsageSnapshot,
  MessageBlock,
  SessionDiffSummary,
  SessionEvent,
  SessionMeta,
  SessionWorktreeContext,
  SubAgentTranscriptRef,
} from "../session";
import type { UsageReadModelInfo } from "./usage";

export type ComposerMode = "chat" | "plan" | "agent";
export type { MainAgentForm } from "../runtime-v2/runtime";

export type SessionRunLocation = "this_mac" | "worktree";

export type TurnExecutionContextInput = {
  runLocation: SessionRunLocation;
  workspaceId?: string;
  sourceWorkspaceRoot: string;
  /** This Mac 下是目标 checkout；Worktree 下是 base branch。 */
  branch?: string;
};

export type SessionListItem = {
  hostId?: string;
  hostName?: string;
  connectionState?: HostConnectionState;
  /** Runtime session admission facts used by optional session capabilities. */
  accessState?: "read-write" | "degraded" | "browse-only" | "corrupt";
  isChildSession?: boolean;
  /** Query-only hint. False avoids recovering inactive background history for badges. */
  hasPendingTasks?: boolean;
  id: string;
  title: string;
  updatedAt: string;
  agentRunCount: number;
  agentForm?: MainAgentForm;
  agentMode?: ComposerMode;
  agentModeRevision?: number;
  /** workspace registry 的稳定 id；旧 session 可能缺失。 */
  workspaceId?: string;
  /** 创建会话时的工作区根目录；旧 session 缺这个字段时由前端视作 default workspace。 */
  workspaceRoot?: string;
  /** Worktree 会话的隔离执行上下文；普通会话缺省。 */
  worktree?: SessionWorktreeContext;
  /** 用户是否把该会话钉到 Pinned 分区。 */
  pinned?: boolean;
  /** 用户是否把该会话归档。 */
  archived?: boolean;
  /** 侧边对话所属的主会话；左侧会话栏不单独列出这类会话。 */
  sideChatParentId?: string;
  /** 主会话下未归档的侧边对话数量；0 时省略。 */
  sideChatCount?: number;
};

export type SessionListPageInput = { hostId?: string; workspaceRoot?: string; pinned?: boolean; after?: string; search?: string; limit?: number };
export type SessionListPage = { nextCursor?: string; items: SessionListItem[]; groups: { hostId?: string; workspaceRoot: string; pinned: boolean; hasMore: boolean }[]; indexing: boolean; failed: number; readModel?: UsageReadModelInfo };

export type SessionListInput = {
  /** 缺省为 false：普通会话列表只返回未归档会话。 */
  archived?: boolean;
};

export type SessionRecord = {
  meta: SessionMeta;
  events: SessionEvent[];
  messageBlocks?: MessageBlock[];
  contextSnapshot?: ContextUsageSnapshot | null;
  contextState?: ContextState | null;
  diffSummary?: SessionDiffSummary;
};

export type SessionGetInput = {
  sessionId: string;
};

export type SessionPreviewInput = {
  sessionId: string;
};

export type SessionPreviewResult = {
  sessionId: string;
  workspaceId?: string;
  workspaceRoot?: string;
  model?: string;
  /** 旧 session / renderer 兼容字段。 */
  modelId?: string;
  /** 新写入的 provider-qualified 模型身份。 */
  modelKey?: ModelKey;
  contextSnapshot?: ContextUsageSnapshot | null;
};

export type SubAgentTranscriptGetInput = {
  transcriptRef: SubAgentTranscriptRef;
};

export type SessionCreateInput = {
  runLocation?: SessionRunLocation;
  /** Local checkout target, or the base branch of a new worktree. */
  branch?: string;
  /** Remote ownership is fixed when the Session is created. */
  hostId?: string;
  title?: string;
  agentForm?: MainAgentForm;
  agentMode?: ComposerMode;
  /** workspace registry 的稳定 id；与 workspaceRoot 一起写入 session meta。 */
  workspaceId?: string;
  /** 创建时指定 workspace 根目录；不传由主进程从 BootstrapState 自动注入。 */
  workspaceRoot?: string;
};

export type SessionForkInput = {
  sessionId: string;
  /** 从这一轮的助手回复分叉：保留到该轮结束；不传则整个会话分叉。 */
  turnId?: string;
};

/** 从主会话分出侧边对话：截到上一轮结束，默认 Plan 模式。 */
export type SideChatOpenInput = { parentSessionId: string };
export type SideChatOpenResult = {
  /** 原始投影；`apps/desktop/src/renderer/api/sessions.ts` 负责 `projectChatWindow`。 */
  session: RuntimeDesktopSessionProjection;
  inheritedTurnCount: number;
  /** 分出时主会话正在运行，那一轮没有带过来。 */
  runningTurnExcluded: boolean;
};
export type SideChatListInput = { parentSessionId: string };

export type SessionPinInput = {
  sessionId: string;
  pinned: boolean;
};

export type SessionPinResult = {
  ok: boolean;
  error?: string;
};

export type SessionRenameInput = {
  sessionId: string;
  title: string;
};

export type SessionRenameResult = {
  ok: boolean;
  error?: string;
};

export type SessionWorkspaceInput = {
  sessionId: string;
  workspaceId?: string;
  workspaceRoot?: string;
};

export type SessionWorkspaceResult = {
  ok: boolean;
  error?: string;
};

export type SessionPermissionModeInput = {
  sessionId: string;
  mode: PermissionMode;
};

export type SessionAgentModeInput = {
  sessionId: string;
  mode: ComposerMode;
  expectedRevision?: number;
};

export type SessionAgentModeResult = {
  ok: boolean;
  mode?: ComposerMode;
  revision?: number;
  error?: string;
};

export type SessionPermissionModeResult = {
  ok: boolean;
  mode?: PermissionMode;
  error?: string;
};

export type SessionArchiveInput = {
  sessionId: string;
  archived: boolean;
};

export type SessionArchiveResult = {
  ok: boolean;
  error?: string;
};

export type SessionArchiveManyInput = {
  sessionIds: string[];
};

export type SessionArchiveManyResult = {
  ok: boolean;
  archivedSessionIds: string[];
  failedSessionIds: string[];
};
