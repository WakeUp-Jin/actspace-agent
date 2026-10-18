import type * as S from "../index";
import type * as RV2 from "../runtime-v2/index";
import type { RuntimeV2SessionSnapshot } from "../runtime-v2/projection";
import type { SessionEventEnvelopeV1 } from "../runtime-v2/session-events";
import type { AddHostInput, HostArtifactPreview, HostConnection, HostEvent, HostMethod, HostUploadProgress } from "../host-protocol/index";
import { ENGLISH_LEARNING_CHANNELS } from "../english-learning";
import { HOST_IPC } from "../host-protocol/connections";
import { PERFORMANCE_CHANNELS } from "../performance";
import { RUNTIME_V2_FIXED_RENDERER_CHANNELS as CH } from "../runtime-v2/fixed-renderer";
import { event, invoke, invokeWithDefault, local, send, type BridgeOf } from "./types";

/** `session:tool-detail` 的原始返回；renderer 自己投影成 MessageBlock。 */
export type DesktopToolDetailPage = {
  readonly snapshot: RuntimeV2SessionSnapshot;
  readonly journal: readonly SessionEventEnvelopeV1[];
};

/** DOM `File` 的最小结构；shared 不依赖 DOM lib。 */
export interface DesktopFileHandle {
  readonly name: string;
  readonly size: number;
}

export type HostArtifactRef = { hostId: string; sessionId: string; artifactId: string };
export type HostCallInput = { hostId: string; method: HostMethod; params: Readonly<Record<string, unknown>> };
export type HostEventEnvelope = { hostId: string; event: HostEvent };

/**
 * 渲染进程能用的全部能力。channel 只取现有常量，不新造。
 * preload 按它生成 `window.actspace`，main 按它注册 handler，`check:ipc-channels` 以它为准。
 */
