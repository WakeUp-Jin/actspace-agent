// 工具调用在界面上的预览：各工具的 `ToolUiPreview` 变体、Bash / Todo / 子 Agent 卡片、工具执行结果。

import type { SubagentKind, SubagentPreset } from "../runtime-v2/subagents";
import type { SubagentListStatus } from "../subagent-labels";
import type { SessionEventType } from "./events";
import type { AgentRunId, EventId, SessionError, SessionId, ToolCallId } from "./primitives";

export type ToolArtifact = {
  type: "file" | "diff" | "image" | "text";
  name: string;
  path?: string;
  mimeType?: string;
};

export type TodoStatus = "pending" | "in_progress" | "completed";

export type TodoItem = {
  id: string;
  content: string;
  status: TodoStatus;
  activeForm?: string;
  createdAt: string;
  updatedAt: string;
};

export type TodoSnapshot = {
  todos: TodoItem[];
  totalCount: number;
  revision: number;
};

export type TodoUiPreview = TodoSnapshot & {
  kind: "todo";
  completedCount: number;
  displayText: string;
};

export type ToolExecutionError = SessionError;

export type ToolOutputRef = {
  kind: "inline" | "file";
  value: string;
};

export type SubAgentRunStatus = "running" | "completed" | "failed" | "aborted";

export type SubAgentTranscriptRef = {
  kind: "subagent_transcript";
  sessionId: SessionId;
  agentRunId: AgentRunId;
  runId: string;
  path?: string;
};

export type AgentToolStats = {
  durationMs: number;
  toolCallCount: number;
  exploredFileCount?: number;
  totalTokens?: number;
};

export type AgentToolRecentEvent = {
  id: EventId;
  type: SessionEventType;
  title: string;
  summary: string;
  timestamp: string;
  isError?: boolean;
};

export type AgentToolPreview = {
  kind: "agent";
  description: string;
  status: SubAgentRunStatus;
  subagentType: "explore";
  /** 主消息行展示的委托类型；缺省时兼容旧事件并按 Explore 处理。只出现在老会话（`delegation/*`）。 */
  agentKind?: "agent" | "explore";
  /** 新事件（`subagent/spawned`）的子智能体种类；老会话缺省，界面回退到 `agentKind`。 */
  subagentKind?: SubagentKind;
  /** 只有 `local` 子智能体有预设。 */
  preset?: SubagentPreset;
  /** 这个子智能体已开始的激活次数（首次创建算 1，每次续派加 1）。 */
  activationCount?: number;
  /** 子智能体 transcript 的绝对路径（父会话 `subagent/spawned.transcriptPath`）。 */
  transcriptPath?: string;
  /** 子 Agent 实际请求的模型（request/header 的 model）；旧事件没有记录时缺省。 */
  model?: string;
  /** 以 background=true 启动；卡片多一个「后台」标签，status 跟随 delegation/completed。 */
  background?: boolean;
  displayText: string;
  summary?: string;
  recentEvents?: AgentToolRecentEvent[];
  transcriptRef?: SubAgentTranscriptRef;
  stats?: AgentToolStats;
  error?: string;
  /**
   * 前端展示形态。
   *
   * - `panel`（默认/缺省）：点击打开 Composer 上方 transcript Panel。
   * - `inline`：历史事件兼容值；当前 renderer 对 Agent/Explore 统一使用 panel 入口。
   *
   * 见 docs/design-docs/collaboration/agent-subagent-runtime.md。
   */
  display?: "panel" | "inline";
};

/**
 * One row of the right-side 子 Agent panel (front-子Agent与后台任务规范.md §2): one subagent across all its activations,
 * folded from the parent Journal (`subagent/*`, plus old `delegation/*`).
 */
export type SubagentListItem = {
  /** The child Session id for `local` / `fork` / old subagents; an opaque id for external ones. */
  agentId: string;
  kind: SubagentKind;
  preset?: SubagentPreset;
  /** Old `delegation/*` record: shown, never continued; its kind label stays Agent / Explore. */
  legacy?: boolean;
  description: string;
  status: SubagentListStatus;
  /** Activations started so far (spawn counts as 1, each continuation adds 1). */
  activationCount: number;
  model?: string;
  background: boolean;
  createdAt: string;
  /** Start of the latest activation. */
  activeSince: string;
  /** End of the latest activation; absent while it runs. */
  endedAt?: string;
  /** Absolute path of the transcript (local / fork) or the CLI's native session log (external). */
  transcriptPath: string;
  /** Fork only: the parent Journal seq the fork copied through. */
  inheritedThroughSeq?: number;
  /** Cumulative `usage.totalTokens` of the child Session (local / fork); absent for external subagents or while unreadable. */
  totalTokens?: number;
  /** The latest activation's final reply and summary. */
  result?: string;
  summary?: string;
  /** Running local / fork only: what it is doing now (`SubagentActivity` label, from live events kept in memory by the Host). */
  activity?: string;
  /** Its latest message to the parent Session (`agent_message`): first line of the body and when it was sent. */
  lastMessage?: { text: string; at: string };
};

