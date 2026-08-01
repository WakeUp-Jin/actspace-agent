export {};

declare global {
  interface Window {
    actspace: {
      getBootstrapState: () => Promise<import("@actspace/shared").BootstrapState>;
      runAgent: (
        input: import("@actspace/shared").RunAgentInput
      ) => Promise<import("@actspace/shared").AgentRunResult>;
      compactContext: (
        input: import("@actspace/shared").CompactContextInput
      ) => Promise<import("@actspace/shared").CompactContextResult>;
      generateEvalCandidate?: (
        input: import("@actspace/shared").GenerateEvalCandidateInput
      ) => Promise<import("@actspace/shared").GenerateEvalCandidateResult>;
      abortAgentRun: (
        input: import("@actspace/shared").AbortAgentRunInput
      ) => Promise<boolean>;
      listAgentTraces?: (
        input: import("@actspace/shared").AgentTraceListInput
      ) => Promise<import("@actspace/shared").AgentTraceListResult>;
      readAgentTrace?: (
        input: import("@actspace/shared").AgentTraceReadInput
      ) => Promise<import("@actspace/shared").AgentTraceReadResult>;
      getAgentAnalysisIndex?: (
        input: import("@actspace/shared").AgentAnalysisIndexInput
      ) => Promise<import("@actspace/shared").AgentAnalysisIndexResult>;
      clearAgentTraces?: (
        input: import("@actspace/shared").AgentTraceClearInput
      ) => Promise<import("@actspace/shared").AgentTraceClearResult>;
      selectFiles?: () => Promise<import("@actspace/shared").SelectFilesResult>;
      selectImages?: () => Promise<import("@actspace/shared").SelectImagesResult>;
      selectWorkspaceDirectory?: () => Promise<import("@actspace/shared").SelectWorkspaceDirectoryResult>;
      getPathForFile?: (file: File) => string;
      visualizeReply: (
        input: import("@actspace/shared").VisualizeReplyInput
      ) => Promise<import("@actspace/shared").VisualizeReplyResult>;
      listVisualizations: (
        input: import("@actspace/shared").ListVisualizationsInput
      ) => Promise<import("@actspace/shared").ListVisualizationsResult>;
      listWorkspaces?: () => Promise<import("@actspace/shared").WorkspaceListResult>;
      openWorkspaceInIde?: (
        input: import("@actspace/shared").WorkspaceIdInput
      ) => Promise<import("@actspace/shared").WorkspaceOpenInIdeResult>;
      setWorkspaceVisibility?: (
        input: import("@actspace/shared").WorkspaceVisibilityInput
      ) => Promise<import("@actspace/shared").WorkspaceVisibilityResult>;
      getWorkspaceGitContext?: (
        input: import("@actspace/shared").WorkspaceGitContextInput
      ) => Promise<import("@actspace/shared").WorkspaceGitContext>;
      createWorkspaceFolder?: (
        input: import("@actspace/shared").WorkspaceCreateFolderInput
      ) => Promise<import("@actspace/shared").WorkspaceCreateFolderResult>;
      listWorkspaceDir: (
        input: import("@actspace/shared").WorkspaceListDirInput
      ) => Promise<import("@actspace/shared").WorkspaceListDirResult>;
      readWorkspaceFile: (
        input: import("@actspace/shared").WorkspaceReadFileInput
      ) => Promise<import("@actspace/shared").WorkspaceReadFileResult>;
      /** 可选：浏览器 renderer 无 preload 时缺席，调用方必须先判存在再用。 */
      statWorkspaceFile?: (
        input: import("@actspace/shared").WorkspaceStatFileInput
      ) => Promise<import("@actspace/shared").WorkspaceStatFileResult>;
      readSessionArtifact?: (
        input: import("@actspace/shared").SessionArtifactReadInput
      ) => Promise<import("@actspace/shared").SessionArtifactReadResult>;
      showArtifactContextMenu?: (
        input: import("@actspace/shared").ArtifactContextMenuInput
      ) => Promise<import("@actspace/shared").ArtifactContextMenuResult>;
      initGitRepository: (
        input: import("@actspace/shared").ReviewInitGitInput
      ) => Promise<import("@actspace/shared").ReviewInitGitResult>;
      getReviewSnapshot?: (
        input: import("@actspace/shared").ReviewGetSnapshotInput
      ) => Promise<import("@actspace/shared").ReviewGetSnapshotResult>;
      refreshReviewSnapshot?: (
        input: import("@actspace/shared").ReviewGetSnapshotInput
      ) => Promise<import("@actspace/shared").ReviewGetSnapshotResult>;
      getReviewFileDiffs?: (
        input: import("@actspace/shared").ReviewGetFileDiffsInput
      ) => Promise<import("@actspace/shared").ReviewGetFileDiffsResult>;
      getReviewFileContents?: (
        input: import("@actspace/shared").ReviewGetFileContentsInput
      ) => Promise<import("@actspace/shared").ReviewGetFileContentsResult>;
      applyReviewMutation?: (
        input: import("@actspace/shared").ReviewApplyMutationInput
      ) => Promise<import("@actspace/shared").ReviewMutationResult>;
      setReviewFileViewed?: (
        input: import("@actspace/shared").ReviewSetFileViewedInput
      ) => Promise<import("@actspace/shared").ReviewSetFileViewedResult>;
      listReviewBranches?: (
        input: import("@actspace/shared").ReviewWorkspaceInput
      ) => Promise<import("@actspace/shared").ReviewListBranchesResult>;
      copyReviewGitApplyCommand?: (
        input: import("@actspace/shared").ReviewCopyApplyCommandInput
      ) => Promise<import("@actspace/shared").ReviewCopyApplyCommandResult>;
      getReviewPullRequestCapability?: (
        input: import("@actspace/shared").ReviewWorkspaceInput & { baseBranch?: string }
      ) => Promise<import("@actspace/shared").ReviewPullRequestCapabilityResult>;
      createReviewPullRequest?: (
        input: import("@actspace/shared").ReviewCreatePullRequestInput
      ) => Promise<import("@actspace/shared").ReviewCreatePullRequestResult>;
      onReviewChanged?: (
        callback: (notification: import("@actspace/shared").ReviewChangeNotification) => void
      ) => () => void;
      getWorkspaceEnvironment?: (
        input: import("@actspace/shared").WorkspaceEnvironmentGetInput
      ) => Promise<import("@actspace/shared").WorkspaceEnvironmentSnapshot>;
      createWorkspaceBranch?: (
        input: import("@actspace/shared").WorkspaceGitCreateBranchInput
      ) => Promise<import("@actspace/shared").WorkspaceGitMutationResult>;
      commitWorkspaceChanges?: (
        input: import("@actspace/shared").WorkspaceGitCommitInput
      ) => Promise<import("@actspace/shared").WorkspaceGitMutationResult>;
      pushWorkspaceBranch?: (
        input: import("@actspace/shared").WorkspaceGitPushInput
      ) => Promise<import("@actspace/shared").WorkspaceGitMutationResult>;
      commitAndPushWorkspaceChanges?: (
        input: import("@actspace/shared").WorkspaceGitCommitAndPushInput
      ) => Promise<import("@actspace/shared").WorkspaceGitMutationResult>;
      listWorkspaceOpenTools?: () => Promise<import("@actspace/shared").WorkspaceOpenToolsResult>;
      openWorkspaceInTool?: (
        input: import("@actspace/shared").WorkspaceOpenInput
      ) => Promise<import("@actspace/shared").WorkspaceOpenResult>;
      describeContext: (
        input: import("@actspace/shared").DescribeContextInput
      ) => Promise<import("@actspace/shared").ContextState | null>;
      listSessions: (
        input?: import("@actspace/shared").SessionListInput
      ) => Promise<import("@actspace/shared").SessionListItem[]>;
      getSession: (
        input: import("@actspace/shared").SessionGetInput
      ) => Promise<import("@actspace/shared").SessionRecord | null>;
      getSessionPreview?: (
        input: import("@actspace/shared").SessionPreviewInput
      ) => Promise<import("@actspace/shared").SessionPreviewResult | null>;
      getSubAgentTranscript?: (
        input: import("@actspace/shared").SubAgentTranscriptGetInput
      ) => Promise<import("@actspace/shared").SessionEvent[]>;
      getUsageStatistics: (
        input: import("@actspace/shared").UsageStatisticsGetInput
      ) => Promise<import("@actspace/shared").UsageStatisticsSnapshot | null>;
      getDeepSeekBalance: () => Promise<import("@actspace/shared").DeepSeekBalanceSnapshot>;
      getKimiBalance: () => Promise<import("@actspace/shared").KimiBalanceSnapshot>;
      getProviderBalance?: (
        input: import("@actspace/shared").ProviderBalanceGetInput
      ) => Promise<import("@actspace/shared").ProviderBalanceSnapshot>;
      createSession: (
        input?: import("@actspace/shared").SessionCreateInput
      ) => Promise<import("@actspace/shared").SessionRecord>;
      forkSession?: (
        input: import("@actspace/shared").SessionForkInput
      ) => Promise<import("@actspace/shared").SessionRecord>;
      pinSession: (
        input: import("@actspace/shared").SessionPinInput
      ) => Promise<import("@actspace/shared").SessionPinResult>;
      renameSession?: (
        input: import("@actspace/shared").SessionRenameInput
      ) => Promise<import("@actspace/shared").SessionRenameResult>;
      setSessionWorkspace?: (
        input: import("@actspace/shared").SessionWorkspaceInput
      ) => Promise<import("@actspace/shared").SessionWorkspaceResult>;
      archiveSession: (
        input: import("@actspace/shared").SessionArchiveInput
      ) => Promise<import("@actspace/shared").SessionArchiveResult>;
      archiveSessions?: (
        input: import("@actspace/shared").SessionArchiveManyInput
      ) => Promise<import("@actspace/shared").SessionArchiveManyResult>;
      createTerminal?: (
        input: import("@actspace/shared").TerminalCreateInput
      ) => Promise<import("@actspace/shared").TerminalSessionResult>;
      listTerminals?: (
        input: import("@actspace/shared").TerminalListInput
      ) => Promise<import("@actspace/shared").TerminalListResult>;
      attachTerminal?: (
        input: import("@actspace/shared").TerminalAttachInput
      ) => Promise<import("@actspace/shared").TerminalSessionResult>;
      detachTerminal?: (
        input: import("@actspace/shared").TerminalDetachInput
      ) => Promise<import("@actspace/shared").TerminalOperationResult>;
      writeTerminal?: (
        input: import("@actspace/shared").TerminalWriteInput
      ) => Promise<import("@actspace/shared").TerminalOperationResult>;
      resizeTerminal?: (
        input: import("@actspace/shared").TerminalResizeInput
      ) => Promise<import("@actspace/shared").TerminalOperationResult>;
      ackTerminal?: (
        input: import("@actspace/shared").TerminalAckInput
      ) => Promise<import("@actspace/shared").TerminalOperationResult>;
      closeTerminal?: (
        input: import("@actspace/shared").TerminalCloseInput
      ) => Promise<import("@actspace/shared").TerminalOperationResult>;
      onTerminalEvent?: (
        callback: (event: import("@actspace/shared").TerminalEvent) => void
      ) => () => void;
      onAgentStream: (
        callback: (event: import("@actspace/shared").RuntimeStreamEvent) => void
      ) => () => void;
      submitApproval: (
        input: import("@actspace/shared").ApprovalDecideInput
      ) => Promise<import("@actspace/shared").ApprovalDecideResult>;
      listPendingApprovals: (
        input?: import("@actspace/shared").ApprovalListPendingInput
      ) => Promise<import("@actspace/shared").PendingApprovalInfo[]>;
      getSettings: () => Promise<import("@actspace/shared").AppSettings>;
      readAgentSystemPrompt: () => Promise<import("@actspace/shared").AgentSystemPromptFile>;
      writeAgentSystemPrompt: (
        input: import("@actspace/shared").WriteAgentSystemPromptInput
      ) => Promise<import("@actspace/shared").AgentSystemPromptFile>;
      updateSettings: (
        input: import("@actspace/shared").SettingsUpdateInput
      ) => Promise<import("@actspace/shared").AppSettings>;
      setProviderKey: (
        input: import("@actspace/shared").SetProviderKeyInput
      ) => Promise<import("@actspace/shared").SetProviderKeyResult>;
      clearProviderKey: (
        input: import("@actspace/shared").ClearProviderKeyInput
      ) => Promise<import("@actspace/shared").ClearProviderKeyResult>;
      updateImageGeneration?: (
        input: import("@actspace/shared").UpdateImageGenerationSettingsInput
      ) => Promise<import("@actspace/shared").UpdateImageGenerationSettingsResult>;
      testProviderConnection: (
        input: import("@actspace/shared").TestConnectionInput
      ) => Promise<import("@actspace/shared").TestConnectionResult>;
      getSearchUsage?: () => Promise<import("@actspace/shared").SearchUsageResult>;
      listProviders?: () => Promise<import("@actspace/shared").ProvidersListResult>;
      connectProvider?: (input: import("@actspace/shared").ProviderConnectInput) => Promise<import("@actspace/shared").ProviderOperationResult>;
      updateProvider?: (input: import("@actspace/shared").ProviderUpdateInput) => Promise<import("@actspace/shared").ProviderOperationResult>;
      testProvider?: (input: import("@actspace/shared").ProviderIdInput) => Promise<import("@actspace/shared").ProviderTestResult>;
      disconnectProvider?: (input: import("@actspace/shared").ProviderIdInput) => Promise<import("@actspace/shared").ProviderOperationResult>;
      addProviderCredential?: (input: import("@actspace/shared").ProviderCredentialAddInput) => Promise<import("@actspace/shared").ProviderCredentialOperationResult>;
      updateProviderCredential?: (input: import("@actspace/shared").ProviderCredentialUpdateInput) => Promise<import("@actspace/shared").ProviderCredentialOperationResult>;
      testProviderCredential?: (input: import("@actspace/shared").ProviderCredentialInput) => Promise<import("@actspace/shared").ProviderCredentialOperationResult>;
      removeProviderCredential?: (input: import("@actspace/shared").ProviderCredentialInput) => Promise<import("@actspace/shared").ProviderCredentialOperationResult>;
      listInstalledModels?: () => Promise<import("@actspace/shared").ModelsListInstalledResult>;
      listUsableModels?: (input: import("@actspace/shared").ModelsListUsableInput) => Promise<import("@actspace/shared").ModelsListUsableResult>;
      listModelCatalog?: (input: import("@actspace/shared").ModelsCatalogListInput) => Promise<import("@actspace/shared").ModelsCatalogListResult>;
      reloadModelCatalog?: (input: import("@actspace/shared").ModelsCatalogListInput) => Promise<import("@actspace/shared").ModelsCatalogListResult>;
      addModel?: (input: import("@actspace/shared").ModelsAddInput) => Promise<import("@actspace/shared").ModelMutationResult>;
      updateModel?: (input: import("@actspace/shared").ModelsUpdateInput) => Promise<import("@actspace/shared").ModelMutationResult>;
      removeModel?: (input: import("@actspace/shared").ModelsRemoveInput) => Promise<import("@actspace/shared").ModelMutationResult>;
      updateTaskModels?: (input: import("@actspace/shared").TaskModelsUpdateInput) => Promise<import("@actspace/shared").TaskModelsUpdateResult>;
      updateKairosModel?: (input: import("@actspace/shared").KairosModelUpdateInput) => Promise<import("@actspace/shared").KairosModelUpdateResult>;
      getFsWatchStatus?: () => Promise<import("@actspace/shared").FsWatchStatus>;
      installFsWatchPlugin?: () => Promise<import("@actspace/shared").FsWatchInstallResult>;
      installFsWatchFromRepo?: () => Promise<import("@actspace/shared").FsWatchInstallResult>;
      pickPluginsRepoRoot?: () => Promise<import("@actspace/shared").FsWatchPickRootResult>;
      setFsWatchEnabled?: (
        input: import("@actspace/shared").FsWatchSetEnabledInput
      ) => Promise<import("@actspace/shared").FsWatchActionResult>;
      retryFsWatch?: () => Promise<import("@actspace/shared").FsWatchActionResult>;
      getFsWatchConfig?: () => Promise<import("@actspace/shared").FsWatchConfigView>;
      updateFsWatchConfig?: (
        input: import("@actspace/shared").FsWatchConfigUpdateInput
      ) => Promise<import("@actspace/shared").FsWatchConfigView>;
      pickFsWatchRoot?: () => Promise<import("@actspace/shared").FsWatchPickRootResult>;
      getBrowserBridgeStatus?: () => Promise<import("@actspace/shared").BrowserBridgeStatus>;
      installBrowserBridgeFromRepo?: () => Promise<import("@actspace/shared").BrowserBridgeInstallResult>;
      installBrowserBridgeNativeHost?: () => Promise<import("@actspace/shared").BrowserBridgeActionResult>;
      listSkills?: (
        input?: import("@actspace/shared").SkillListInput
      ) => Promise<import("@actspace/shared").SkillListResult>;
      installSkill?: () => Promise<import("@actspace/shared").SkillInstallResult>;
      uninstallSkill?: (
        input: import("@actspace/shared").SkillUninstallInput
      ) => Promise<import("@actspace/shared").SkillUninstallResult>;
      getLocalUpdateState?: () => Promise<import("@actspace/shared").LocalUpdateState>;
      selectLocalUpdateSource?: () => Promise<import("@actspace/shared").LocalUpdateSelectSourceResult>;
      startLocalUpdate?: () => Promise<import("@actspace/shared").LocalUpdateStartResult>;
      /** 整窗缩放（Electron webFrame.setZoomFactor）；外观设置的「界面字号」走这里。 */
      setUiZoom: (factor: number) => void;
      /** 主题三态同步原生 chrome（main nativeTheme.themeSource）。 */
      setNativeTheme: (mode: "light" | "dark" | "system") => void;
      /** 主进程优雅退出开始时触发，用于弹退出遮罩。返回取消订阅函数。 */
      onShuttingDown: (
        callback: (notice: import("@actspace/shared").AppShutdownNotice) => void
      ) => () => void;
    };
    /**
     * Kairos 自治模式 API。preload 在 `kairos` 命名空间下暴露；
     * 详细契约见 `@actspace/shared` 的 `KairosBridgeApi`。
     */
    kairos?: import("@actspace/shared").KairosBridgeApi;
  }
}
