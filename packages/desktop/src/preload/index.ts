import { contextBridge, ipcRenderer, webFrame, webUtils } from "electron";
import type {
  AbortTurnInput,
  AgentSystemPromptFile,
  AgentTurnResult,
  AppSettings,
  ApprovalDecideInput,
  ApprovalDecideResult,
  ApprovalListPendingInput,
  BootstrapState,
  ClearProviderKeyInput,
  ClearProviderKeyResult,
  CompactContextInput,
  CompactContextResult,
  ContextState,
  DeepSeekBalanceSnapshot,
  DescribeContextInput,
  KairosBridgeApi,
  KairosContextSnapshot,
  KairosControl,
  KairosControlResponse,
  KairosGetEventsRecentRequest,
  KairosGetEventsRecentResponse,
  KairosReadConfigRequest,
  KairosReadConfigResponse,
  KairosRuntimeState,
  KairosWriteConfigRequest,
  KairosWriteConfigResponse,
  LocalUpdateSelectSourceResult,
  LocalUpdateStartResult,
  LocalUpdateState,
  PendingApprovalInfo,
  ReviewGetWorkspaceChangesInput,
  ReviewGetWorkspaceChangesResult,
  ReviewInitGitInput,
  ReviewInitGitResult,
  RunTurnInput,
  RuntimeStreamEvent,
  SelectFilesResult,
  SelectWorkspaceDirectoryResult,
  SessionArchiveInput,
  SessionArchiveResult,
  SessionCreateInput,
  SessionEvent,
  SessionGetInput,
  SessionListInput,
  SessionListItem,
  SessionPinInput,
  SessionPinResult,
  SessionPreviewInput,
  SessionPreviewResult,
  SessionRenameInput,
  SessionRenameResult,
  SessionWorkspaceInput,
  SessionWorkspaceResult,
  SessionRecord,
  SetProviderKeyInput,
  SetProviderKeyResult,
  SettingsUpdateInput,
  SubAgentTranscriptGetInput,
  TestConnectionInput,
  TestConnectionResult,
  UsageStatisticsGetInput,
  UsageStatisticsSnapshot,
  ListVisualizationsInput,
  ListVisualizationsResult,
  VisualizeReplyInput,
  VisualizeReplyResult,
  WorkspaceListDirInput,
  WorkspaceListDirResult,
  WorkspaceListResult,
  WorkspaceReadFileInput,
  WorkspaceReadFileResult,
  WriteAgentSystemPromptInput
} from "@actspace/shared";