export type ToolPreviewKind =
  | "read"
  | "search"
  | "grep"
  | "glob"
  | "web_search"
  | "media_analysis"
  | "image_generation"
  | "directory_list"
  | "edit_diff"
  | "write"
  | "delete"
  | "present"
  | "bash"
  | "agent"
  | "todo"
  | "browser_cua"
  | "browser_dom"
  | "browser_locator"
  | "browser_navigation"
  | "browser_tabs"
  | "browser_user"
  | "browser_wait"
  | "browser_io"
  | "browser_debug"
  | "browser_help"
  | "browser_run"
  | "browser_screenshot"
  | "browser_dom_snapshot"
  | "browser_navigate"
  | "browser_open_tab"
  | "browser_list_tabs"
  | "browser_click"
  | "browser_fill"
  | "browser_press_key"
  | "browser_select"
  | "browser_scroll"
  | "browser_back"
  | "browser_close_tab"
  | "browser_user_tabs"
  | "browser_claim_tab"
  | "browser_finalize"
  | "generic";

/** A file the Agent declared as a deliverable through `present`; it stays at its workspace path. */
export type PresentedFile = {
  /** Workspace-relative display path, or absolute when outside the workspace. */
  path: string;
  outputPath?: string;
  outputRelativePath?: string;
  description?: string;
};

export type ToolUiPreview =
  | { kind: "read"; filePath: string; range?: string; displayText: string; resultPreview?: string[] }
  | { kind: "search"; query: string; scope?: string; resultCount?: number; displayText: string; resultPreview?: string[] }
  | { kind: "grep"; pattern: string; scope?: string; resultCount?: number; displayText: string; resultPreview?: string[] }
  | { kind: "glob"; pattern: string; scope?: string; resultCount?: number; displayText: string; resultPreview?: string[] }
  | { kind: "web_search"; mode: "query" | "url"; query?: string; url?: string; displayText: string; resultUrls?: string[]; contentPreview?: string }
  | { kind: "media_analysis"; mediaName: string; mediaKind: "image" | "video" | "media"; displayText: string }
  | {
      kind: "image_generation";
      status: "running" | "completed" | "partial" | "failed";
      promptPreview: string;
      requestedCount: number;
      generatedCount?: number;
      model?: string;
      size: string;
      displayText: string;
      images?: ToolArtifact[];
      warning?: string;
      errorMessage?: string;
    }
  | { kind: "directory_list"; path: string; entryCount?: number; displayText: string; resultPreview?: string[] }
  | {
      kind: "edit_diff";
      filePath: string;
      outputPath?: string;
      outputRelativePath?: string;
      additions: number;
      deletions: number;
      diff: string;
      collapsedLines: number;
      /** Transient generation progress; never a count of bytes saved or diff lines. */
      generationProgress?: { phase: "generating" | "preparing" | "saving"; characters: number };
      status?: "pending" | "running" | "completed" | "failed" | "denied";
      approvalRequestId?: string;
      /** 失败/拒绝时的错误说明；不复用 diff 字段承载错误文本 */
      errorMessage?: string;
    }
  | {
      kind: "write";
      filePath: string;
      outputPath?: string;
      outputRelativePath?: string;
      additions: number;
      deletions: number;
      diff: string;
      collapsedLines: number;
      /** Transient generation progress; never a count of bytes saved or diff lines. */
      generationProgress?: { phase: "generating" | "preparing" | "saving"; characters: number };
      status?: "pending" | "running" | "completed" | "failed" | "denied";
      approvalRequestId?: string;
      /** 失败/拒绝时的错误说明；不复用 diff 字段承载错误文本 */
      errorMessage?: string;
      /** running 阶段从 LLM 流式 args.content 提取的部分内容；completed 阶段不使用 */
      streamingContent?: string;
    }
  | {
      kind: "delete";
      filePath: string;
      outputPath?: string;
      outputRelativePath?: string;
      displayText: string;
      status?: "pending" | "running" | "completed" | "failed" | "denied";
      approvalRequestId?: string;
    }
  | { kind: "present"; files: PresentedFile[]; displayText: string; status?: "running" | "completed" | "failed" | "denied" }
  | BashPreview
  | AgentToolPreview
  | TodoUiPreview
  | { kind: "generic"; title: string; content: string; artifacts?: ToolArtifact[]; subagentLink?: SubagentToolLink };

/** `send_message` 与停止子智能体的 `task_stop`（老会话 `interrupt_agent`）行：动词加目标子智能体，点目标名打开它（front-子Agent与后台任务规范.md §2.1）。 */
export type SubagentToolLink = { agentId: string; verb: string; target: string };

export type BashStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "denied"
  | "expired"
  | "cancelled";

export type BashPreview = {
  kind: "bash";
  status: BashStatus;
  title: string;
  command: string;
  commandPreview?: string;
  cwd?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  durationMs?: number;
  reason?: string;
  policyLabel?: string;
  approvalRequestId?: string;
  intent?: string;
  /** 申请出沙箱时模型给的理由，显示在审批卡上。 */
  justification?: string;
  /** 命令已转后台运行时的任务 id。 */
  backgroundTaskId?: string;
  /** 命令走了后台路径；卡片只多一个「后台」标签，status 跟随后台任务的真实结果。 */
  background?: boolean;
  /** 后台任务落盘输出路径。 */
  outputFilePath?: string;
  /** 本次命令是否在沙盒内执行（true 沙盒 / false 真实环境 / 缺省未知——历史数据）。 */
  sandboxed?: boolean;
  /** 命令在进程启动前被拒绝或取消，没有进入任何执行环境。 */
  notExecuted?: boolean;
};

export type ToolExecutionResult = {
  toolCallId?: ToolCallId;
  toolName: string;
  ok: boolean;
  summary: string;
  rawOutput?: string;
  truncatedOutput?: string;
  rawOutputRef?: ToolOutputRef;
  modelOutput?: string;
  uiPreview?: ToolUiPreview;
  artifacts?: ToolArtifact[];
  error?: ToolExecutionError;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  tokenEstimate?: number;
};
