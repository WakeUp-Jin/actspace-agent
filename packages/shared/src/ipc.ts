import type {
  ModelDefinition,
  ModelId,
  ModelKey,
} from "./model-config";
import type { ModelPurpose, ModelUnavailabilityReason } from "./model-resolver";
import type { ProviderId } from "./provider-config";
import type { CatalogCacheState, CatalogModelView } from "./openrouter-catalog";
import type {
  InstalledModelSettings,
  ProviderConnectionErrorKind,
  ProviderProxySettings,
  ProviderSettingsView,
  TaskModelSettings,
} from "./settings";

export type BootstrapState = {
  appVersion: string;
  dataRoot: string;
  sessionRoot: string;
  logRoot: string;
  tmpRoot: string;
  workspaceRoot: string;
};

// ─── 右侧终端 IPC ───

export const TERMINAL_LIMITS = {
  maxPerSession: 4,
  maxPerWindow: 12,
  maxInputBytes: 64 * 1024,
  minCols: 2,
  maxCols: 500,
  minRows: 1,
  maxRows: 300,
} as const;

export type TerminalStatus = "running" | "exited" | "closing" | "closed";

export type TerminalErrorCode =
  | "session_not_found"
  | "workspace_not_found"
  | "workspace_not_registered"
  | "terminal_not_found"
  | "terminal_owned_by_another_window"
  | "terminal_limit_reached"
  | "shell_not_found"
  | "shell_environment_failed"
  | "pty_spawn_failed"
  | "invalid_terminal_size"
  | "invalid_terminal_input"
  | "terminal_closed"
  | "native_module_unavailable";

export type TerminalOperationError = {
  code: TerminalErrorCode;
  message: string;
};

export type TerminalSessionSnapshot = {
  id: string;
  sessionId: string;
  title: string;
  shellName: string;
  status: TerminalStatus;
  exitCode?: number;
  cols: number;
  rows: number;
  createdAt: string;
};

export type TerminalCreateInput = { sessionId: string; cols: number; rows: number };
export type TerminalAttachInput = { terminalId: string; cols: number; rows: number };
export type TerminalDetachInput = { terminalId: string };
export type TerminalListInput = { sessionId: string };
export type TerminalWriteInput = { terminalId: string; data: string };
export type TerminalResizeInput = { terminalId: string; cols: number; rows: number };
export type TerminalAckInput = { terminalId: string; bytes: number };
export type TerminalCloseInput = { terminalId: string };

export type TerminalOperationResult =
  | { ok: true }
  | { ok: false; error: TerminalOperationError };

export type TerminalSessionResult =
  | { ok: true; terminal: TerminalSessionSnapshot }
  | { ok: false; error: TerminalOperationError };

export type TerminalListResult = {
  terminals: TerminalSessionSnapshot[];
};

export type TerminalEvent =
  | { type: "attached"; terminal: TerminalSessionSnapshot }
  | { type: "init_log"; terminalId: string; data: string; truncated: boolean }
  | { type: "data"; terminalId: string; data: string; bytes: number }
  | { type: "title"; terminalId: string; title: string }
  | { type: "exit"; terminalId: string; exitCode: number }
  | { type: "error"; terminalId?: string; error: TerminalOperationError };

export {
  ALL_MODEL_LIST,
  DEFAULT_MODEL_ID,
  MODEL_LIST,
  MODEL_REGISTRY,
  BUILTIN_MODEL_LIST,
  BUILTIN_MODEL_REGISTRY,
  DEFAULT_MODEL_KEY,
  LEGACY_MODEL_KEY_MAP,
  isPublicModelId,
  legacyModelIdFromKey,
  normalizeModelKey,
  resolveModelDefinition,
  resolveModelDefinitionByApiModel,
  type ModelApi,
  type ModelDefinition,
  type ModelId,
  type ModelInputKind,
  type ModelKey,
  type ModelProvider,
  type ModelReasoningEffort,
  type ModelSelectionId,
  type ModelSpec,
  type ModelVisibility,
  resolveModelSpec,
} from "./model-config";

