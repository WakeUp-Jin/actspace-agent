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
    listBackground: invoke<RV2.BackgroundTaskListInput, readonly RV2.BackgroundBashTaskView[]>(CH.listBackgroundTasks),
    readBackgroundOutput: invoke<RV2.BackgroundTaskInput, RV2.BackgroundTaskOutputView>(CH.readBackgroundTaskOutput),
    stopBackground: invoke<RV2.BackgroundTaskInput, RV2.BackgroundBashTaskView>(CH.stopBackgroundTask),
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
  workspaces: {
    list: invoke<void, S.WorkspaceListResult>(CH.listWorkspaces),
    openInIde: invoke<S.WorkspaceIdInput, S.WorkspaceOpenInIdeResult>(CH.openWorkspaceInIde),
    setVisibility: invoke<S.WorkspaceVisibilityInput, S.WorkspaceVisibilityResult>(CH.setWorkspaceVisibility),
    getGitContext: invoke<S.WorkspaceGitContextInput, S.WorkspaceGitContext>(CH.getWorkspaceGitContext),
    createFolder: invoke<S.WorkspaceCreateFolderInput, S.WorkspaceCreateFolderResult>(CH.createWorkspaceFolder),
    listMarkdownFiles: invoke<S.WorkspaceListMarkdownFilesInput, S.WorkspaceListMarkdownFilesResult>(CH.listWorkspaceMarkdownFiles),
    readFile: invoke<S.WorkspaceReadFileInput, S.WorkspaceReadFileResult>(CH.readWorkspaceFile),
    statFile: invoke<S.WorkspaceStatFileInput, S.WorkspaceStatFileResult>(CH.statWorkspaceFile),
    writeMarkdownFile: invoke<S.WorkspaceWriteMarkdownFileInput, S.WorkspaceWriteMarkdownFileResult>(CH.writeWorkspaceMarkdownFile),
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
    getSnapshot: invoke<S.ReviewGetSnapshotInput, S.ReviewGetSnapshotResult>(CH.getReviewSnapshot),
    refreshSnapshot: invoke<S.ReviewGetSnapshotInput, S.ReviewGetSnapshotResult>(CH.refreshReviewSnapshot),
    getFileDiffs: invoke<S.ReviewGetFileDiffsInput, S.ReviewGetFileDiffsResult>(CH.getReviewFileDiffs),
    getFileContents: invoke<S.ReviewGetFileContentsInput, S.ReviewGetFileContentsResult>(CH.getReviewFileContents),
    listBranches: invoke<S.ReviewWorkspaceInput, S.ReviewListBranchesResult>(CH.listReviewBranches),
    listCommits: invoke<S.ReviewWorkspaceInput, S.ReviewListCommitsResult>(CH.listReviewCommits),
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
    /** 右侧子 Agent 面板的列表：每个子智能体一行（跨所有激活），由父 Journal 折叠。 */
    getSubagents: invoke<{ sessionId: string }, S.SubagentListItem[]>(CH.getSubagents),
    getSubAgentTranscript: invoke<S.SubAgentTranscriptGetInput, S.SessionEvent[]>(CH.getSubAgentTranscript),
    /**
     * 恢复运行的起点：主进程实时底稿里还没定稿的正文与思考（先冲刷实时通道再读）。
     * 远程会话返回 null：远程适配器在 `agent_run_started(recoveredReset)` 之后自己推 `live_output_baseline`。
     */
    liveOutput: invoke<{ sessionId: string }, RV2.LiveOutputBaseline | null>(CH.getSessionLiveOutput),
    /** 子 Agent 面板的「停止」：效果同主会话调用 `interrupt_agent`；message 是给模型看的同一句话。 */
    interruptSubagent: invoke<{ sessionId: string; agentId: string }, { ok: boolean; message: string }>(CH.interruptSubagent),
    /** 外部子智能体详情的「在 Finder 中显示」：路径由主进程从父 Journal 的 `subagent/spawned` 取，renderer 不传路径。 */
    revealSubagentRecord: invoke<{ sessionId: string; agentId: string }, { ok: boolean }>(CH.revealSubagentRecord),
    /** 原始投影；`apps/desktop/src/renderer/api/sessions.ts` 负责 `projectChatWindow`。 */
    create: invokeWithDefault<S.SessionCreateInput, RV2.RuntimeV2DesktopSessionProjection>(CH.createSession, {}),
    /** 原始投影；`apps/desktop/src/renderer/api/sessions.ts` 负责 `projectChatWindow`。 */
    fork: invoke<S.SessionForkInput, RV2.RuntimeV2DesktopSessionProjection>(CH.forkSession),
    /** 侧边对话：分出与按主会话列出（含已收起的）。 */
    openSideChat: invoke<S.SideChatOpenInput, S.SideChatOpenResult>(CH.openSideChat),
    listSideChats: invoke<S.SideChatListInput, S.SessionListItem[]>(CH.listSideChats),
    pin: invoke<S.SessionPinInput, S.SessionPinResult>(CH.pinSession),
    rename: invoke<S.SessionRenameInput, S.SessionRenameResult>(CH.renameSession),
    setWorkspace: invoke<S.SessionWorkspaceInput, S.SessionWorkspaceResult>(CH.setSessionWorkspace),
    setPermissionMode: invoke<S.SessionPermissionModeInput, S.SessionPermissionModeResult>(CH.setSessionPermissionMode),
    setAgentMode: invoke<S.SessionAgentModeInput, S.SessionAgentModeResult>(CH.setSessionAgentMode),
    archive: invoke<S.SessionArchiveInput, S.SessionArchiveResult>(CH.archiveSession),
    archiveMany: invoke<S.SessionArchiveManyInput, S.SessionArchiveManyResult>(CH.archiveSessions),
    /**
     * 渲染进程当前选中/订阅的会话 id 全集（每次变化整体替换）。主进程据此保护这些会话不被空闲回收；
     * 不在其中且已空闲的会话按 LRU 最多保留 3 个，其余释放（重新打开时 resume）。
     */
    setObserved: send<readonly string[]>(CH.setObservedSessions),
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
    getActivity: invoke<S.UsageStatisticsGetInput, S.UsageActivitySnapshot | null>(CH.getUsageActivity),
  },
  /** 设置 →「Harness 统计」：按 tab 按需查询；同步在后台进行，进度见 getStatus。 */
  harnessStats: {
    query: invoke<S.HarnessStatsQueryInput, S.HarnessStatsQueryResult | null>(CH.queryHarnessStats),
    getStatus: invoke<void, S.HarnessStatsSyncStatus | null>(CH.getHarnessStatsStatus),
    cancel: invoke<{ requestId: string }, void>(CH.cancelHarnessStats),
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
  },
  quickOpen: {
    consume: invoke<void, S.QuickOpenRequest | null>(CH.quickOpenConsume),
    getShortcutStatus: invoke<void, S.QuickOpenShortcutStatus>(CH.quickOpenStatus),
    updateShortcut: invoke<S.QuickOpenShortcutUpdateInput, S.QuickOpenShortcutUpdateResult>(CH.quickOpenUpdate),
  },
  providers: {
    setKey: invoke<S.SetProviderKeyInput, S.SetProviderKeyResult>(CH.setProviderKey),
    clearKey: invoke<S.ClearProviderKeyInput, S.ClearProviderKeyResult>(CH.clearProviderKey),
  },
  models: {
    listUsable: invoke<S.ModelsListUsableInput, S.ModelsListUsableResult>(CH.listUsableModels),
  },
  /** 设置 › 模型：连接、连接下的模型、用途表。每个修改都返回整份视图。 */
  modelConnections: {
    list: invoke<void, S.ModelConnectionsView>(CH.listModelConnections),
    probe: invoke<S.ConnectionProbeInput, S.ConnectionProbeResult>(CH.probeModelConnection),
    create: invoke<S.ConnectionCreateInput, S.ModelConnectionsResult>(CH.createModelConnection),
    update: invoke<S.ConnectionUpdateInput, S.ModelConnectionsResult>(CH.updateModelConnection),
    remove: invoke<S.ConnectionIdInput, S.ModelConnectionsResult>(CH.removeModelConnection),
    addModels: invoke<S.ConnectionModelsAddInput, S.ModelConnectionsResult>(CH.addConnectionModels),
    updateModel: invoke<S.ConnectionModelPatch, S.ModelConnectionsResult>(CH.updateConnectionModel),
    removeModel: invoke<S.ModelKeyInput, S.ModelConnectionsResult>(CH.removeConnectionModel),
    preview: invoke<S.ModelPreviewInput, S.ModelPreviewResult>(CH.previewConnectionModel),
    updatePurposes: invoke<S.PurposesUpdateInput, S.ModelConnectionsResult>(CH.updateModelPurposes),
    getBalance: invoke<S.ConnectionIdInput, S.ProviderBalanceSnapshot>(CH.getConnectionBalance),
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
    /** main 弹系统目录对话框并校验；renderer 不传路径。 */
    selectSourceExtension: invoke<void, S.BrowserBridgeActionResult>(CH.selectBrowserSourceExtension),
    switchToBundledExtension: invoke<void, S.BrowserBridgeActionResult>(CH.useBundledBrowserExtension),
    prepareUpdate: invoke<void, S.BrowserBridgeInstallResult>(CH.prepareBrowserBridgeUpdate),
    disconnect: invoke<void, S.BrowserBridgeActionResult>(CH.disconnectBrowserBridge),
    selectInstance: invoke<string, S.BrowserBridgeActionResult>(CH.selectBrowserBridgeInstance),
    openExtensions: invoke<void, S.BrowserBridgeActionResult>(CH.openBrowserExtensions),
    revealExtensionDirectory: invoke<void, S.BrowserBridgeActionResult>(CH.revealBrowserExtensionDirectory),
    /** 只编译 main 已保存并校验过的源码目录。 */
    installFromRepo: invoke<void, S.BrowserBridgeInstallResult>(CH.installBrowserBridgeFromRepo),
    installNativeHost: invoke<void, S.BrowserBridgeActionResult>(CH.installBrowserBridgeNativeHost),
  },
  plugins: {
    list: invoke<void, S.PluginListItem[]>(CH.listPlugins),
  },
  pythonRuntime: {
    getStatus: invoke<void, S.PythonRuntimeStatus>(CH.getPythonRuntimeStatus),
    /** Starts the extension download when it is not installed or installing; resolves with the status right after. */
    installExtension: invoke<void, S.PythonRuntimeStatus>(CH.installPythonExtension),
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
