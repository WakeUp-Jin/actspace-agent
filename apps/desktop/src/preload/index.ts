import { ENGLISH_LEARNING_CHANNELS } from "@actspace/shared";
import { projectChatWindow, projectChatEvents } from "@actspace/client/sessions";
import { createMessageBlocks } from "@actspace/shared";
import type { RuntimeV2DesktopSessionProjection } from "@actspace/shared/runtime-v2";
import { contextBridge, ipcRenderer, webFrame, webUtils } from "electron";
import type {
  AbortAgentRunInput,
  AgentSystemPromptFile,
  AgentRunResult,
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
  ImportComposerImageInput,
  ImportComposerImageResult,
  SkillInstallResult,
  SkillListResult,
  SkillUninstallInput,
  SkillUninstallResult,
  LocalUpdateSelectSourceResult,
  LocalUpdateStartResult,
  LocalUpdateState,
  PendingApprovalInfo,
  ReviewInitGitInput,
  ReviewInitGitResult,
  ReviewApplyMutationInput,
  ReviewChangeNotification,
  ReviewCreatePullRequestInput,
  ReviewCreatePullRequestResult,
  ReviewCopyApplyCommandInput,
  ReviewCopyApplyCommandResult,
  ReviewGetFileContentsInput,
  ReviewGetFileContentsResult,
  ReviewGetFileDiffsInput,
  ReviewGetFileDiffsResult,
  ReviewGetSnapshotInput,
  ReviewGetSnapshotResult,
  ReviewListBranchesResult,
  ReviewListCommitsResult,
  ReviewMutationResult,
  ReviewPullRequestCapabilityResult,
  ReviewSetFileViewedInput,
  ReviewSetFileViewedResult,
  ReviewWorkspaceInput,
  WorkspaceEnvironmentGetInput,
  WorkspaceEnvironmentSnapshot,
  WorkspaceGitCommitAndPushInput,
  WorkspaceGitCommitInput,
  WorkspaceGitCreateBranchInput,
  WorkspaceGitMutationResult,
  WorkspaceGitPushInput,
  WorkspaceGitSwitchBranchInput,
  WorkspaceOpenInput,
  WorkspaceOpenResult,
  WorkspaceOpenToolsResult,
  RunAgentInput,
  RuntimeStreamEvent,
  SelectFilesResult,
  SelectImagesResult,
  SkillListInput,
  SelectWorkspaceDirectoryInput,
  SelectWorkspaceDirectoryResult,
  SessionArchiveInput,
  SessionArchiveManyInput,
  SessionArchiveManyResult,
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
  UsageActivitySnapshot,
  ListVisualizationsInput,
  ListVisualizationsResult,
  VisualizeReplyInput,
  VisualizeReplyResult,
  WorkspaceListDirInput,
  WorkspaceGitContextInput,
  WorkspaceGitContext,
  WorkspaceCreateFolderInput,
  WorkspaceCreateFolderResult,
  WorkspaceListDirResult,
  WorkspaceListResult,
  WorkspaceIdInput,
  WorkspaceOpenInIdeResult,
  WorkspaceVisibilityInput,
  WorkspaceVisibilityResult,
  WorkspaceReadFileInput,
  WorkspaceReadFileResult,
  WorkspaceStatFileInput,
  WorkspaceStatFileResult,
  WriteAgentSystemPromptInput,
  ProviderConnectInput,
  ProviderUpdateInput,
  ProviderIdInput,
  ProviderOperationResult,
  ProviderTestResult,
  QuickOpenRequest,
  QuickOpenShortcutStatus,
  QuickOpenShortcutUpdateInput,
  QuickOpenShortcutUpdateResult,
  ProvidersListResult,
  ModelsListInstalledResult,
  ModelsListUsableInput,
  ModelsListUsableResult,
  ModelsCatalogListInput,
  ModelsCatalogListResult,
  ModelsAddInput,
  ModelsAddCustomInput,
  ModelsEditCustomInput,
  ModelsSetCustomDefaultInput,
  ModelsUpdateInput,
  ModelsRemoveInput,
  ModelMutationResult,
  TaskModelsUpdateInput,
  TaskModelsUpdateResult,
  TerminalAckInput,
  TerminalAttachInput,
  TerminalCloseInput,
  TerminalCreateInput,
  TerminalDetachInput,
  TerminalEvent,
  TerminalListInput,
  TerminalListResult,
  TerminalOperationResult,
  TerminalResizeInput,
  TerminalSessionResult,
  TerminalWriteInput,
} from "@actspace/shared";
import { RUNTIME_V2_FIXED_RENDERER_CHANNELS } from "@actspace/shared/runtime-v2";