// ─── IPC 输入类型 ───

export type ComposerMode = "chat" | "plan" | "agent";

export type RunAgentInput = {
  sessionId: string;
  agentRunId: string;
  userInput: string;
  /** 首个普通 Agent Run 的执行目录准备；已有运行记录的 session 忽略该字段。 */
  executionContext?: TurnExecutionContextInput;
  attachments?: import("./session").ComposerAttachment[];
  mode?: ComposerMode;
  selectedSkills?: string[];
  /** 旧 renderer 兼容；Plan 5 新 UI 改发 modelKey。 */
  model?: ModelId;
  modelKey?: ModelKey;
  thinkingEnabled?: boolean;
  reasoningEffort?: import("./model-config").ModelReasoningEffort;
  /** 内置 Explore 聚焦子代理模型；null/缺省 = deepseek-v4-flash。由 main 从 settings 注入。 */
  exploreModelId?: ModelId | null;
  exploreModelKey?: ModelKey | null;
};

export type SessionRunLocation = "this_mac" | "worktree";

export type TurnExecutionContextInput = {
  runLocation: SessionRunLocation;
  workspaceId?: string;
  sourceWorkspaceRoot: string;
  /** This Mac 下是目标 checkout；Worktree 下是 base branch。 */
  branch?: string;
};

export type GitBranchItem = {
  name: string;
  current: boolean;
  /** 存在时表示该 branch 已被某个 worktree checkout。 */
  checkedOutPath?: string;
};

export type WorkspaceGitContextStatus =
  | "ready"
  | "not_repository"
  | "no_head"
  | "git_not_found"
  | "failed";

export type WorkspaceGitContextInput = {
  workspaceRoot?: string;
};

export type WorkspaceGitContext = {
  status: WorkspaceGitContextStatus;
  workspaceRoot: string;
  repositoryRoot?: string;
  currentBranch?: string;
  detachedCommit?: string;
  headCommit?: string;
  branches: GitBranchItem[];
  error?: string;
};

export type WorkspaceCreateFolderInput = {
  parentRoot: string;
  name: string;
};

export type WorkspaceCreateFolderResult =
  | { ok: true; workspaceId: string; workspaceRoot: string }
  | { ok: false; error: string };

export type AgentTraceListInput = {
  sessionId: string;
};

export type AgentTraceReadInput = {
  sessionId: string;
  agentRunId: string;
};

export type AgentTraceTurnSummary = {
  turnId: string;
  turnIndex: number;
  startedAt: string;
  endedAt?: string;
  llmCallCount: number;
  retryCount: number;
  toolNames: string[];
  modelNames: string[];
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  durationMs: number;
};

export type AgentTraceSummary = {
  schemaVersion: 1;
  toolSummaryVersion?: 2;
  sessionId: string;
  agentRunId: string;
  startedAt: string;
  endedAt?: string;
  status: "recording" | "completed" | "failed";
  truncated: boolean;
  turnCount: number;
  llmCallCount: number;
  retryCount: number;
  eventCount: number;
  toolNames: string[];
  modelNames: string[];
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  durationMs: number;
  byteSize: number;
  turns: AgentTraceTurnSummary[];
};

export type AgentTraceListResult = {
  traces: AgentTraceSummary[];
};

export type AgentTraceReadResult = {
  trace: AgentTraceSummary;
  events: import("./session").AgentTraceEvent[];
};

export type AgentAnalysisTotals = {
  agentRunCount: number;
  turnCount: number;
  llmCallCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  durationMs: number;
};

export type AgentAnalysisRunSummary = AgentTraceSummary & {
  userMessagePreview: string;
};

export type AgentAnalysisIndexInput = {
  sessionId: string;
};

export type AgentAnalysisIndexResult = {
  sessionId: string;
  title: string;
  totals: AgentAnalysisTotals;
  toolNames: string[];
  runs: AgentAnalysisRunSummary[];
};

