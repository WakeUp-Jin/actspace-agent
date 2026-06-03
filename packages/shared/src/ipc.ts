import type { ModelId } from "./model-config";

export type BootstrapState = {
  appVersion: string;
  dataRoot: string;
  sessionRoot: string;
  logRoot: string;
  tmpRoot: string;
  workspaceRoot: string;
};

export {
  ALL_MODEL_LIST,
  DEFAULT_MODEL_ID,
  MODEL_LIST,
  MODEL_REGISTRY,
  isPublicModelId,
  type ModelApi,
  type ModelId,
  type ModelInputKind,
  type ModelProvider,
  type ModelSpec,
  type ModelVisibility,
  resolveModelSpec,
} from "./model-config";

// ─── IPC 输入类型 ───

export type RunTurnInput = {
  sessionId: string;
  turnId: string;
  userInput: string;
  attachments?: import("./session").ComposerAttachment[];
  model?: ModelId;
  thinkingEnabled?: boolean;
};

export type CompactContextInput = {
  sessionId: string;
  turnId: string;
  model?: ModelId;
};

export type CompactContextResult = {
  sessionId: string;
  turnId: string;
  status: "compacted" | "skipped" | "failed";
  events: import("./session").SessionEvent[];
  contextSnapshot: import("./session").ContextUsageSnapshot;
  contextState?: import("./session").ContextState | null;
  error?: {
    code: string;
    message: string;
  };
};

export type SelectFilesResult = {
  canceled: boolean;
  attachments: import("./session").ComposerAttachment[];
};

export type SelectWorkspaceDirectoryResult = {
  canceled: boolean;
  workspaceRoot?: string;
};

export type AbortTurnInput = {
  sessionId: string;
  turnId: string;
};

export type ApprovalDecideInput = {
  requestId: string;
  decision: "approve_once" | "deny" | "allow_similar";
};

export type ApprovalDecideResult = {
  ok: boolean;
  reason?: string;
};

export type ApprovalListPendingInput = {
  sessionId?: string;
};

export type PendingApprovalInfo = {
  requestId: string;
  toolName: string;
  summary: string;
  reason: string;
  riskLevel?: string;
  command?: string;
  createdAt: number;
  expiresAt: number;
};

export type SessionListItem = {
  id: string;
  title: string;
  updatedAt: string;
  turnCount: number;
  /** workspace registry 的稳定 id；旧 session 可能缺失。 */
  workspaceId?: string;
  /** 创建会话时的工作区根目录；旧 session 缺这个字段时由前端视作 default workspace。 */
  workspaceRoot?: string;
  /** 用户是否把该会话钉到 Pinned 分区。 */
  pinned?: boolean;
  /** 用户是否把该会话归档。 */
  archived?: boolean;
};

export type SessionListInput = {
  /** 缺省为 false：普通会话列表只返回未归档会话。 */
  archived?: boolean;
};

export type SessionRecord = {
  meta: import("./session").SessionMeta;
  events: import("./session").SessionEvent[];
  messageBlocks?: import("./session").MessageBlock[];
  contextSnapshot?: import("./session").ContextUsageSnapshot | null;
  contextState?: import("./session").ContextState | null;
  diffSummary?: import("./session").SessionDiffSummary;
};

export type SessionGetInput = {
  sessionId: string;
};

/** 把一条回复 Markdown 用主模型转成 HTML（见 `front-右侧面板与文件渲染规范.md`）。 */
export type VisualizeReplyInput = {
  sessionId: string;
  /** 被可视化的 assistant 消息事件 id，参与缓存键。 */
  messageId: string;
  /** 回复 Markdown 原文，参与缓存键（内容变了 hash 不命中即重算）。 */
  content: string;
  /** 强制重新生成，忽略缓存命中。 */
  regenerate?: boolean;
  model?: ModelId;
};

export type VisualizeReplyResult = {
  html: string;
  /** content 的内容指纹；renderer 可据此判断是否需重算。 */
  sourceHash: string;
  /** true=命中缓存（未触发模型调用）；false=本次新生成。 */
  cached: boolean;
  model?: string;
  provider?: string;
  usage?: {
    input: number;
    output: number;
    totalTokens: number;
  };
};

/** 列出某会话已生成的可视化 HTML（右侧「Reply HTML」文件列表用）。 */
export type ListVisualizationsInput = {
  sessionId: string;
};

