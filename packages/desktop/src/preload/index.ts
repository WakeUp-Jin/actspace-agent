import { contextBridge, ipcRenderer, webFrame, webUtils } from "electron";
import type {
  AbortTurnInput,
  AgentSystemPromptFile,
  AgentTurnResult,
  AppSettings,
  ApprovalDecideInput,
  ApprovalDecideResult,
  ApprovalListPendingInput,
  BrowserBridgeActionResult,
  BrowserBridgeInstallResult,
  BrowserBridgeStatus,
  BootstrapState,
  ClearProviderKeyInput,
  ClearProviderKeyResult,
  CompactContextInput,
  CompactContextResult,
  ContextState,
  DeepSeekBalanceSnapshot,
  KimiBalanceSnapshot,
  ProviderBalanceGetInput,
  ProviderBalanceSnapshot,
  ProviderCredentialAddInput,
  ProviderCredentialUpdateInput,
  ProviderCredentialInput,
  ProviderCredentialOperationResult,
  AppShutdownNotice,
  DescribeContextInput,
  FsWatchActionResult,
  FsWatchConfigUpdateInput,
  FsWatchConfigView,
  FsWatchInstallResult,
  FsWatchPickRootResult,
  FsWatchSetEnabledInput,
  FsWatchStatus,
  GenerateEvalCandidateInput,
  GenerateEvalCandidateResult,
  SkillInstallResult,
  SkillListResult,
  SkillUninstallInput,
  SkillUninstallResult,
  KairosBriefDeleteRequest,
  KairosBriefDeleteResponse,
  KairosBriefReadRequest,
  KairosBriefReadResponse,
  KairosBriefWriteRequest,
  KairosBriefWriteResponse,
  KairosBriefsListResponse,
  KairosBridgeApi,
  KairosContextSnapshot,
  KairosControl,
  KairosControlResponse,
  KairosGetEventsRecentRequest,
  KairosGetEventsRecentResponse,
  KairosNotification,
  KairosNotificationsListResponse,
  KairosNotificationsMarkReadRequest,
  KairosNotificationsMarkReadResponse,
  KairosNotificationsRemoveRequest,
  KairosNotificationsRemoveResponse,
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
  SessionForkInput,
  SessionEvent,
  SessionGetInput,
  SessionListInput,
  UpdateImageGenerationSettingsInput,
  UpdateImageGenerationSettingsResult,
  SessionListItem,
  SessionPinInput,
  SessionPinResult,
  SessionPreviewInput,
  SessionPreviewResult,
  SessionRenameInput,
  SessionRenameResult,
  SessionWorkspaceInput,
  SessionWorkspaceResult,
  ArtifactContextMenuInput,
  ArtifactContextMenuResult,
  SessionArtifactReadInput,
  SessionArtifactReadResult,
  SessionRecord,
  SearchUsageResult,
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
  WriteAgentSystemPromptInput,
  ProviderConnectInput,
  ProviderUpdateInput,
  ProviderIdInput,
  ProviderOperationResult,
  ProviderTestResult,
  ProvidersListResult,
  ModelsListInstalledResult,
  ModelsListUsableInput,
  ModelsListUsableResult,
  ModelsCatalogListInput,
  ModelsCatalogListResult,
  ModelsAddInput,
  ModelsUpdateInput,
  ModelsRemoveInput,
  ModelMutationResult,
  TaskModelsUpdateInput,
  TaskModelsUpdateResult,
  KairosModelUpdateInput,
  KairosModelUpdateResult,
} from "@actspace/shared";