export type AgentAnalysisSessionStatus = "recording" | "completed" | "failed" | "empty" | "unavailable";

export type AgentAnalysisSessionSummary = {
  sessionId: string;
  title: string;
  updatedAt: string;
  workspaceId?: string;
  workspaceRoot?: string;
  status: AgentAnalysisSessionStatus;
  agentRunCount: number;
  turnCount: number;
  llmCallCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  durationMs: number;
  modelNames: string[];
};

export type AgentAnalysisSessionIndexResult = {
  totals: AgentAnalysisTotals & { sessionCount: number };
  modelNames: string[];
  sessions: AgentAnalysisSessionSummary[];
};

export type AgentTraceClearInput =
  | { scope: "session"; sessionId: string }
  | { scope: "all" };

export type AgentTraceClearResult = {
  filesDeleted: number;
  bytesFreed: number;
};

export type CompactContextInput = {
  sessionId: string;
  agentRunId: string;
  model?: ModelId;
  modelKey?: ModelKey;
};

export type CompactContextResult = {
  sessionId: string;
  agentRunId: string;
  status: "compacted" | "skipped" | "failed";
  events: import("./session").SessionEvent[];
  contextSnapshot: import("./session").ContextUsageSnapshot;
  contextState?: import("./session").ContextState | null;
  error?: {
    code: string;
    message: string;
  };
};

export type GenerateEvalCandidateInput = {
  sessionId: string;
  /** `/eval` 命令自身的系统 turn id；不写成普通 user_message。 */
  agentRunId: string;
  /** `/eval` 后的可选失败说明。 */
  reason?: string;
  model?: ModelId;
  modelKey?: ModelKey;
  thinkingEnabled?: boolean;
  reasoningEffort?: import("./model-config").ModelReasoningEffort;
};

export type GenerateEvalCandidateResult = {
  sessionId: string;
  agentRunId: string;
  targetAgentRunId?: string;
  status: "generated" | "failed";
  candidateId?: string;
  candidatePath?: string;
  events: import("./session").SessionEvent[];
  error?: {
    code: string;
    message: string;
  };
};

// ─── 多供应商与模型管理 IPC（Plan 0 只锁契约，Plan 2/3/5 接实现） ───

export type ProviderOperationErrorCode =
  | "invalid_provider"
  | "invalid_api_key"
  | "invalid_base_url"
  | "invalid_proxy_url"
  | "secret_storage_unavailable"
  | "write_failed"
  | "connection_failed"
  | "credential_not_found"
  | "credential_in_use";

export type ProviderOperationError = {
  code: ProviderOperationErrorCode;
  message: string;
  errorKind?: ProviderConnectionErrorKind;
};

export type ProvidersListResult = {
  providers: Record<ProviderId, ProviderSettingsView>;
};

export type ProviderConnectInput = {
  provider: ProviderId;
  apiKey: string;
  managementKey?: string | null;
  baseUrl?: string | null;
  proxy?: ProviderProxySettings;
  defaultPricingMultiplier?: number;
};

export type ProviderUpdateInput = {
  provider: ProviderId;
  managementKey?: string | null;
  baseUrl?: string | null;
  proxy?: ProviderProxySettings;
  enabled?: boolean;
  defaultPricingMultiplier?: number;
};

export type ProviderCredentialAddInput = {
  provider: ProviderId;
  label: string;
  apiKey: string;
  pricingMultiplier?: number;
};

export type ProviderCredentialUpdateInput = {
  provider: ProviderId;
  credentialId: string;
  label: string;
  pricingMultiplier?: number;
};

export type ProviderCredentialInput = {
  provider: ProviderId;
  credentialId: string;
};

export type ProviderCredentialOperationResult =
  | { ok: true; provider: ProviderSettingsView }
  | { ok: false; error: ProviderOperationError & { references?: ModelKey[] } };

export type ProviderIdInput = { provider: ProviderId };

export type ProviderOperationResult =
  | { ok: true; provider: ProviderSettingsView }
  | { ok: false; error: ProviderOperationError };