export type SessionVisualizationItem = {
  messageId: string;
  sourceHash: string;
  /** 文件列表展示名（从源回复派生）。 */
  title: string;
  html: string;
  model?: string;
  createdAt: string;
};

export type ListVisualizationsResult = {
  /** 按 createdAt 倒序（最新在前）。 */
  items: SessionVisualizationItem[];
};

/**
 * 按需重建某会话的完整 Context（含各 bucket 的内容预览），供右侧 Context 完整视图实时展示。
 *
 * 持久化的 context-state.json 只在每轮 turn 结束时写入；老会话或旧版本写入的快照可能缺少
 * 内容预览。该接口在 main 进程重新装配该会话的 ContextManager（一次性吃完 session.jsonl），
 * 重新算出 systemPrompt / tools / conversation 等 bucket 的预览，不调用 LLM。
 */
export type DescribeContextInput = {
  sessionId: string;
};

// ─── 工作区文件浏览器（见 `docs/design-docs/front-右侧面板与文件渲染规范.md`）───

/** 懒加载一层工作区目录。renderer 不直接读 FS，全部经此 IPC。 */
export type WorkspaceListDirInput = {
  /** 会话根；不传由 main 用 BootstrapState.workspaceRoot 兜底。 */
  workspaceRoot?: string;
  /** 相对 workspaceRoot 的目录路径，"" / "." 表示根。 */
  relativePath?: string;
};

export type WorkspaceDirEntryKind = "dir" | "file";

export type WorkspaceDirEntry = {
  name: string;
  /** 相对 workspaceRoot 的 POSIX 路径。 */
  relativePath: string;
  kind: WorkspaceDirEntryKind;
  /** 文件字节数；目录为 undefined。 */
  size?: number;
};

export type WorkspaceListDirResult = {
  /** 实际使用的根（绝对路径）。 */
  root: string;
  /** 规范化后的当前目录相对路径。 */
  relativePath: string;
  /** 目录在前、文件在后，各自按名字升序。 */
  entries: WorkspaceDirEntry[];
  error?: "not_found" | "not_a_directory" | "escapes_root" | "too_many_entries";
};

/** 读取单个工作区文件，供右侧面板复用现有渲染视图打开。 */
export type WorkspaceReadFileInput = {
  workspaceRoot?: string;
  relativePath: string;
};

export type WorkspaceFileRenderKind = "markdown" | "html" | "image" | "text";

export type WorkspaceReadFileResult = {
  relativePath: string;
  renderKind: WorkspaceFileRenderKind;
  /** text / markdown / html：UTF-8 文本；image：空。 */
  content?: string;
  /** image：data URL（base64）；其余空。 */
  dataUrl?: string;
  /** text 类的语法高亮语言（highlight.js 语言 id，按扩展名推断）；无法识别 / 截断 / 二进制时缺省，渲染回退纯等宽。 */
  language?: string;
  /** 文件字节数。 */
  size: number;
  /** 文本超过大小上限被截断。 */
  truncated?: boolean;
  error?: "not_found" | "not_a_file" | "too_large" | "binary" | "escapes_root";
};

export type WorkspaceEntryKind = "default" | "folder";