const FIXED_RENDERER_INVOKE_CHANNELS: Readonly<Record<string, string>> = Object.freeze({
  "app:get-bootstrap-state": RUNTIME_V2_FIXED_RENDERER_CHANNELS.bootstrapState,
  "agent:run": RUNTIME_V2_FIXED_RENDERER_CHANNELS.runAgent,
  "context:compact": RUNTIME_V2_FIXED_RENDERER_CHANNELS.compactContext,
  "agent:abort-run": RUNTIME_V2_FIXED_RENDERER_CHANNELS.abortAgentRun,
  "dialog:select-files": RUNTIME_V2_FIXED_RENDERER_CHANNELS.selectFiles,
  "dialog:select-images": RUNTIME_V2_FIXED_RENDERER_CHANNELS.selectImages,
  "composer:import-image": RUNTIME_V2_FIXED_RENDERER_CHANNELS.importComposerImage,
  "dialog:select-workspace-directory": RUNTIME_V2_FIXED_RENDERER_CHANNELS.selectWorkspaceDirectory,
  "visualize:convert-reply": RUNTIME_V2_FIXED_RENDERER_CHANNELS.visualizeReply,
  "visualize:list": RUNTIME_V2_FIXED_RENDERER_CHANNELS.listVisualizations,
  "workspace:list": RUNTIME_V2_FIXED_RENDERER_CHANNELS.listWorkspaces,
  "workspace:open-in-ide": RUNTIME_V2_FIXED_RENDERER_CHANNELS.openWorkspaceInIde,
  "workspace:set-visibility": RUNTIME_V2_FIXED_RENDERER_CHANNELS.setWorkspaceVisibility,
  "workspace:get-git-context": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getWorkspaceGitContext,
  "workspace:create-folder": RUNTIME_V2_FIXED_RENDERER_CHANNELS.createWorkspaceFolder,
  "workspace:list-dir": RUNTIME_V2_FIXED_RENDERER_CHANNELS.listWorkspaceDir,
  "workspace:read-file": RUNTIME_V2_FIXED_RENDERER_CHANNELS.readWorkspaceFile,
  "workspace:stat-file": RUNTIME_V2_FIXED_RENDERER_CHANNELS.statWorkspaceFile,
  "session:read-artifact": RUNTIME_V2_FIXED_RENDERER_CHANNELS.readSessionArtifact,
  "artifact:show-context-menu": RUNTIME_V2_FIXED_RENDERER_CHANNELS.showArtifactContextMenu,
  "review:init-git": RUNTIME_V2_FIXED_RENDERER_CHANNELS.initGitRepository,
  "review:get-snapshot": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getReviewSnapshot,
  "review:refresh-snapshot": RUNTIME_V2_FIXED_RENDERER_CHANNELS.refreshReviewSnapshot,
  "review:get-file-diffs": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getReviewFileDiffs,
  "review:get-file-contents": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getReviewFileContents,
  "review:apply-mutation": RUNTIME_V2_FIXED_RENDERER_CHANNELS.applyReviewMutation,
  "review:set-file-viewed": RUNTIME_V2_FIXED_RENDERER_CHANNELS.setReviewFileViewed,
  "review:list-branches": RUNTIME_V2_FIXED_RENDERER_CHANNELS.listReviewBranches,
  "review:list-commits": RUNTIME_V2_FIXED_RENDERER_CHANNELS.listReviewCommits,
  "review:copy-apply-command": RUNTIME_V2_FIXED_RENDERER_CHANNELS.copyReviewGitApplyCommand,
  "review:get-pr-capability": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getReviewPullRequestCapability,
  "review:create-pr": RUNTIME_V2_FIXED_RENDERER_CHANNELS.createReviewPullRequest,
  "workspace-environment:get": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getWorkspaceEnvironment,
  "workspace-environment:create-branch": RUNTIME_V2_FIXED_RENDERER_CHANNELS.createWorkspaceBranch,
  "workspace-environment:switch-branch": RUNTIME_V2_FIXED_RENDERER_CHANNELS.switchWorkspaceBranch,
  "workspace-environment:commit": RUNTIME_V2_FIXED_RENDERER_CHANNELS.commitWorkspaceChanges,
  "workspace-environment:push": RUNTIME_V2_FIXED_RENDERER_CHANNELS.pushWorkspaceBranch,
  "workspace-environment:commit-and-push": RUNTIME_V2_FIXED_RENDERER_CHANNELS.commitAndPushWorkspaceChanges,
  "workspace-open:list-tools": RUNTIME_V2_FIXED_RENDERER_CHANNELS.listWorkspaceOpenTools,
  "workspace-open:open": RUNTIME_V2_FIXED_RENDERER_CHANNELS.openWorkspaceInTool,
  "context:describe": RUNTIME_V2_FIXED_RENDERER_CHANNELS.describeContext,
  "session:list-page": RUNTIME_V2_FIXED_RENDERER_CHANNELS.listSessionPage,
  "session:tool-detail": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getSessionToolDetail,
  "session:get-page": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getSessionPage,
  "session:list": RUNTIME_V2_FIXED_RENDERER_CHANNELS.listSessions,
  "session:get": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getSession,
  "session:get-projection-snapshot": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getSessionProjectionSnapshot,
  "session:get-observation": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getSessionObservation,
  "session:get-preview": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getSessionPreview,
  "subagent:list": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getSubagents,
  "subagent:get-transcript": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getSubAgentTranscript,
  "usage-statistics:get": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getUsageStatistics,
  "usage-activity:get": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getUsageActivity,
  "deepseek:balance:get": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getDeepSeekBalance,
  "kimi:balance:get": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getKimiBalance,
  "provider:balance:get": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getProviderBalance,
  "session:create": RUNTIME_V2_FIXED_RENDERER_CHANNELS.createSession,
  "session:fork": RUNTIME_V2_FIXED_RENDERER_CHANNELS.forkSession,
  "session:pin": RUNTIME_V2_FIXED_RENDERER_CHANNELS.pinSession,
  "session:rename": RUNTIME_V2_FIXED_RENDERER_CHANNELS.renameSession,
  "session:set-workspace": RUNTIME_V2_FIXED_RENDERER_CHANNELS.setSessionWorkspace,
  "session:set-permission-mode": RUNTIME_V2_FIXED_RENDERER_CHANNELS.setSessionPermissionMode,
  "session:revoke-grant": RUNTIME_V2_FIXED_RENDERER_CHANNELS.revokeSessionGrant,
  "session:archive": RUNTIME_V2_FIXED_RENDERER_CHANNELS.archiveSession,
  "session:archive-many": RUNTIME_V2_FIXED_RENDERER_CHANNELS.archiveSessions,
  "terminal:create": RUNTIME_V2_FIXED_RENDERER_CHANNELS.terminalCreate,
  "terminal:list": RUNTIME_V2_FIXED_RENDERER_CHANNELS.terminalList,
  "terminal:attach": RUNTIME_V2_FIXED_RENDERER_CHANNELS.terminalAttach,
  "terminal:detach": RUNTIME_V2_FIXED_RENDERER_CHANNELS.terminalDetach,
  "terminal:write": RUNTIME_V2_FIXED_RENDERER_CHANNELS.terminalWrite,
  "terminal:resize": RUNTIME_V2_FIXED_RENDERER_CHANNELS.terminalResize,
  "terminal:ack": RUNTIME_V2_FIXED_RENDERER_CHANNELS.terminalAck,
  "terminal:close": RUNTIME_V2_FIXED_RENDERER_CHANNELS.terminalClose,
  "approval:decide": RUNTIME_V2_FIXED_RENDERER_CHANNELS.submitApproval,
  "approval:list-pending": RUNTIME_V2_FIXED_RENDERER_CHANNELS.listPendingApprovals,
  "settings:get": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getSettings,
  "settings:get-v4": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getSettingsV4,
  "quick-open:consume": RUNTIME_V2_FIXED_RENDERER_CHANNELS.quickOpenConsume,
  "quick-open:get-status": RUNTIME_V2_FIXED_RENDERER_CHANNELS.quickOpenStatus,
  "quick-open:update": RUNTIME_V2_FIXED_RENDERER_CHANNELS.quickOpenUpdate,
  "settings:read-agent-system-prompt": RUNTIME_V2_FIXED_RENDERER_CHANNELS.readAgentSystemPrompt,
  "settings:write-agent-system-prompt": RUNTIME_V2_FIXED_RENDERER_CHANNELS.writeAgentSystemPrompt,
  "settings:update": RUNTIME_V2_FIXED_RENDERER_CHANNELS.updateSettings,
  "settings:update-v4": RUNTIME_V2_FIXED_RENDERER_CHANNELS.updateSettingsV4,
  "settings:create-custom-connection": RUNTIME_V2_FIXED_RENDERER_CHANNELS.createCustomConnection,
  "settings:remove-custom-connection": RUNTIME_V2_FIXED_RENDERER_CHANNELS.removeCustomConnection,
  "settings:update-custom-connection": RUNTIME_V2_FIXED_RENDERER_CHANNELS.updateCustomConnection,
  "settings:test-custom-connection": RUNTIME_V2_FIXED_RENDERER_CHANNELS.testCustomConnection,
  "settings:set-provider-key": RUNTIME_V2_FIXED_RENDERER_CHANNELS.setProviderKey,
  "settings:clear-provider-key": RUNTIME_V2_FIXED_RENDERER_CHANNELS.clearProviderKey,
  "settings:update-image-generation": RUNTIME_V2_FIXED_RENDERER_CHANNELS.updateImageGeneration,
  "settings:test-connection": RUNTIME_V2_FIXED_RENDERER_CHANNELS.testProviderConnection,
  "settings:search-usage": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getSearchUsage,
  "providers:list": RUNTIME_V2_FIXED_RENDERER_CHANNELS.listProviders,
  "providers:connect": RUNTIME_V2_FIXED_RENDERER_CHANNELS.connectProvider,
  "providers:update": RUNTIME_V2_FIXED_RENDERER_CHANNELS.updateProvider,
  "providers:test": RUNTIME_V2_FIXED_RENDERER_CHANNELS.testProvider,
  "providers:disconnect": RUNTIME_V2_FIXED_RENDERER_CHANNELS.disconnectProvider,
  "providers:remove": RUNTIME_V2_FIXED_RENDERER_CHANNELS.removeProvider,
  "provider-credentials:add": RUNTIME_V2_FIXED_RENDERER_CHANNELS.addProviderCredential,
  "provider-credentials:update": RUNTIME_V2_FIXED_RENDERER_CHANNELS.updateProviderCredential,
  "provider-credentials:test": RUNTIME_V2_FIXED_RENDERER_CHANNELS.testProviderCredential,
  "provider-credentials:remove": RUNTIME_V2_FIXED_RENDERER_CHANNELS.removeProviderCredential,
  "models:list-installed": RUNTIME_V2_FIXED_RENDERER_CHANNELS.listInstalledModels,
  "models:list-usable": RUNTIME_V2_FIXED_RENDERER_CHANNELS.listUsableModels,
  "models:pricing:get": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getPricingCatalog,
  "models:pricing:refresh": RUNTIME_V2_FIXED_RENDERER_CHANNELS.refreshPricingCatalog,
  "models:catalog:list": RUNTIME_V2_FIXED_RENDERER_CHANNELS.listModelCatalog,
  "models:catalog:reload": RUNTIME_V2_FIXED_RENDERER_CHANNELS.reloadModelCatalog,
  "models:add": RUNTIME_V2_FIXED_RENDERER_CHANNELS.addModel,
  "models:add-custom": RUNTIME_V2_FIXED_RENDERER_CHANNELS.addCustomModel,
  "models:edit-custom": RUNTIME_V2_FIXED_RENDERER_CHANNELS.editCustomModel,
  "models:set-custom-default": RUNTIME_V2_FIXED_RENDERER_CHANNELS.setCustomConnectionDefaultModel,
  "models:update": RUNTIME_V2_FIXED_RENDERER_CHANNELS.updateModel,
  "models:remove": RUNTIME_V2_FIXED_RENDERER_CHANNELS.removeModel,
  "task-models:update": RUNTIME_V2_FIXED_RENDERER_CHANNELS.updateTaskModels,
  "plugins:browser-bridge:get-status": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getBrowserBridgeStatus,
  "plugins:browser-bridge:install-from-repo": RUNTIME_V2_FIXED_RENDERER_CHANNELS.installBrowserBridgeFromRepo,
  "plugins:browser-bridge:install-native-host": RUNTIME_V2_FIXED_RENDERER_CHANNELS.installBrowserBridgeNativeHost,
  "skills:list": RUNTIME_V2_FIXED_RENDERER_CHANNELS.listSkills,
  "skills:install": RUNTIME_V2_FIXED_RENDERER_CHANNELS.installSkill,
  "skills:uninstall": RUNTIME_V2_FIXED_RENDERER_CHANNELS.uninstallSkill,
  "local-update:get-state": RUNTIME_V2_FIXED_RENDERER_CHANNELS.getLocalUpdateState,
  "local-update:select-source": RUNTIME_V2_FIXED_RENDERER_CHANNELS.selectLocalUpdateSource,
  "local-update:start": RUNTIME_V2_FIXED_RENDERER_CHANNELS.startLocalUpdate,
});