export type ProviderTestResult =
  | {
      ok: true;
      provider: ProviderSettingsView;
      message: string;
      checkedAt: string;
    }
  | {
      ok: false;
      provider: ProviderSettingsView;
      message: string;
      checkedAt: string;
      errorKind: ProviderConnectionErrorKind;
      statusCode?: number;
    };

export type InstalledModelView = {
  definition: ModelDefinition;
  settings: InstalledModelSettings;
  unavailableReasons: Partial<Record<ModelPurpose, ModelUnavailabilityReason>>;
};

export type ModelsListInstalledResult = { models: InstalledModelView[] };

export type ModelsListUsableInput = { purpose: ModelPurpose };

export type UsableModelView = {
  key: ModelKey;
  label: string;
  provider: ProviderId;
  apiModel: string;
  contextWindow: number | null;
  thinkingDefault: boolean;
  capabilities: ModelDefinition["capabilities"];
  pricing?: ModelDefinition["pricing"];
};

export type ModelsListUsableResult = { models: UsableModelView[] };

export type ModelsCatalogListInput = {
  provider: Extract<ProviderId, "openrouter">;
  query?: string;
};

export type ModelsCatalogListResult = {
  provider: "openrouter";
  state: CatalogCacheState;
  fetchedAt?: string;
  stale: boolean;
  models: CatalogModelView[];
  skippedCount: number;
  error?: { code: string; message: string };
};

export type ModelsAddInput = {
  provider: Extract<ProviderId, "openrouter" | "duckcoding">;
  apiModel: string;
  label?: string;
  credentialId?: string | null;
  catalogModelId?: string | null;
  contextWindow?: number | null;
  maxTokens?: number | null;
};

export type ModelsUpdateInput = {
  modelKey: ModelKey;
  enabled?: boolean;
  customLabel?: string | null;
  credentialId?: string | null;
};

export type ModelsRemoveInput = { modelKey: ModelKey };

export type ModelMutationResult =
  | { ok: true; model?: InstalledModelView }
  | {
      ok: false;
      error: {
        code: "model_missing" | "model_in_use" | "model_not_removable" | "invalid_model" | "credential_missing" | "write_failed";
        message: string;
        references?: Array<"defaultChatModel" | "utilityModel" | "exploreModel" | "kairosModel">;
      };
    };

export type TaskModelsUpdateInput = Partial<TaskModelSettings>;
export type TaskModelsUpdateResult = { taskModels: TaskModelSettings };

export type KairosModelUpdateInput = { modelKey: ModelKey | null };
export type KairosModelUpdateResult = { modelKey: ModelKey | null };

export type SelectFilesResult = {
  canceled: boolean;
  attachments: import("./session").ComposerAttachment[];
};

export type SelectImagesResult = SelectFilesResult;

export type ImportComposerImageInput = {
  name: string;
  mimeType?: string;
  bytes: Uint8Array;
};

export type ImportComposerImageResult =
  | { ok: true; attachment: import("./session").ComposerAttachment }
  | {
      ok: false;
      error: {
        code: "empty" | "too_large" | "unsupported_format" | "decode_failed" | "write_failed";
        message: string;
      };
    };

export type SkillListInput = {
  workspaceRoot?: string;
};

export type SelectWorkspaceDirectoryResult = {
  canceled: boolean;
  workspaceRoot?: string;
};

export type AbortAgentRunInput = {
  sessionId: string;
  agentRunId: string;
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
  agentRunCount: number;
  /** workspace registry 的稳定 id；旧 session 可能缺失。 */
  workspaceId?: string;
  /** 创建会话时的工作区根目录；旧 session 缺这个字段时由前端视作 default workspace。 */
  workspaceRoot?: string;
  /** Worktree 会话的隔离执行上下文；普通会话缺省。 */
  worktree?: import("./session").SessionWorktreeContext;
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
  contextSnapshot?: import("./session").ContextUsageSnapshot | null;
};

