export {};

declare global {
  interface Window {
    actspace: {
      getBootstrapState: () => Promise<import("@actspace/shared").BootstrapState>;
      runTurn: (
        input: import("@actspace/shared").RunTurnInput
      ) => Promise<import("@actspace/shared").AgentTurnResult>;
      compactContext: (
        input: import("@actspace/shared").CompactContextInput
      ) => Promise<import("@actspace/shared").CompactContextResult>;
      generateEvalCandidate?: (
        input: import("@actspace/shared").GenerateEvalCandidateInput
      ) => Promise<import("@actspace/shared").GenerateEvalCandidateResult>;
      abortTurn: (
        input: import("@actspace/shared").AbortTurnInput
      ) => Promise<boolean>;
      selectFiles?: () => Promise<import("@actspace/shared").SelectFilesResult>;
      selectWorkspaceDirectory?: () => Promise<import("@actspace/shared").SelectWorkspaceDirectoryResult>;
      getPathForFile?: (file: File) => string;
      visualizeReply: (
        input: import("@actspace/shared").VisualizeReplyInput
      ) => Promise<import("@actspace/shared").VisualizeReplyResult>;
      listVisualizations: (
        input: import("@actspace/shared").ListVisualizationsInput
      ) => Promise<import("@actspace/shared").ListVisualizationsResult>;
      listWorkspaces?: () => Promise<import("@actspace/shared").WorkspaceListResult>;
      listWorkspaceDir: (
        input: import("@actspace/shared").WorkspaceListDirInput
      ) => Promise<import("@actspace/shared").WorkspaceListDirResult>;
      readWorkspaceFile: (
        input: import("@actspace/shared").WorkspaceReadFileInput
      ) => Promise<import("@actspace/shared").WorkspaceReadFileResult>;
      readSessionArtifact?: (
        input: import("@actspace/shared").SessionArtifactReadInput
      ) => Promise<import("@actspace/shared").SessionArtifactReadResult>;
      showArtifactContextMenu?: (
        input: import("@actspace/shared").ArtifactContextMenuInput
      ) => Promise<import("@actspace/shared").ArtifactContextMenuResult>;
      getWorkspaceReview: (
        input: import("@actspace/shared").ReviewGetWorkspaceChangesInput
      ) => Promise<import("@actspace/shared").ReviewGetWorkspaceChangesResult>;
      initGitRepository: (
        input: import("@actspace/shared").ReviewInitGitInput
      ) => Promise<import("@actspace/shared").ReviewInitGitResult>;
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
      listSkills?: () => Promise<import("@actspace/shared").SkillListResult>;
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