export type WorkspaceEntry = {
  id: string;
  kind: WorkspaceEntryKind;
  label: string;
  path: string;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceRegistry = {
  version: 1;
  defaultWorkspaceId: string;
  items: WorkspaceEntry[];
};

export type WorkspaceListResult = WorkspaceRegistry;

export type SessionCreateInput = {
  title?: string;
  /** workspace registry 的稳定 id；与 workspaceRoot 一起写入 session meta。 */
  workspaceId?: string;
  /** 创建时指定 workspace 根目录；不传由主进程从 BootstrapState 自动注入。 */
  workspaceRoot?: string;
};

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

export type SessionArchiveInput = {
  sessionId: string;
  archived: boolean;
};

export type SessionArchiveResult = {
  ok: boolean;
  error?: string;
};

export type UsageStatisticsRange = "day" | "week" | "month" | "total";

/**
 * Usage 统计的取数范围。
 *
 * - `"session"`：单个 session 的 events 聚合（兼容旧用法，必须传 `sessionId`）；
 * - `"global"`（默认）：跨所有普通对话 session + Kairos 自主模式的全部历史 LLM/工具事件汇总，
 *   `sessionId` 字段被忽略。
 *
 * 出于向后兼容考虑，旧调用 `{ sessionId: "..." }` 在不指定 `scope` 时仍按 `"session"` 模式执行。
 */
export type UsageStatisticsScope = "session" | "global";

export type UsageStatisticsGetInput = {
  /** 仅当 scope==="session" 时必填；scope==="global" 时忽略。 */
  sessionId?: string;
  range?: UsageStatisticsRange;
  /** 默认 "global"（无 sessionId）或 "session"（有 sessionId）。 */
  scope?: UsageStatisticsScope;
};

export type UsageStatisticsSummary = {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  reasoningTokens: number;
  toolCallCount: number;
  conversationCount: number;
  costUsd: number;
  cacheEfficiencyPercent: number;
};

export type UsageStatisticsModelEntry = {
  name: string;
  provider?: string;
  totalTokens: number;
  percent: number;
  callCount: number;
  costUsd: number;
};

export type UsageStatisticsToolEntry = {
  name: string;
  callCount: number;
  percent: number;
  failedCount: number;
  averageDurationMs?: number;
};

/**
 * 单日单模型的明细，仅用于 UI 热力图 hover tooltip 的 "MODEL BREAKDOWN" 区。
 * 不进入主统计区——主区按"整段时间窗"展示模型分布。
 */
export type UsageStatisticsDailyModelBreakdown = {
  name: string;
  totalTokens: number;
  percent: number;
};

export type UsageStatisticsDailyRow = {
  date: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  reasoningTokens: number;
  conversationCount: number;
  toolCallCount: number;
  costUsd: number;
  /**
   * 当日按 model 拆分的 token 明细，按 totalTokens 降序。
   * - `percent` 是"在该日 totalTokens 内的占比"，不是全段时间窗内的占比；
   * - 没有 llm_usage 事件的日期会得到空数组。
   */
  modelBreakdown: UsageStatisticsDailyModelBreakdown[];
};

export type UsageStatisticsSnapshot = {
  /** "session"=单会话；"global"=跨所有 session + Kairos 全部历史。 */
  scope: UsageStatisticsScope;
  /** 仅 scope==="session" 时为对应 session id；global 时为 null。 */
  sessionId: string | null;
  /** 仅 scope==="session" 时为对应 session 标题；global 时通常为 "全部数据"。 */
  title: string;
  range: UsageStatisticsRange;
  generatedAt: string;
  periodStart?: string;
  periodEnd?: string;
  /** 参与聚合的数据源条数（global 时是 session 个数；session 时固定为 1）。 */
  sourceCount?: number;
  summary: UsageStatisticsSummary;
  modelDistribution: UsageStatisticsModelEntry[];
  toolDistribution: UsageStatisticsToolEntry[];
  dailyRows: UsageStatisticsDailyRow[];
};

export type DeepSeekBalanceDisplay = {
  amount: string;
  currency: string;
};

export type DeepSeekBalanceSnapshot = {
  provider: "deepseek";
  isConfigured: boolean;
  isAvailable: boolean | null;
  generatedAt: string;
  displayBalance: DeepSeekBalanceDisplay | null;
};

export type LocalUpdateErrorCode =
  | "invalid_source"
  | "not_packaged"
  | "not_macos"
  | "not_writable"
  | "missing_source"
  | "already_running"
  | "spawn_failed";

export type LocalUpdateState = {
  sourceRoot: string | null;
  sourceValid: boolean;
  sourceError?: LocalUpdateErrorCode;
  appPath: string | null;
  installParent: string | null;
  canUpdate: boolean;
  reason?: string;
  logPath: string;
  running: boolean;
  lastStartedAt?: string;
};

export type LocalUpdateSelectSourceResult = {
  canceled: boolean;
  state: LocalUpdateState;
};

export type LocalUpdateStartResult = {
  ok: boolean;
  state: LocalUpdateState;
  error?: LocalUpdateErrorCode;
  message?: string;
};

export type AppBootstrapStateInput = {
  appVersion: string;
  dataRoot: string;
  sessionRoot?: string;
  logRoot?: string;
  tmpRoot?: string;
  workspaceRoot?: string;
};

export function createBootstrapState(input: AppBootstrapStateInput): BootstrapState {
  return {
    appVersion: input.appVersion,
    dataRoot: input.dataRoot,
    sessionRoot: input.sessionRoot ?? `${input.dataRoot}/sessions`,
    logRoot: input.logRoot ?? `${input.dataRoot}/logs`,
    tmpRoot: input.tmpRoot ?? `${input.dataRoot}/tmp`,
    workspaceRoot: input.workspaceRoot ?? input.dataRoot
  };
}