contextBridge.exposeInMainWorld("actspace", {
  getBootstrapState: () => ipcRenderer.invoke("app:get-bootstrap-state") as Promise<BootstrapState>,
  runTurn: (input: RunTurnInput) => ipcRenderer.invoke("agent:run-turn", input) as Promise<AgentTurnResult>,
  compactContext: (input: CompactContextInput) =>
    ipcRenderer.invoke("context:compact", input) as Promise<CompactContextResult>,
  generateEvalCandidate: (input: GenerateEvalCandidateInput) =>
    ipcRenderer.invoke("eval:generate-candidate", input) as Promise<GenerateEvalCandidateResult>,
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
  readSessionArtifact: (input: SessionArtifactReadInput) =>
    ipcRenderer.invoke("session:read-artifact", input) as Promise<SessionArtifactReadResult>,
  showArtifactContextMenu: (input: ArtifactContextMenuInput) =>
    ipcRenderer.invoke("artifact:show-context-menu", input) as Promise<ArtifactContextMenuResult>,
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
  getKimiBalance: () =>
    ipcRenderer.invoke("kimi:balance:get") as Promise<KimiBalanceSnapshot>,
  getProviderBalance: (input: ProviderBalanceGetInput) =>
    ipcRenderer.invoke("provider:balance:get", input) as Promise<ProviderBalanceSnapshot>,
  createSession: (input?: SessionCreateInput) => ipcRenderer.invoke("session:create", input ?? {}) as Promise<SessionRecord>,
  forkSession: (input: SessionForkInput) => ipcRenderer.invoke("session:fork", input) as Promise<SessionRecord>,
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
  updateImageGeneration: (input: UpdateImageGenerationSettingsInput) =>
    ipcRenderer.invoke("settings:update-image-generation", input) as Promise<UpdateImageGenerationSettingsResult>,
  testProviderConnection: (input: TestConnectionInput) =>
    ipcRenderer.invoke("settings:test-connection", input) as Promise<TestConnectionResult>,
  getSearchUsage: () =>
    ipcRenderer.invoke("settings:search-usage") as Promise<SearchUsageResult>,
  listProviders: () => ipcRenderer.invoke("providers:list") as Promise<ProvidersListResult>,
  connectProvider: (input: ProviderConnectInput) => ipcRenderer.invoke("providers:connect", input) as Promise<ProviderOperationResult>,
  updateProvider: (input: ProviderUpdateInput) => ipcRenderer.invoke("providers:update", input) as Promise<ProviderOperationResult>,
  testProvider: (input: ProviderIdInput) => ipcRenderer.invoke("providers:test", input) as Promise<ProviderTestResult>,
  disconnectProvider: (input: ProviderIdInput) => ipcRenderer.invoke("providers:disconnect", input) as Promise<ProviderOperationResult>,
  addProviderCredential: (input: ProviderCredentialAddInput) => ipcRenderer.invoke("provider-credentials:add", input) as Promise<ProviderCredentialOperationResult>,
  updateProviderCredential: (input: ProviderCredentialUpdateInput) => ipcRenderer.invoke("provider-credentials:update", input) as Promise<ProviderCredentialOperationResult>,
  testProviderCredential: (input: ProviderCredentialInput) => ipcRenderer.invoke("provider-credentials:test", input) as Promise<ProviderCredentialOperationResult>,
  removeProviderCredential: (input: ProviderCredentialInput) => ipcRenderer.invoke("provider-credentials:remove", input) as Promise<ProviderCredentialOperationResult>,
  listInstalledModels: () => ipcRenderer.invoke("models:list-installed") as Promise<ModelsListInstalledResult>,
  listUsableModels: (input: ModelsListUsableInput) => ipcRenderer.invoke("models:list-usable", input) as Promise<ModelsListUsableResult>,
  listModelCatalog: (input: ModelsCatalogListInput) => ipcRenderer.invoke("models:catalog:list", input) as Promise<ModelsCatalogListResult>,
  reloadModelCatalog: (input: ModelsCatalogListInput) => ipcRenderer.invoke("models:catalog:reload", input) as Promise<ModelsCatalogListResult>,
  addModel: (input: ModelsAddInput) => ipcRenderer.invoke("models:add", input) as Promise<ModelMutationResult>,
  updateModel: (input: ModelsUpdateInput) => ipcRenderer.invoke("models:update", input) as Promise<ModelMutationResult>,
  removeModel: (input: ModelsRemoveInput) => ipcRenderer.invoke("models:remove", input) as Promise<ModelMutationResult>,
  updateTaskModels: (input: TaskModelsUpdateInput) => ipcRenderer.invoke("task-models:update", input) as Promise<TaskModelsUpdateResult>,
  updateKairosModel: (input: KairosModelUpdateInput) => ipcRenderer.invoke("kairos-model:update", input) as Promise<KairosModelUpdateResult>,
  getFsWatchStatus: () =>
    ipcRenderer.invoke("plugins:fs-watch:get-status") as Promise<FsWatchStatus>,
  installFsWatchPlugin: () =>
    ipcRenderer.invoke("plugins:fs-watch:install") as Promise<FsWatchInstallResult>,
  installFsWatchFromRepo: () =>
    ipcRenderer.invoke("plugins:fs-watch:install-from-repo") as Promise<FsWatchInstallResult>,
  pickPluginsRepoRoot: () =>
    ipcRenderer.invoke("plugins:pick-repo-root") as Promise<FsWatchPickRootResult>,
  setFsWatchEnabled: (input: FsWatchSetEnabledInput) =>
    ipcRenderer.invoke("plugins:fs-watch:set-enabled", input) as Promise<FsWatchActionResult>,
  retryFsWatch: () =>
    ipcRenderer.invoke("plugins:fs-watch:retry") as Promise<FsWatchActionResult>,
  getFsWatchConfig: () =>
    ipcRenderer.invoke("plugins:fs-watch:get-config") as Promise<FsWatchConfigView>,
  updateFsWatchConfig: (input: FsWatchConfigUpdateInput) =>
    ipcRenderer.invoke("plugins:fs-watch:update-config", input) as Promise<FsWatchConfigView>,
  pickFsWatchRoot: () =>
    ipcRenderer.invoke("plugins:fs-watch:pick-root") as Promise<FsWatchPickRootResult>,
  getBrowserBridgeStatus: () =>
    ipcRenderer.invoke("plugins:browser-bridge:get-status") as Promise<BrowserBridgeStatus>,
  installBrowserBridgeFromRepo: () =>
    ipcRenderer.invoke("plugins:browser-bridge:install-from-repo") as Promise<BrowserBridgeInstallResult>,
  installBrowserBridgeNativeHost: () =>
    ipcRenderer.invoke("plugins:browser-bridge:install-native-host") as Promise<BrowserBridgeActionResult>,
  listSkills: () => ipcRenderer.invoke("skills:list") as Promise<SkillListResult>,
  installSkill: () => ipcRenderer.invoke("skills:install") as Promise<SkillInstallResult>,
  uninstallSkill: (input: SkillUninstallInput) =>
    ipcRenderer.invoke("skills:uninstall", input) as Promise<SkillUninstallResult>,
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
  onShuttingDown: (callback: (notice: AppShutdownNotice) => void) => {
    const handler = (_: unknown, notice?: AppShutdownNotice) => callback(notice ?? { reason: "normal" });
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
  briefsList: () =>
    ipcRenderer.invoke("kairos:briefs-list") as Promise<KairosBriefsListResponse>,
  briefsRead: (req: KairosBriefReadRequest) =>
    ipcRenderer.invoke("kairos:briefs-read", req) as Promise<KairosBriefReadResponse>,
  briefsWrite: (req: KairosBriefWriteRequest) =>
    ipcRenderer.invoke("kairos:briefs-write", req) as Promise<KairosBriefWriteResponse>,
  briefsDelete: (req: KairosBriefDeleteRequest) =>
    ipcRenderer.invoke("kairos:briefs-delete", req) as Promise<KairosBriefDeleteResponse>,
  notificationsList: () =>
    ipcRenderer.invoke("kairos:notifications-list") as Promise<KairosNotificationsListResponse>,
  notificationsMarkRead: (req: KairosNotificationsMarkReadRequest) =>
    ipcRenderer.invoke("kairos:notifications-mark-read", req) as Promise<KairosNotificationsMarkReadResponse>,
  notificationsRemove: (req: KairosNotificationsRemoveRequest) =>
    ipcRenderer.invoke("kairos:notifications-remove", req) as Promise<KairosNotificationsRemoveResponse>,
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
  onNotification: (listener: (notification: KairosNotification) => void) => {
    const handler = (_: unknown, notification: KairosNotification) => listener(notification);
    ipcRenderer.on("kairos:notification", handler);
    return () => {
      ipcRenderer.removeListener("kairos:notification", handler);
    };
  },
};

contextBridge.exposeInMainWorld("kairos", kairosBridge);