export const desktopBridgeContract = {
  app: {
    getBootstrapState: invoke<void, S.BootstrapState>(CH.bootstrapState),
  },
  performance: {
    sample: invoke<void, S.DesktopPerformanceSnapshot>(PERFORMANCE_CHANNELS.sample),
    setActive: invoke<boolean, void>(PERFORMANCE_CHANNELS.active),
  },
  tasks: {
    command: invoke<RV2.TaskCommand, RV2.TaskCommandResult>(CH.taskCommand),
    submit: invoke<RV2.SubmitTaskInput, RV2.TaskSubmissionResult>(CH.submitTask),
    abort: invoke<S.AbortAgentRunInput, boolean>(CH.abortAgentRun),
  },
  approvals: {
    submit: invoke<S.ApprovalDecideInput, S.ApprovalDecideResult>(CH.submitApproval),
    listPending: invokeWithDefault<S.ApprovalListPendingInput, S.PendingApprovalInfo[]>(CH.listPendingApprovals, {}),
  },
  dialogs: {
    selectFiles: invoke<{ remote?: boolean } | undefined, S.SelectFilesResult>(CH.selectFiles),
    selectImages: invoke<void, S.SelectImagesResult>(CH.selectImages),
    selectWorkspaceDirectory: invoke<S.SelectWorkspaceDirectoryInput | undefined, S.SelectWorkspaceDirectoryResult>(CH.selectWorkspaceDirectory),
    importComposerImage: invoke<S.ImportComposerImageInput, S.ImportComposerImageResult>(CH.importComposerImage),
    showArtifactContextMenu: invoke<S.ArtifactContextMenuInput, S.ArtifactContextMenuResult>(CH.showArtifactContextMenu),
    getPathForFile: local<(file: DesktopFileHandle) => string>(),
  },
  visualize: {
    convertReply: invoke<S.VisualizeReplyInput, S.VisualizeReplyResult>(CH.visualizeReply),
    list: invoke<S.ListVisualizationsInput, S.ListVisualizationsResult>(CH.listVisualizations),
  },
  workspaces: {
    list: invoke<void, S.WorkspaceListResult>(CH.listWorkspaces),
    openInIde: invoke<S.WorkspaceIdInput, S.WorkspaceOpenInIdeResult>(CH.openWorkspaceInIde),
    setVisibility: invoke<S.WorkspaceVisibilityInput, S.WorkspaceVisibilityResult>(CH.setWorkspaceVisibility),
    getGitContext: invoke<S.WorkspaceGitContextInput, S.WorkspaceGitContext>(CH.getWorkspaceGitContext),
    createFolder: invoke<S.WorkspaceCreateFolderInput, S.WorkspaceCreateFolderResult>(CH.createWorkspaceFolder),
    listDir: invoke<S.WorkspaceListDirInput, S.WorkspaceListDirResult>(CH.listWorkspaceDir),
    readFile: invoke<S.WorkspaceReadFileInput, S.WorkspaceReadFileResult>(CH.readWorkspaceFile),
    statFile: invoke<S.WorkspaceStatFileInput, S.WorkspaceStatFileResult>(CH.statWorkspaceFile),
    listFileApplications: invoke<S.WorkspaceFileApplicationsInput, S.WorkspaceFileApplicationsResult>(CH.listWorkspaceFileApplications),
    openFile: invoke<S.WorkspaceOpenFileInput, S.WorkspaceOpenFileResult>(CH.openWorkspaceFile),
    getEnvironment: invoke<S.WorkspaceEnvironmentGetInput, S.WorkspaceEnvironmentSnapshot>(CH.getWorkspaceEnvironment),
    createBranch: invoke<S.WorkspaceGitCreateBranchInput, S.WorkspaceGitMutationResult>(CH.createWorkspaceBranch),
    switchBranch: invoke<S.WorkspaceGitSwitchBranchInput, S.WorkspaceGitMutationResult>(CH.switchWorkspaceBranch),
    commit: invoke<S.WorkspaceGitCommitInput, S.WorkspaceGitMutationResult>(CH.commitWorkspaceChanges),
    push: invoke<S.WorkspaceGitPushInput, S.WorkspaceGitMutationResult>(CH.pushWorkspaceBranch),
    commitAndPush: invoke<S.WorkspaceGitCommitAndPushInput, S.WorkspaceGitMutationResult>(CH.commitAndPushWorkspaceChanges),
    listOpenTools: invoke<void, S.WorkspaceOpenToolsResult>(CH.listWorkspaceOpenTools),
    openInTool: invoke<S.WorkspaceOpenInput, S.WorkspaceOpenResult>(CH.openWorkspaceInTool),
  },
  review: {
    initGit: invoke<S.ReviewInitGitInput, S.ReviewInitGitResult>(CH.initGitRepository),
    getSnapshot: invoke<S.ReviewGetSnapshotInput, S.ReviewGetSnapshotResult>(CH.getReviewSnapshot),
    refreshSnapshot: invoke<S.ReviewGetSnapshotInput, S.ReviewGetSnapshotResult>(CH.refreshReviewSnapshot),
    getFileDiffs: invoke<S.ReviewGetFileDiffsInput, S.ReviewGetFileDiffsResult>(CH.getReviewFileDiffs),
    getFileContents: invoke<S.ReviewGetFileContentsInput, S.ReviewGetFileContentsResult>(CH.getReviewFileContents),
    applyMutation: invoke<S.ReviewApplyMutationInput, S.ReviewMutationResult>(CH.applyReviewMutation),
    setFileViewed: invoke<S.ReviewSetFileViewedInput, S.ReviewSetFileViewedResult>(CH.setReviewFileViewed),
    listBranches: invoke<S.ReviewWorkspaceInput, S.ReviewListBranchesResult>(CH.listReviewBranches),
    listCommits: invoke<S.ReviewWorkspaceInput, S.ReviewListCommitsResult>(CH.listReviewCommits),
    copyGitApplyCommand: invoke<S.ReviewCopyApplyCommandInput, S.ReviewCopyApplyCommandResult>(CH.copyReviewGitApplyCommand),
    getPullRequestCapability: invoke<S.ReviewWorkspaceInput & { baseBranch?: string }, S.ReviewPullRequestCapabilityResult>(CH.getReviewPullRequestCapability),
    createPullRequest: invoke<S.ReviewCreatePullRequestInput, S.ReviewCreatePullRequestResult>(CH.createReviewPullRequest),
  },
  sessions: {
    listPage: invokeWithDefault<S.SessionListPageInput, S.SessionListPage>(CH.listSessionPage, {}),
    list: invokeWithDefault<S.SessionListInput, S.SessionListItem[]>(CH.listSessions, {}),
    /** 原始投影；`apps/desktop/src/renderer/api/sessions.ts` 负责 `projectChatWindow`。 */
    get: invoke<S.SessionGetInput, RV2.RuntimeV2DesktopSessionProjection | null>(CH.getSession),
    getPage: invoke<RV2.RuntimeV2SessionProjectionInput, RV2.RuntimeV2DesktopSessionProjection>(CH.getSessionPage),
    getProjectionSnapshot: invoke<RV2.RuntimeV2SessionProjectionInput, RV2.RuntimeV2DesktopSessionProjection>(CH.getSessionProjectionSnapshot),
    getObservation: invoke<RV2.RuntimeV2SessionProjectionInput, RV2.RuntimeV2SessionObservation>(CH.getSessionObservation),
    /** 原始页；`apps/desktop/src/renderer/api/sessions.ts` 负责投影成 MessageBlock。 */
    getToolDetail: invoke<{ sessionId: string; callId: string }, DesktopToolDetailPage>(CH.getSessionToolDetail),
    getPreview: invoke<S.SessionPreviewInput, S.SessionPreviewResult | null>(CH.getSessionPreview),
    getSubagents: invoke<{ sessionId: string }, S.MessageBlock[]>(CH.getSubagents),
    getSubAgentTranscript: invoke<S.SubAgentTranscriptGetInput, S.SessionEvent[]>(CH.getSubAgentTranscript),
    /** 原始投影；`apps/desktop/src/renderer/api/sessions.ts` 负责 `projectChatWindow`。 */
    create: invokeWithDefault<S.SessionCreateInput, RV2.RuntimeV2DesktopSessionProjection>(CH.createSession, {}),
    /** 原始投影；`apps/desktop/src/renderer/api/sessions.ts` 负责 `projectChatWindow`。 */
    fork: invoke<S.SessionForkInput, RV2.RuntimeV2DesktopSessionProjection>(CH.forkSession),
    pin: invoke<S.SessionPinInput, S.SessionPinResult>(CH.pinSession),
    rename: invoke<S.SessionRenameInput, S.SessionRenameResult>(CH.renameSession),
    setWorkspace: invoke<S.SessionWorkspaceInput, S.SessionWorkspaceResult>(CH.setSessionWorkspace),
    setPermissionMode: invoke<S.SessionPermissionModeInput, S.SessionPermissionModeResult>(CH.setSessionPermissionMode),
    setAgentMode: invoke<S.SessionAgentModeInput, S.SessionAgentModeResult>(CH.setSessionAgentMode),
    revokeGrant: invoke<S.SessionGrantRevokeInput, S.SessionGrantRevokeResult>(CH.revokeSessionGrant),
    archive: invoke<S.SessionArchiveInput, S.SessionArchiveResult>(CH.archiveSession),
    archiveMany: invoke<S.SessionArchiveManyInput, S.SessionArchiveManyResult>(CH.archiveSessions),
    describeContext: invoke<S.DescribeContextInput, S.ContextState | null>(CH.describeContext),
    /** 当前 Context 与异步历史摘要，支持条件读取和有界明细。 */
    describeContextPanel: invoke<S.DescribeContextPanelInput, S.ContextPanelResponse | null>(CH.describeContextPanel),
    listContextPaths: invoke<S.ContextPathsInput, S.ContextPathsPage>(CH.listContextPaths),
    listContextEntries: invoke<S.ContextEntriesInput, S.ContextEntriesPage>(CH.listContextEntries),
    readContextEntry: invoke<S.ContextEntryInput, S.ContextEntryText>(CH.readContextEntry),
    readArtifact: invoke<S.SessionArtifactReadInput, S.SessionArtifactReadResult>(CH.readSessionArtifact),
  },
  usage: {
    getStatus: invoke<{ requestId: string }, S.UsageQueryProgress | null>(CH.getUsageQueryStatus),
    cancel: invoke<{ requestId: string }, void>(CH.cancelUsageQuery),
    getStatistics: invoke<S.UsageStatisticsGetInput, S.UsageStatisticsSnapshot | null>(CH.getUsageStatistics),
    getActivity: invoke<S.UsageStatisticsGetInput, S.UsageActivitySnapshot | null>(CH.getUsageActivity),
  },
  terminal: {
    create: invoke<S.TerminalCreateInput, S.TerminalSessionResult>(CH.terminalCreate),
    list: invoke<S.TerminalListInput, S.TerminalListResult>(CH.terminalList),
    attach: invoke<S.TerminalAttachInput, S.TerminalSessionResult>(CH.terminalAttach),
    detach: invoke<S.TerminalDetachInput, S.TerminalOperationResult>(CH.terminalDetach),
    write: invoke<S.TerminalWriteInput, S.TerminalOperationResult>(CH.terminalWrite),
    resize: invoke<S.TerminalResizeInput, S.TerminalOperationResult>(CH.terminalResize),
    ack: invoke<S.TerminalAckInput, S.TerminalOperationResult>(CH.terminalAck),
    close: invoke<S.TerminalCloseInput, S.TerminalOperationResult>(CH.terminalClose),
  },
  settings: {
    get: invoke<void, S.AppSettings>(CH.getSettings),
    update: invoke<S.SettingsUpdateInput, S.AppSettings>(CH.updateSettings),
    getV4: invoke<void, S.SettingsV4Snapshot>(CH.getSettingsV4),
    updateV4: invoke<S.SettingsV4UpdateInput, S.SettingsV4UpdateResult>(CH.updateSettingsV4),
    readSystemPrompt: invoke<void, S.AgentSystemPromptFile>(CH.readAgentSystemPrompt),
    writeSystemPrompt: invoke<S.WriteAgentSystemPromptInput, S.AgentSystemPromptFile>(CH.writeAgentSystemPrompt),
    updateImageGeneration: invoke<S.UpdateImageGenerationSettingsInput, S.UpdateImageGenerationSettingsResult>(CH.updateImageGeneration),
    getSearchUsage: invoke<void, S.SearchUsageResult>(CH.getSearchUsage),
    createCustomConnection: invoke<S.CustomConnectionInput, S.SettingsV4Snapshot>(CH.createCustomConnection),
    removeCustomConnection: invoke<{ connectionId: string }, S.SettingsV4Snapshot>(CH.removeCustomConnection),
    updateCustomConnection: invoke<RV2.RuntimeV2UpdateCustomConnectionInput, S.SettingsV4Snapshot>(CH.updateCustomConnection),
    testCustomConnection: invoke<S.CustomConnectionTestInput, S.CustomConnectionTestResult>(CH.testCustomConnection),
    probeCustomConnection: invoke<S.CustomConnectionProbeInput, S.CustomConnectionProbeResult>(CH.probeCustomConnection),
  },
  quickOpen: {
    consume: invoke<void, S.QuickOpenRequest | null>(CH.quickOpenConsume),
    getShortcutStatus: invoke<void, S.QuickOpenShortcutStatus>(CH.quickOpenStatus),
    updateShortcut: invoke<S.QuickOpenShortcutUpdateInput, S.QuickOpenShortcutUpdateResult>(CH.quickOpenUpdate),
  },
  providers: {
    list: invoke<void, S.ProvidersListResult>(CH.listProviders),
    connect: invoke<S.ProviderConnectInput, S.ProviderOperationResult>(CH.connectProvider),
    update: invoke<S.ProviderUpdateInput, S.ProviderOperationResult>(CH.updateProvider),
    test: invoke<S.ProviderIdInput, S.ProviderTestResult>(CH.testProvider),
    disconnect: invoke<S.ProviderIdInput, S.ProviderOperationResult>(CH.disconnectProvider),
    remove: invoke<S.ProviderIdInput, S.ProviderOperationResult>(CH.removeProvider),
    addCredential: invoke<S.ProviderCredentialAddInput, S.ProviderCredentialOperationResult>(CH.addProviderCredential),
    updateCredential: invoke<S.ProviderCredentialUpdateInput, S.ProviderCredentialOperationResult>(CH.updateProviderCredential),
    testCredential: invoke<S.ProviderCredentialInput, S.ProviderCredentialOperationResult>(CH.testProviderCredential),
    removeCredential: invoke<S.ProviderCredentialInput, S.ProviderCredentialOperationResult>(CH.removeProviderCredential),
    setKey: invoke<S.SetProviderKeyInput, S.SetProviderKeyResult>(CH.setProviderKey),
    clearKey: invoke<S.ClearProviderKeyInput, S.ClearProviderKeyResult>(CH.clearProviderKey),
    testConnection: invoke<S.TestConnectionInput, S.TestConnectionResult>(CH.testProviderConnection),
    getBalance: invoke<S.ProviderBalanceGetInput, S.ProviderBalanceSnapshot>(CH.getProviderBalance),
    getDeepSeekBalance: invoke<void, S.DeepSeekBalanceSnapshot>(CH.getDeepSeekBalance),
    getKimiBalance: invoke<void, S.KimiBalanceSnapshot>(CH.getKimiBalance),
  },
  models: {
    listInstalled: invoke<void, S.ModelsListInstalledResult>(CH.listInstalledModels),
    listUsable: invoke<S.ModelsListUsableInput, S.ModelsListUsableResult>(CH.listUsableModels),
    getPricingCatalog: invoke<void, S.ModelCatalogStatus | null>(CH.getPricingCatalog),
    refreshPricingCatalog: invoke<{ force?: boolean } | undefined, S.ModelCatalogStatus | null>(CH.refreshPricingCatalog),
    listCatalog: invoke<S.ModelsCatalogListInput, S.ModelsCatalogListResult>(CH.listModelCatalog),
    reloadCatalog: invoke<S.ModelsCatalogListInput, S.ModelsCatalogListResult>(CH.reloadModelCatalog),
    add: invoke<S.ModelsAddInput, S.ModelMutationResult>(CH.addModel),
    addCustom: invoke<S.ModelsAddCustomInput, S.ModelMutationResult>(CH.addCustomModel),
    editCustom: invoke<S.ModelsEditCustomInput, S.ModelMutationResult>(CH.editCustomModel),
    setCustomConnectionDefault: invoke<S.ModelsSetCustomDefaultInput, S.ModelMutationResult>(CH.setCustomConnectionDefaultModel),
    update: invoke<S.ModelsUpdateInput, S.ModelMutationResult>(CH.updateModel),
    remove: invoke<S.ModelsRemoveInput, S.ModelMutationResult>(CH.removeModel),
    updateTaskModels: invoke<S.TaskModelsUpdateInput, S.TaskModelsUpdateResult>(CH.updateTaskModels),
  },
  englishLearning: {
    getState: invoke<void, S.EnglishLearningState>(ENGLISH_LEARNING_CHANNELS.getState),
    setTarget: invoke<S.EnglishLearningTargetInput, S.EnglishLearningState>(ENGLISH_LEARNING_CHANNELS.setTarget),
    stopSpeech: invoke<void, S.EnglishLearningState>(ENGLISH_LEARNING_CHANNELS.stop),
    previewSpeech: invoke<void, S.EnglishLearningState>(ENGLISH_LEARNING_CHANNELS.preview),
  },
  browserBridge: {
    getStatus: invoke<void, S.BrowserBridgeStatus>(CH.getBrowserBridgeStatus),
    connect: invoke<void, S.BrowserBridgeInstallResult>(CH.connectBrowserBridge),
    useSourceExtension: invoke<string | null, S.BrowserBridgeActionResult>(CH.useBrowserSourceExtension),
    prepareUpdate: invoke<void, S.BrowserBridgeInstallResult>(CH.prepareBrowserBridgeUpdate),
    disconnect: invoke<void, S.BrowserBridgeActionResult>(CH.disconnectBrowserBridge),
    selectInstance: invoke<string, S.BrowserBridgeActionResult>(CH.selectBrowserBridgeInstance),
    openExtensions: invoke<void, S.BrowserBridgeActionResult>(CH.openBrowserExtensions),
    revealExtensionDirectory: invoke<void, S.BrowserBridgeActionResult>(CH.revealBrowserExtensionDirectory),
    installFromRepo: invoke<{ repoRoot: string }, S.BrowserBridgeInstallResult>(CH.installBrowserBridgeFromRepo),
    installNativeHost: invoke<void, S.BrowserBridgeActionResult>(CH.installBrowserBridgeNativeHost),
  },
  skills: {
    list: invokeWithDefault<S.SkillListInput, S.SkillListResult>(CH.listSkills, {}),
    install: invoke<void, S.SkillInstallResult>(CH.installSkill),
    uninstall: invoke<S.SkillUninstallInput, S.SkillUninstallResult>(CH.uninstallSkill),
  },
  updates: {
    getState: invoke<void, S.LocalUpdateState>(CH.getLocalUpdateState),
    selectSource: invoke<void, S.LocalUpdateSelectSourceResult>(CH.selectLocalUpdateSource),
    start: invoke<void, S.LocalUpdateStartResult>(CH.startLocalUpdate),
  },
  appearance: {
    /** 整窗缩放：preload 直接调 webFrame，无需 IPC 往返。 */
    setUiZoom: local<(factor: number) => void>(),
    /** 主题三态同步原生 chrome（main 设 nativeTheme.themeSource）。 */
    setNativeTheme: send<"light" | "dark" | "system">(CH.setNativeTheme),
  },
  hosts: {
    list: invoke<void, HostConnection[]>(HOST_IPC.list),
    add: invoke<AddHostInput, HostConnection>(HOST_IPC.add),
    remove: invoke<string, void>(HOST_IPC.remove),
    reconnect: invoke<string, void>(HOST_IPC.reconnect),
    activate: invoke<string | null, void>(HOST_IPC.activate),
    call: invoke<HostCallInput, unknown>(HOST_IPC.call),
    preview: invoke<HostArtifactRef, HostArtifactPreview>(HOST_IPC.preview),
    download: invoke<HostArtifactRef, void>(HOST_IPC.download),
  },
  events: {
    agentStream: event<S.RuntimeStreamEvent>(CH.agentStream),
    sessionLive: event<RV2.RuntimeV2DesktopLiveEnvelope>(CH.sessionLiveEvent),
    terminal: event<S.TerminalEvent>(CH.terminalEvent),
    reviewChanged: event<S.ReviewChangeNotification>(CH.reviewChanged),
    settingsChanged: event<S.SettingsV4ChangedNotification>(CH.settingsChangedV4),
    quickOpenRequested: event<void>(CH.quickOpenRequested),
    englishLearningStateChanged: event<S.EnglishLearningState>(ENGLISH_LEARNING_CHANNELS.stateChanged),
    /** 主进程开始优雅退出；main 不带 payload 时按正常退出处理。 */
    shuttingDown: event<S.AppShutdownNotice>(CH.appShuttingDown, { reason: "normal" }),
    hostsChanged: event<HostConnection[]>(HOST_IPC.changed),
    hostEvent: event<HostEventEnvelope>(HOST_IPC.event),
    hostUploadProgress: event<HostUploadProgress>(HOST_IPC.uploadProgress),
  },
} as const;

export type DesktopBridgeContract = typeof desktopBridgeContract;
export type DesktopBridge = BridgeOf<DesktopBridgeContract>;