function invokeFixedRenderer(channel: string, ...args: unknown[]): Promise<unknown> {
  const namespacedChannel = FIXED_RENDERER_INVOKE_CHANNELS[channel];
  if (!namespacedChannel) return Promise.reject(new Error(`Unsupported fixed renderer IPC channel: ${channel}`));
  return ipcRenderer.invoke(namespacedChannel, ...args);
}

contextBridge.exposeInMainWorld("actspace", {
  getBootstrapState: () => invokeFixedRenderer("app:get-bootstrap-state") as Promise<BootstrapState>,
  runAgent: async (input: RunAgentInput): Promise<AgentRunResult> => {
    const { projection, ...result } = await invokeFixedRenderer("agent:run", input) as Omit<AgentRunResult, "events" | "contextSnapshot"> & { projection: RuntimeV2DesktopSessionProjection };
    const record = projectChatWindow(projection);
    return { ...result, events: record.events, contextSnapshot: record.contextSnapshot };
  },
  compactContext: (input: CompactContextInput) =>
    invokeFixedRenderer("context:compact", input) as Promise<CompactContextResult>,
  abortAgentRun: (input: AbortAgentRunInput) => invokeFixedRenderer("agent:abort-run", input) as Promise<boolean>,
  selectFiles: () => invokeFixedRenderer("dialog:select-files") as Promise<SelectFilesResult>,
  selectImages: () => invokeFixedRenderer("dialog:select-images") as Promise<SelectImagesResult>,
  importComposerImage: (input: ImportComposerImageInput) =>
    invokeFixedRenderer("composer:import-image", input) as Promise<ImportComposerImageResult>,
  selectWorkspaceDirectory: (input?: SelectWorkspaceDirectoryInput) =>
    invokeFixedRenderer("dialog:select-workspace-directory", input) as Promise<SelectWorkspaceDirectoryResult>,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  visualizeReply: (input: VisualizeReplyInput) =>
    invokeFixedRenderer("visualize:convert-reply", input) as Promise<VisualizeReplyResult>,
  listVisualizations: (input: ListVisualizationsInput) =>
    invokeFixedRenderer("visualize:list", input) as Promise<ListVisualizationsResult>,
  listWorkspaces: () => invokeFixedRenderer("workspace:list") as Promise<WorkspaceListResult>,
  openWorkspaceInIde: (input: WorkspaceIdInput) =>
    invokeFixedRenderer("workspace:open-in-ide", input) as Promise<WorkspaceOpenInIdeResult>,
  setWorkspaceVisibility: (input: WorkspaceVisibilityInput) =>
    invokeFixedRenderer("workspace:set-visibility", input) as Promise<WorkspaceVisibilityResult>,
  getWorkspaceGitContext: (input: WorkspaceGitContextInput) =>
    invokeFixedRenderer("workspace:get-git-context", input) as Promise<WorkspaceGitContext>,
  createWorkspaceFolder: (input: WorkspaceCreateFolderInput) =>
    invokeFixedRenderer("workspace:create-folder", input) as Promise<WorkspaceCreateFolderResult>,
  listWorkspaceDir: (input: WorkspaceListDirInput) =>
    invokeFixedRenderer("workspace:list-dir", input) as Promise<WorkspaceListDirResult>,
  readWorkspaceFile: (input: WorkspaceReadFileInput) =>
    invokeFixedRenderer("workspace:read-file", input) as Promise<WorkspaceReadFileResult>,
  statWorkspaceFile: (input: WorkspaceStatFileInput) =>
    invokeFixedRenderer("workspace:stat-file", input) as Promise<WorkspaceStatFileResult>,
  readSessionArtifact: (input: SessionArtifactReadInput) =>
    invokeFixedRenderer("session:read-artifact", input) as Promise<SessionArtifactReadResult>,
  showArtifactContextMenu: (input: ArtifactContextMenuInput) =>
    invokeFixedRenderer("artifact:show-context-menu", input) as Promise<ArtifactContextMenuResult>,
  initGitRepository: (input: ReviewInitGitInput) =>
    invokeFixedRenderer("review:init-git", input) as Promise<ReviewInitGitResult>,
  getReviewSnapshot: (input: ReviewGetSnapshotInput) =>
    invokeFixedRenderer("review:get-snapshot", input) as Promise<ReviewGetSnapshotResult>,
  refreshReviewSnapshot: (input: ReviewGetSnapshotInput) =>
    invokeFixedRenderer("review:refresh-snapshot", input) as Promise<ReviewGetSnapshotResult>,
  getReviewFileDiffs: (input: ReviewGetFileDiffsInput) =>
    invokeFixedRenderer("review:get-file-diffs", input) as Promise<ReviewGetFileDiffsResult>,
  getReviewFileContents: (input: ReviewGetFileContentsInput) =>
    invokeFixedRenderer("review:get-file-contents", input) as Promise<ReviewGetFileContentsResult>,
  applyReviewMutation: (input: ReviewApplyMutationInput) =>
    invokeFixedRenderer("review:apply-mutation", input) as Promise<ReviewMutationResult>,
  setReviewFileViewed: (input: ReviewSetFileViewedInput) =>
    invokeFixedRenderer("review:set-file-viewed", input) as Promise<ReviewSetFileViewedResult>,
  listReviewBranches: (input: ReviewWorkspaceInput) =>
    invokeFixedRenderer("review:list-branches", input) as Promise<ReviewListBranchesResult>,
  listReviewCommits: (input: ReviewWorkspaceInput) =>
    invokeFixedRenderer("review:list-commits", input) as Promise<ReviewListCommitsResult>,
  copyReviewGitApplyCommand: (input: ReviewCopyApplyCommandInput) =>
    invokeFixedRenderer("review:copy-apply-command", input) as Promise<ReviewCopyApplyCommandResult>,
  getReviewPullRequestCapability: (input: ReviewWorkspaceInput & { baseBranch?: string }) =>
    invokeFixedRenderer("review:get-pr-capability", input) as Promise<ReviewPullRequestCapabilityResult>,
  createReviewPullRequest: (input: ReviewCreatePullRequestInput) =>
    invokeFixedRenderer("review:create-pr", input) as Promise<ReviewCreatePullRequestResult>,
  onReviewChanged: (callback: (notification: ReviewChangeNotification) => void) => {
    const handler = (_: unknown, notification: ReviewChangeNotification) => callback(notification);
    ipcRenderer.on(RUNTIME_V2_FIXED_RENDERER_CHANNELS.reviewChanged, handler);
    return () => ipcRenderer.removeListener(RUNTIME_V2_FIXED_RENDERER_CHANNELS.reviewChanged, handler);
  },
  getWorkspaceEnvironment: (input: WorkspaceEnvironmentGetInput) =>
    invokeFixedRenderer("workspace-environment:get", input) as Promise<WorkspaceEnvironmentSnapshot>,
  createWorkspaceBranch: (input: WorkspaceGitCreateBranchInput) =>
    invokeFixedRenderer("workspace-environment:create-branch", input) as Promise<WorkspaceGitMutationResult>,
  switchWorkspaceBranch: (input: WorkspaceGitSwitchBranchInput) =>
    invokeFixedRenderer("workspace-environment:switch-branch", input) as Promise<WorkspaceGitMutationResult>,
  commitWorkspaceChanges: (input: WorkspaceGitCommitInput) =>
    invokeFixedRenderer("workspace-environment:commit", input) as Promise<WorkspaceGitMutationResult>,
  pushWorkspaceBranch: (input: WorkspaceGitPushInput) =>
    invokeFixedRenderer("workspace-environment:push", input) as Promise<WorkspaceGitMutationResult>,
  commitAndPushWorkspaceChanges: (input: WorkspaceGitCommitAndPushInput) =>
    invokeFixedRenderer("workspace-environment:commit-and-push", input) as Promise<WorkspaceGitMutationResult>,
  listWorkspaceOpenTools: () =>
    invokeFixedRenderer("workspace-open:list-tools") as Promise<WorkspaceOpenToolsResult>,
  openWorkspaceInTool: (input: WorkspaceOpenInput) =>
    invokeFixedRenderer("workspace-open:open", input) as Promise<WorkspaceOpenResult>,
  describeContext: (input: DescribeContextInput) =>
    invokeFixedRenderer("context:describe", input) as Promise<ContextState | null>,
  listSessionPage: (input?: import("@actspace/shared").SessionListPageInput) => invokeFixedRenderer("session:list-page", input ?? {}) as Promise<import("@actspace/shared").SessionListPage>,
  getSessionToolDetail: async (input: { sessionId: string; callId: string }) => {
    const page = await invokeFixedRenderer("session:tool-detail", input) as import("@actspace/desktop-app").DesktopBrowsePage;
    return createMessageBlocks(projectChatEvents(page.snapshot, page.journal));
  },
  getSessionPage: (input: import("@actspace/shared/runtime-v2").RuntimeV2SessionProjectionInput) => invokeFixedRenderer("session:get-page", input) as Promise<RuntimeV2DesktopSessionProjection>,
  listSessions: (input?: SessionListInput) => invokeFixedRenderer("session:list", input ?? {}) as Promise<SessionListItem[]>,
  getSession: async (input: SessionGetInput) => {
    const projection = await invokeFixedRenderer("session:get", input) as RuntimeV2DesktopSessionProjection | null;
    return projection ? projectChatWindow(projection) : null;
  },
  getSessionProjectionSnapshot: (input: import("@actspace/shared/runtime-v2").RuntimeV2SessionProjectionInput) =>
    invokeFixedRenderer("session:get-projection-snapshot", input) as Promise<import("@actspace/shared/runtime-v2").RuntimeV2DesktopSessionProjection>,
  getSessionObservation: (input: import("@actspace/shared/runtime-v2").RuntimeV2SessionProjectionInput) =>
    invokeFixedRenderer("session:get-observation", input) as Promise<import("@actspace/shared/runtime-v2").RuntimeV2SessionObservation>,
  getSessionPreview: (input: SessionPreviewInput) =>
    invokeFixedRenderer("session:get-preview", input) as Promise<SessionPreviewResult | null>,
  getSubagents: (input: { sessionId: string }) => invokeFixedRenderer("subagent:list", input) as Promise<import("@actspace/shared").MessageBlock[]>,
  getSubAgentTranscript: (input: SubAgentTranscriptGetInput) =>
    invokeFixedRenderer("subagent:get-transcript", input) as Promise<SessionEvent[]>,
  getUsageStatistics: (input: UsageStatisticsGetInput) =>
    invokeFixedRenderer("usage-statistics:get", input) as Promise<UsageStatisticsSnapshot | null>,
  getUsageActivity: (input: UsageStatisticsGetInput) =>
    invokeFixedRenderer("usage-activity:get", input) as Promise<UsageActivitySnapshot | null>,
  getDeepSeekBalance: () =>
    invokeFixedRenderer("deepseek:balance:get") as Promise<DeepSeekBalanceSnapshot>,
  getKimiBalance: () =>
    invokeFixedRenderer("kimi:balance:get") as Promise<KimiBalanceSnapshot>,
  getProviderBalance: (input: ProviderBalanceGetInput) =>
    invokeFixedRenderer("provider:balance:get", input) as Promise<ProviderBalanceSnapshot>,
  createSession: async (input?: SessionCreateInput) => projectChatWindow(await invokeFixedRenderer("session:create", input ?? {}) as RuntimeV2DesktopSessionProjection),
  forkSession: async (input: SessionForkInput) => projectChatWindow(await invokeFixedRenderer("session:fork", input) as RuntimeV2DesktopSessionProjection),
  pinSession: (input: SessionPinInput) => invokeFixedRenderer("session:pin", input) as Promise<SessionPinResult>,
  renameSession: (input: SessionRenameInput) =>
    invokeFixedRenderer("session:rename", input) as Promise<SessionRenameResult>,
  setSessionWorkspace: (input: SessionWorkspaceInput) =>
    invokeFixedRenderer("session:set-workspace", input) as Promise<SessionWorkspaceResult>,
  setSessionPermissionMode: (input: import("@actspace/shared").SessionPermissionModeInput) =>
    invokeFixedRenderer("session:set-permission-mode", input) as Promise<import("@actspace/shared").SessionPermissionModeResult>,
  revokeSessionGrant: (input: import("@actspace/shared").SessionGrantRevokeInput) =>
    invokeFixedRenderer("session:revoke-grant", input) as Promise<import("@actspace/shared").SessionGrantRevokeResult>,
  archiveSession: (input: SessionArchiveInput) =>
    invokeFixedRenderer("session:archive", input) as Promise<SessionArchiveResult>,
  archiveSessions: (input: SessionArchiveManyInput) =>
    invokeFixedRenderer("session:archive-many", input) as Promise<SessionArchiveManyResult>,

  createTerminal: (input: TerminalCreateInput) =>
    invokeFixedRenderer("terminal:create", input) as Promise<TerminalSessionResult>,
  listTerminals: (input: TerminalListInput) =>
    invokeFixedRenderer("terminal:list", input) as Promise<TerminalListResult>,
  attachTerminal: (input: TerminalAttachInput) =>
    invokeFixedRenderer("terminal:attach", input) as Promise<TerminalSessionResult>,
  detachTerminal: (input: TerminalDetachInput) =>
    invokeFixedRenderer("terminal:detach", input) as Promise<TerminalOperationResult>,
  writeTerminal: (input: TerminalWriteInput) =>
    invokeFixedRenderer("terminal:write", input) as Promise<TerminalOperationResult>,
  resizeTerminal: (input: TerminalResizeInput) =>
    invokeFixedRenderer("terminal:resize", input) as Promise<TerminalOperationResult>,
  ackTerminal: (input: TerminalAckInput) =>
    invokeFixedRenderer("terminal:ack", input) as Promise<TerminalOperationResult>,
  closeTerminal: (input: TerminalCloseInput) =>
    invokeFixedRenderer("terminal:close", input) as Promise<TerminalOperationResult>,
  onTerminalEvent: (callback: (event: TerminalEvent) => void) => {
    const handler = (_: unknown, event: TerminalEvent) => callback(event);
    ipcRenderer.on(RUNTIME_V2_FIXED_RENDERER_CHANNELS.terminalEvent, handler);
    return () => ipcRenderer.removeListener(RUNTIME_V2_FIXED_RENDERER_CHANNELS.terminalEvent, handler);
  },

  submitApproval: (input: ApprovalDecideInput) => invokeFixedRenderer("approval:decide", input) as Promise<ApprovalDecideResult>,
  listPendingApprovals: (input?: ApprovalListPendingInput) => invokeFixedRenderer("approval:list-pending", input ?? {}) as Promise<PendingApprovalInfo[]>,

  getSettings: () => invokeFixedRenderer("settings:get") as Promise<AppSettings>,
  getEnglishLearningState: () => ipcRenderer.invoke(ENGLISH_LEARNING_CHANNELS.getState),
  setEnglishLearningTarget: (input: import("@actspace/shared").EnglishLearningTargetInput) => ipcRenderer.invoke(ENGLISH_LEARNING_CHANNELS.setTarget, input),
  stopEnglishLearningSpeech: () => ipcRenderer.invoke(ENGLISH_LEARNING_CHANNELS.stop),
  previewEnglishLearningSpeech: () => ipcRenderer.invoke(ENGLISH_LEARNING_CHANNELS.preview),
  onEnglishLearningStateChanged: (callback: (state: import("@actspace/shared").EnglishLearningState) => void) => {
    const handler = (_event: unknown, state: import("@actspace/shared").EnglishLearningState) => callback(state);
    ipcRenderer.on(ENGLISH_LEARNING_CHANNELS.stateChanged, handler);
    return () => ipcRenderer.removeListener(ENGLISH_LEARNING_CHANNELS.stateChanged, handler);
  },
  getSettingsV4: () => invokeFixedRenderer("settings:get-v4") as Promise<import("@actspace/shared").SettingsV4Snapshot>,
  consumeQuickOpenRequest: () => invokeFixedRenderer("quick-open:consume") as Promise<QuickOpenRequest | null>,
  getQuickOpenShortcutStatus: () => invokeFixedRenderer("quick-open:get-status") as Promise<QuickOpenShortcutStatus>,
  updateQuickOpenShortcut: (input: QuickOpenShortcutUpdateInput) =>
    invokeFixedRenderer("quick-open:update", input) as Promise<QuickOpenShortcutUpdateResult>,
  onQuickOpenRequested: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(RUNTIME_V2_FIXED_RENDERER_CHANNELS.quickOpenRequested, handler);
    return () => ipcRenderer.removeListener(RUNTIME_V2_FIXED_RENDERER_CHANNELS.quickOpenRequested, handler);
  },
  readAgentSystemPrompt: () =>
    invokeFixedRenderer("settings:read-agent-system-prompt") as Promise<AgentSystemPromptFile>,
  writeAgentSystemPrompt: (input: WriteAgentSystemPromptInput) =>
    invokeFixedRenderer("settings:write-agent-system-prompt", input) as Promise<AgentSystemPromptFile>,
  updateSettings: (input: SettingsUpdateInput) =>
    invokeFixedRenderer("settings:update", input) as Promise<AppSettings>,
  updateSettingsV4: (input: import("@actspace/shared").SettingsV4UpdateInput) =>
    invokeFixedRenderer("settings:update-v4", input) as Promise<import("@actspace/shared").SettingsV4UpdateResult>,
  createCustomConnection: (input: import("@actspace/shared").CustomConnectionInput) =>
    invokeFixedRenderer("settings:create-custom-connection", input) as Promise<import("@actspace/shared").SettingsV4Snapshot>,
  removeCustomConnection: (input: { connectionId: string }) =>
    invokeFixedRenderer("settings:remove-custom-connection", input) as Promise<import("@actspace/shared").SettingsV4Snapshot>,
  updateCustomConnection: (input: import("@actspace/shared/runtime-v2").RuntimeV2UpdateCustomConnectionInput) =>
    invokeFixedRenderer("settings:update-custom-connection", input) as Promise<import("@actspace/shared").SettingsV4Snapshot>,
  testCustomConnection: (input: import("@actspace/shared").CustomConnectionTestInput) =>
    invokeFixedRenderer("settings:test-custom-connection", input) as Promise<import("@actspace/shared").CustomConnectionTestResult>,
  onSettingsChangedV4: (callback: (notification: import("@actspace/shared").SettingsV4ChangedNotification) => void) => {
    const handler = (_: unknown, notification: import("@actspace/shared").SettingsV4ChangedNotification) => callback(notification);
    ipcRenderer.on(RUNTIME_V2_FIXED_RENDERER_CHANNELS.settingsChangedV4, handler);
    return () => ipcRenderer.removeListener(RUNTIME_V2_FIXED_RENDERER_CHANNELS.settingsChangedV4, handler);
  },
  setProviderKey: (input: SetProviderKeyInput) =>
    invokeFixedRenderer("settings:set-provider-key", input) as Promise<SetProviderKeyResult>,
  clearProviderKey: (input: ClearProviderKeyInput) =>
    invokeFixedRenderer("settings:clear-provider-key", input) as Promise<ClearProviderKeyResult>,
  updateImageGeneration: (input: UpdateImageGenerationSettingsInput) =>
    invokeFixedRenderer("settings:update-image-generation", input) as Promise<UpdateImageGenerationSettingsResult>,
  testProviderConnection: (input: TestConnectionInput) =>
    invokeFixedRenderer("settings:test-connection", input) as Promise<TestConnectionResult>,
  getSearchUsage: () =>
    invokeFixedRenderer("settings:search-usage") as Promise<SearchUsageResult>,
  listProviders: () => invokeFixedRenderer("providers:list") as Promise<ProvidersListResult>,
  connectProvider: (input: ProviderConnectInput) => invokeFixedRenderer("providers:connect", input) as Promise<ProviderOperationResult>,
  updateProvider: (input: ProviderUpdateInput) => invokeFixedRenderer("providers:update", input) as Promise<ProviderOperationResult>,
  testProvider: (input: ProviderIdInput) => invokeFixedRenderer("providers:test", input) as Promise<ProviderTestResult>,
  disconnectProvider: (input: ProviderIdInput) => invokeFixedRenderer("providers:disconnect", input) as Promise<ProviderOperationResult>,
  removeProvider: (input: ProviderIdInput) => invokeFixedRenderer("providers:remove", input) as Promise<ProviderOperationResult>,
  addProviderCredential: (input: ProviderCredentialAddInput) => invokeFixedRenderer("provider-credentials:add", input) as Promise<ProviderCredentialOperationResult>,
  updateProviderCredential: (input: ProviderCredentialUpdateInput) => invokeFixedRenderer("provider-credentials:update", input) as Promise<ProviderCredentialOperationResult>,
  testProviderCredential: (input: ProviderCredentialInput) => invokeFixedRenderer("provider-credentials:test", input) as Promise<ProviderCredentialOperationResult>,
  removeProviderCredential: (input: ProviderCredentialInput) => invokeFixedRenderer("provider-credentials:remove", input) as Promise<ProviderCredentialOperationResult>,
  listInstalledModels: () => invokeFixedRenderer("models:list-installed") as Promise<ModelsListInstalledResult>,
  listUsableModels: (input: ModelsListUsableInput) => invokeFixedRenderer("models:list-usable", input) as Promise<ModelsListUsableResult>,
  getPricingCatalog: () => invokeFixedRenderer("models:pricing:get") as Promise<import("@actspace/shared").ModelCatalogStatus | null>,
  refreshPricingCatalog: (input?: { force?: boolean }) => invokeFixedRenderer("models:pricing:refresh", input) as Promise<import("@actspace/shared").ModelCatalogStatus | null>,
  listModelCatalog: (input: ModelsCatalogListInput) => invokeFixedRenderer("models:catalog:list", input) as Promise<ModelsCatalogListResult>,
  reloadModelCatalog: (input: ModelsCatalogListInput) => invokeFixedRenderer("models:catalog:reload", input) as Promise<ModelsCatalogListResult>,
  addModel: (input: ModelsAddInput) => invokeFixedRenderer("models:add", input) as Promise<ModelMutationResult>,
  addCustomModel: (input: ModelsAddCustomInput) => invokeFixedRenderer("models:add-custom", input) as Promise<ModelMutationResult>,
  editCustomModel: (input: ModelsEditCustomInput) => invokeFixedRenderer("models:edit-custom", input) as Promise<ModelMutationResult>,
  setCustomConnectionDefaultModel: (input: ModelsSetCustomDefaultInput) => invokeFixedRenderer("models:set-custom-default", input) as Promise<ModelMutationResult>,
  updateModel: (input: ModelsUpdateInput) => invokeFixedRenderer("models:update", input) as Promise<ModelMutationResult>,
  removeModel: (input: ModelsRemoveInput) => invokeFixedRenderer("models:remove", input) as Promise<ModelMutationResult>,
  updateTaskModels: (input: TaskModelsUpdateInput) => invokeFixedRenderer("task-models:update", input) as Promise<TaskModelsUpdateResult>,
  getBrowserBridgeStatus: () =>
    invokeFixedRenderer("plugins:browser-bridge:get-status") as Promise<BrowserBridgeStatus>,
  installBrowserBridgeFromRepo: (input: { repoRoot: string }) =>
    invokeFixedRenderer("plugins:browser-bridge:install-from-repo", input) as Promise<BrowserBridgeInstallResult>,
  installBrowserBridgeNativeHost: () =>
    invokeFixedRenderer("plugins:browser-bridge:install-native-host") as Promise<BrowserBridgeActionResult>,
  listSkills: (input: SkillListInput = {}) => invokeFixedRenderer("skills:list", input) as Promise<SkillListResult>,
  installSkill: () => invokeFixedRenderer("skills:install") as Promise<SkillInstallResult>,
  uninstallSkill: (input: SkillUninstallInput) =>
    invokeFixedRenderer("skills:uninstall", input) as Promise<SkillUninstallResult>,
  getLocalUpdateState: () =>
    invokeFixedRenderer("local-update:get-state") as Promise<LocalUpdateState>,
  selectLocalUpdateSource: () =>
    invokeFixedRenderer("local-update:select-source") as Promise<LocalUpdateSelectSourceResult>,
  startLocalUpdate: () =>
    invokeFixedRenderer("local-update:start") as Promise<LocalUpdateStartResult>,

  // 整窗缩放：preload 直接调 webFrame，无需 IPC 往返。外观设置的「界面字号」用它实现。
  setUiZoom: (factor: number) => webFrame.setZoomFactor(factor),

  // 主题三态同步原生 chrome（main 设 nativeTheme.themeSource）。fire-and-forget。
  setNativeTheme: (mode: "light" | "dark" | "system") => ipcRenderer.send(RUNTIME_V2_FIXED_RENDERER_CHANNELS.setNativeTheme, mode),

  onAgentStream: (callback: (event: RuntimeStreamEvent) => void) => {
    const handler = (_: unknown, event: RuntimeStreamEvent) => callback(event);
    ipcRenderer.on(RUNTIME_V2_FIXED_RENDERER_CHANNELS.agentStream, handler);
    return () => {
      ipcRenderer.removeListener(RUNTIME_V2_FIXED_RENDERER_CHANNELS.agentStream, handler);
    };
  },
  onSessionLiveEvent: (callback: (event: import("@actspace/shared/runtime-v2").RuntimeV2DesktopLiveEnvelope) => void) => {
    const handler = (_: unknown, envelope: import("@actspace/shared/runtime-v2").RuntimeV2DesktopLiveEnvelope) => callback(envelope);
    ipcRenderer.on(RUNTIME_V2_FIXED_RENDERER_CHANNELS.sessionLiveEvent, handler);
    return () => ipcRenderer.removeListener(RUNTIME_V2_FIXED_RENDERER_CHANNELS.sessionLiveEvent, handler);
  },

  // 主进程开始优雅退出时通知 renderer 弹退出遮罩。无 payload。
  onShuttingDown: (callback: (notice: AppShutdownNotice) => void) => {
    const handler = (_: unknown, notice?: AppShutdownNotice) => callback(notice ?? { reason: "normal" });
    ipcRenderer.on(RUNTIME_V2_FIXED_RENDERER_CHANNELS.appShuttingDown, handler);
    return () => {
      ipcRenderer.removeListener(RUNTIME_V2_FIXED_RENDERER_CHANNELS.appShuttingDown, handler);
    };
  },
});