contextBridge.exposeInMainWorld("actspace", {
  getBootstrapState: () => ipcRenderer.invoke("app:get-bootstrap-state") as Promise<BootstrapState>,
  runTurn: (input: RunTurnInput) => ipcRenderer.invoke("agent:run-turn", input) as Promise<AgentTurnResult>,
  compactContext: (input: CompactContextInput) =>
    ipcRenderer.invoke("context:compact", input) as Promise<CompactContextResult>,
  abortTurn: (input: AbortTurnInput) => ipcRenderer.invoke("agent:abort-turn", input) as Promise<boolean>,
  selectFiles: () => ipcRenderer.invoke("dialog:select-files") as Promise<SelectFilesResult>,
  selectWorkspaceDirectory: () =>
    ipcRenderer.invoke("dialog:select-workspace-directory") as Promise<SelectWorkspaceDirectoryResult>,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  visualizeReply: (input: VisualizeReplyInput) =>
    ipcRenderer.invoke("visualize:convert-reply", input) as Promise<VisualizeReplyResult>,
  listVisualizations: (input: ListVisualizationsInput) =>
    ipcRenderer.invoke("visualize:list", input) as Promise<ListVisualizationsResult>,
  listWorkspaces: () => ipcRenderer.invoke("workspace:list") as Promise<WorkspaceListResult>,
  listWorkspaceDir: (input: WorkspaceListDirInput) =>
    ipcRenderer.invoke("workspace:list-dir", input) as Promise<WorkspaceListDirResult>,
  readWorkspaceFile: (input: WorkspaceReadFileInput) =>
    ipcRenderer.invoke("workspace:read-file", input) as Promise<WorkspaceReadFileResult>,
  getWorkspaceReview: (input: ReviewGetWorkspaceChangesInput) =>
    ipcRenderer.invoke("review:get-workspace-changes", input) as Promise<ReviewGetWorkspaceChangesResult>,
  initGitRepository: (input: ReviewInitGitInput) =>
    ipcRenderer.invoke("review:init-git", input) as Promise<ReviewInitGitResult>,
  describeContext: (input: DescribeContextInput) =>
    ipcRenderer.invoke("context:describe", input) as Promise<ContextState | null>,
  listSessions: (input?: SessionListInput) => ipcRenderer.invoke("session:list", input ?? {}) as Promise<SessionListItem[]>,
  getSession: (input: SessionGetInput) => ipcRenderer.invoke("session:get", input) as Promise<SessionRecord | null>,
  getSessionPreview: (input: SessionPreviewInput) =>
    ipcRenderer.invoke("session:get-preview", input) as Promise<SessionPreviewResult | null>,
  getSubAgentTranscript: (input: SubAgentTranscriptGetInput) =>
    ipcRenderer.invoke("subagent:get-transcript", input) as Promise<SessionEvent[]>,
  getUsageStatistics: (input: UsageStatisticsGetInput) =>
    ipcRenderer.invoke("usage-statistics:get", input) as Promise<UsageStatisticsSnapshot | null>,
  getDeepSeekBalance: () =>
    ipcRenderer.invoke("deepseek:balance:get") as Promise<DeepSeekBalanceSnapshot>,
  createSession: (input?: SessionCreateInput) => ipcRenderer.invoke("session:create", input ?? {}) as Promise<SessionRecord>,
  pinSession: (input: SessionPinInput) => ipcRenderer.invoke("session:pin", input) as Promise<SessionPinResult>,
  renameSession: (input: SessionRenameInput) =>
    ipcRenderer.invoke("session:rename", input) as Promise<SessionRenameResult>,
  setSessionWorkspace: (input: SessionWorkspaceInput) =>
    ipcRenderer.invoke("session:set-workspace", input) as Promise<SessionWorkspaceResult>,
  archiveSession: (input: SessionArchiveInput) =>
    ipcRenderer.invoke("session:archive", input) as Promise<SessionArchiveResult>,

  submitApproval: (input: ApprovalDecideInput) => ipcRenderer.invoke("approval:decide", input) as Promise<ApprovalDecideResult>,
  listPendingApprovals: (input?: ApprovalListPendingInput) => ipcRenderer.invoke("approval:list-pending", input ?? {}) as Promise<PendingApprovalInfo[]>,

  getSettings: () => ipcRenderer.invoke("settings:get") as Promise<AppSettings>,
  readAgentSystemPrompt: () =>
    ipcRenderer.invoke("settings:read-agent-system-prompt") as Promise<AgentSystemPromptFile>,
  writeAgentSystemPrompt: (input: WriteAgentSystemPromptInput) =>
    ipcRenderer.invoke("settings:write-agent-system-prompt", input) as Promise<AgentSystemPromptFile>,
  updateSettings: (input: SettingsUpdateInput) =>
    ipcRenderer.invoke("settings:update", input) as Promise<AppSettings>,
  setProviderKey: (input: SetProviderKeyInput) =>
    ipcRenderer.invoke("settings:set-provider-key", input) as Promise<SetProviderKeyResult>,
  clearProviderKey: (input: ClearProviderKeyInput) =>
    ipcRenderer.invoke("settings:clear-provider-key", input) as Promise<ClearProviderKeyResult>,
  testProviderConnection: (input: TestConnectionInput) =>
    ipcRenderer.invoke("settings:test-connection", input) as Promise<TestConnectionResult>,
  getLocalUpdateState: () =>
    ipcRenderer.invoke("local-update:get-state") as Promise<LocalUpdateState>,
  selectLocalUpdateSource: () =>
    ipcRenderer.invoke("local-update:select-source") as Promise<LocalUpdateSelectSourceResult>,
  startLocalUpdate: () =>
    ipcRenderer.invoke("local-update:start") as Promise<LocalUpdateStartResult>,

  // 整窗缩放：preload 直接调 webFrame，无需 IPC 往返。外观设置的「界面字号」用它实现。
  setUiZoom: (factor: number) => webFrame.setZoomFactor(factor),

  // 主题三态同步原生 chrome（main 设 nativeTheme.themeSource）。fire-and-forget。
  setNativeTheme: (mode: "light" | "dark" | "system") => ipcRenderer.send("appearance:set-theme", mode),

  onAgentStream: (callback: (event: RuntimeStreamEvent) => void) => {
    const handler = (_: unknown, event: RuntimeStreamEvent) => callback(event);
    ipcRenderer.on("agent:stream", handler);
    return () => {
      ipcRenderer.removeListener("agent:stream", handler);
    };
  },

  // 主进程开始优雅退出时通知 renderer 弹「Kairos 正在关闭」遮罩。无 payload。
  onShuttingDown: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("app:shutting-down", handler);
    return () => {
      ipcRenderer.removeListener("app:shutting-down", handler);
    };
  },
});

// ─── Kairos 桥接 ─────────────────────────────────────────────────────
// `window.kairos` API surface 与 `KairosBridgeApi` 接口逐字段对齐。

const kairosBridge: KairosBridgeApi = {
  getState: () => ipcRenderer.invoke("kairos:get-state") as Promise<KairosRuntimeState>,
  getEventsRecent: (req?: KairosGetEventsRecentRequest) =>
    ipcRenderer.invoke("kairos:get-events-recent", req ?? {}) as Promise<KairosGetEventsRecentResponse>,
  control: (ctrl: KairosControl) =>
    ipcRenderer.invoke("kairos:control", ctrl) as Promise<KairosControlResponse>,
  readConfig: (req: KairosReadConfigRequest) =>
    ipcRenderer.invoke("kairos:read-config", req) as Promise<KairosReadConfigResponse>,
  writeConfig: (req: KairosWriteConfigRequest) =>
    ipcRenderer.invoke("kairos:write-config", req) as Promise<KairosWriteConfigResponse>,
  getContextSnapshot: () =>
    ipcRenderer.invoke("kairos:get-context-snapshot") as Promise<KairosContextSnapshot>,
  onEvent: (listener: (event: SessionEvent) => void) => {
    const handler = (_: unknown, event: SessionEvent) => listener(event);
    ipcRenderer.on("kairos:event", handler);
    return () => {
      ipcRenderer.removeListener("kairos:event", handler);
    };
  },
  onState: (listener: (state: KairosRuntimeState) => void) => {
    const handler = (_: unknown, state: KairosRuntimeState) => listener(state);
    ipcRenderer.on("kairos:state", handler);
    return () => {
      ipcRenderer.removeListener("kairos:state", handler);
    };
  },
};

contextBridge.exposeInMainWorld("kairos", kairosBridge);