export type SubAgentTranscriptGetInput = {
  transcriptRef: import("./session").SubAgentTranscriptRef;
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
  modelKey?: ModelKey;
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
 * 持久化的 context-state.json 只在每次 Agent Run 结束时写入，且为控制体积不保存逐条内容预览。
 * 该接口在 main 进程重新装配该会话的 ContextManager（一次性吃完 session.jsonl），
 * 重新算出 systemPrompt / tools / conversation 等 bucket 的预览，不调用 LLM。
 */
export type DescribeContextInput = {
  sessionId: string;
};

// ─── 顶部 Environment 与本地 Git 操作 ───

export type WorkspaceEnvironmentGetInput = {
  workspaceRoot?: string;
};

export type WorkspaceEnvironmentSnapshot = {
  workspaceRoot: string;
  workspaceLabel: string;
  locationKind: "this_mac" | "worktree";
  git: {
    available: boolean;
    repository: boolean;
    branch?: string;
    branches: GitBranchItem[];
    detached: boolean;
    hasHead: boolean;
    upstream?: string;
    remotes: string[];
  };
};

export type WorkspaceGitErrorCode =
  | "invalid_workspace"
  | "git_not_found"
  | "not_repository"
  | "detached_head"
  | "invalid_branch"
  | "branch_checked_out"
  | "nothing_to_commit"
  | "remote_required"
  | "no_remote"
  | "command_failed";

export type WorkspaceGitCreateBranchInput = {
  workspaceRoot?: string;
  branchName: string;
};

export type WorkspaceGitSwitchBranchInput = {
  workspaceRoot?: string;
  branchName: string;
};

export type WorkspaceGitCommitInput = {
  workspaceRoot?: string;
  message?: string;
  includeUnstagedChanges?: boolean;
  branchName?: string;
};

export type WorkspaceGitPushInput = {
  workspaceRoot?: string;
  remote?: string;
};

export type WorkspaceGitCommitAndPushInput = WorkspaceGitCommitInput & {
  remote?: string;
};

export type WorkspaceGitMutationResult = {
  ok: boolean;
  action: "create_branch" | "switch_branch" | "commit" | "push" | "commit_and_push";
  phase: "branch" | "commit" | "push";
  workspaceRoot: string;
  branch?: string;
  branchCreated?: boolean;
  commitCreated?: boolean;
  commitHash?: string;
  pushed?: boolean;
  remote?: string;
  upstreamSet?: boolean;
  remotes?: string[];
  error?: WorkspaceGitErrorCode;
  message?: string;
};

export type WorkspaceOpenToolId = "vscode" | "cursor" | "finder" | "terminal" | "iterm2";

export type WorkspaceOpenTool = {
  id: WorkspaceOpenToolId;
  label: string;
  available: boolean;
  iconDataUrl?: string;
};

export type WorkspaceOpenToolsResult = {
  tools: WorkspaceOpenTool[];
};

export type WorkspaceOpenInput = {
  workspaceRoot?: string;
  toolId: WorkspaceOpenToolId;
  /**
   * 要打开的目标（相对 workspaceRoot）；不传则打开根目录本身。
   *
   * 越界路径按 `escapes_root` 拒绝——这个入口来自右侧面板的可点 UI，
   * 和文件浏览器同一条边界，不能因为「只是调用 /usr/bin/open」就放开整盘。
   */
  relativePath?: string;
};

export type WorkspaceOpenResult = {
  ok: boolean;
  workspaceRoot: string;
  toolId: WorkspaceOpenToolId;
  /** 回显实际打开的相对路径；打开根目录时为 undefined。 */
  relativePath?: string;
  error?: "invalid_workspace" | "unsupported_platform" | "not_installed" | "open_failed" | "escapes_root";
  message?: string;
};

// ─── 工作区文件浏览器（见 `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`）───

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

export type WorkspaceFileRenderKind = "markdown" | "html" | "image" | "csv" | "text";

/**
 * 文本预览的字节上限：超过就只返回上限内的完整行并置 `truncated`。
 *
 * 放在契约层是因为两侧都要用同一个数：main 用它决定读多少，renderer 要在提示条里
 * 复述「仅显示前 X」。各留一份的话，改了 main 的上限就会让提示文案说谎。
 */
export const WORKSPACE_TEXT_PREVIEW_LIMIT_BYTES = 2 * 1024 * 1024;

export type WorkspaceReadFileResult = {
  relativePath: string;
  renderKind: WorkspaceFileRenderKind;
  /** text / markdown / html / csv：UTF-8 文本；image：空。 */
  content?: string;
  /** image：data URL（base64）；其余空。 */
  dataUrl?: string;
  /** text 类的语法高亮语言（highlight.js 语言 id，按 basename 与扩展名推断）；无法识别 / 二进制时缺省，渲染回退纯等宽。 */
  language?: string;
  /** 文件字节数（磁盘上的完整大小，不因截断而变小）。 */
  size: number;
  /**
   * 文本超过大小上限，`content` 只含上限内的完整行。
   * 消费方必须显式告知用户内容不完整，不能当完整文件对待。
   */
  truncated?: boolean;
  /** 最后修改时间（epoch 毫秒），供右侧面板判断已打开的 Tab 是否过期；错误分支为 0。 */
  mtimeMs: number;
  error?: "not_found" | "not_a_file" | "too_large" | "binary" | "escapes_root";
};

/**
 * 只取文件的大小与 mtime，不读内容。
 * 右侧面板用它在「Tab 激活 / 窗口重获焦点 / turn 结束」三个时机做 O(1) 新鲜度重校验，
 * 不做轮询；详见 `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`。
 */
export type WorkspaceStatFileInput = {
  workspaceRoot?: string;
  relativePath: string;
};

export type WorkspaceStatFileResult = {
  relativePath: string;
  size: number;
  mtimeMs: number;
  error?: "not_found" | "not_a_file" | "escapes_root";
};

/** 读取当前会话内由工具生成的图片产物。renderer 不能直接加载 file://。 */
export type SessionArtifactReadInput = {
  sessionId: string;
  artifactPath: string;
};

export type SessionArtifactReadResult = {
  name: string;
  relativePath: string;
  mimeType?: "image/png" | "image/jpeg" | "image/webp";
  size: number;
  dataUrl?: string;
  error?:
    | "invalid_session"
    | "escapes_root"
    | "not_found"
    | "not_a_file"
    | "too_large"
    | "unsupported_format"
    | "read_failed";
};

/** 在桌面端为受控 Artifact 打开原生右键菜单。路径必须由 main 重新解析。 */
export type ArtifactContextMenuInput =
  | {
      kind: "session_image";
      sessionId: string;
      artifactPath: string;
    }
  | {
      kind: "workspace_file";
      workspaceRoot?: string;
      relativePath: string;
    };

export type ArtifactContextMenuResult = {
  shown: boolean;
  error?: "invalid_target" | "not_found" | "not_a_file";
};

export type WorkspaceEntryKind = "default" | "folder";

export type WorkspaceEntry = {
  id: string;
  kind: WorkspaceEntryKind;
  label: string;
  path: string;
  hidden?: boolean;
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

export type WorkspaceIdInput = {
  workspaceId: string;
};

export type WorkspaceOpenInIdeResult = {
  ok: boolean;
  error?: "workspace_not_found" | "workspace_hidden" | "directory_not_found" | "open_failed";
};

export type WorkspaceVisibilityInput = WorkspaceIdInput & {
  hidden: boolean;
};

export type WorkspaceVisibilityResult = {
  ok: boolean;
  error?: "workspace_not_found" | "default_workspace_required";
};

export type SessionCreateInput = {
  title?: string;
  /** workspace registry 的稳定 id；与 workspaceRoot 一起写入 session meta。 */
  workspaceId?: string;
  /** 创建时指定 workspace 根目录；不传由主进程从 BootstrapState 自动注入。 */
  workspaceRoot?: string;
};

export type SessionForkInput = {
  sessionId: string;
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

export type SessionArchiveManyInput = {
  sessionIds: string[];
};

export type SessionArchiveManyResult = {
  ok: boolean;
  archivedSessionIds: string[];
  failedSessionIds: string[];
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
  /** 底部会话明细表分页；默认第一页，每页 10 条。 */
  requestRowsPage?: UsageStatisticsRequestRowsPageInput;
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

export type UsageStatisticsRequestRow = {
  /** Latest llm_usage timestamp in this Agent Run. */
  timestamp: string;
  sessionId: string;
  agentRunId: string;
  workspaceId?: string;
  workspaceRoot?: string;
  /** Primary model in this Agent Run, chosen by largest token share. */
  model: string;
  /** 旧 usage 兼容字段。 */
  modelId?: string;
  /** 新 usage 的 provider-qualified 模型身份。 */
  modelKey?: ModelKey;
  provider?: string;
  /** Number of llm_usage calls folded into this turn row. */
  modelCallCount: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  reasoningTokens: number;
  costUsd: number;
};

export type UsageStatisticsRequestRowsPageInput = {
  page?: number;
};

export type UsageStatisticsRequestRowsPage = {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
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
  /** 当前页会话明细。完整账本仍参与 summary / distribution / daily 聚合。 */
  requestRows: UsageStatisticsRequestRow[];
  requestRowsPage: UsageStatisticsRequestRowsPage;
};

export type ProviderBalanceDisplay = {
  amount: string;
  currency: string;
};

/** 余额 / 额度可读取的供应商。 */
export type BalanceProviderId = Extract<ProviderId, "deepseek" | "kimi" | "openrouter">;

export type ProviderBalanceGetInput = {
  provider: BalanceProviderId;
};

/** 通用供应商余额快照；按 provider 区分来源，UI 每个 provider 渲染一张卡。 */
export type ProviderBalanceSnapshot = {
  provider: BalanceProviderId;
  isConfigured: boolean;
  isAvailable: boolean | null;
  generatedAt: string;
  displayBalance: ProviderBalanceDisplay | null;
};

/** @deprecated 用 ProviderBalanceDisplay；保留别名向后兼容。 */
export type DeepSeekBalanceDisplay = ProviderBalanceDisplay;

/** DeepSeek 余额快照（ProviderBalanceSnapshot 的 deepseek 特化）。 */
export type DeepSeekBalanceSnapshot = ProviderBalanceSnapshot & { provider: "deepseek" };

/** Kimi（Moonshot）余额快照（ProviderBalanceSnapshot 的 kimi 特化）。 */
export type KimiBalanceSnapshot = ProviderBalanceSnapshot & { provider: "kimi" };

/** OpenRouter 账户 credits 余额快照（使用独立 Management Key 查询）。 */
export type OpenRouterBalanceSnapshot = ProviderBalanceSnapshot & { provider: "openrouter" };

export type LocalUpdateErrorCode =
  | "invalid_source"
  | "not_packaged"
  | "not_macos"
  | "not_writable"
  | "missing_source"
  | "already_running"
  | "spawn_failed";

export type LocalUpdateProgressPhase =
  | "idle"
  | "starting"
  | "building"
  | "ready_to_replace"
  | "waiting_for_exit"
  | "replacing"
  | "succeeded"
  | "failed";

export type LocalUpdateProgress = {
  phase: LocalUpdateProgressPhase;
  message: string;
  startedAt?: string;
  updatedAt?: string;
  finishedAt?: string;
};

export type LocalUpdateState = {
  sourceRoot: string | null;
  sourceValid: boolean;
  sourceError?: LocalUpdateErrorCode;
  appExecutablePath?: string;
  appIsPackaged?: boolean;
  appPath: string | null;
  installParent: string | null;
  canUpdate: boolean;
  reason?: string;
  logPath: string;
  running: boolean;
  lastStartedAt?: string;
  progress: LocalUpdateProgress;
};

export type AppShutdownNotice = {
  reason: "normal" | "local_update";
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
