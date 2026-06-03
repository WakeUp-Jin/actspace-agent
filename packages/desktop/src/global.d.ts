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
      createSession: (
        input?: import("@actspace/shared").SessionCreateInput
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
      testProviderConnection: (
        input: import("@actspace/shared").TestConnectionInput
      ) => Promise<import("@actspace/shared").TestConnectionResult>;
      getLocalUpdateState?: () => Promise<import("@actspace/shared").LocalUpdateState>;
      selectLocalUpdateSource?: () => Promise<import("@actspace/shared").LocalUpdateSelectSourceResult>;
      startLocalUpdate?: () => Promise<import("@actspace/shared").LocalUpdateStartResult>;
      /** 整窗缩放（Electron webFrame.setZoomFactor）；外观设置的「界面字号」走这里。 */
      setUiZoom: (factor: number) => void;
      /** 主题三态同步原生 chrome（main nativeTheme.themeSource）。 */
      setNativeTheme: (mode: "light" | "dark" | "system") => void;
      /** 主进程优雅退出开始时触发，用于弹「Kairos 正在关闭」遮罩。返回取消订阅函数。 */
      onShuttingDown: (callback: () => void) => () => void;
    };
    /**
     * Kairos 自治模式 API。preload 在 `kairos` 命名空间下暴露；
     * 详细契约见 `@actspace/shared` 的 `KairosBridgeApi`。
     */
    kairos?: import("@actspace/shared").KairosBridgeApi;
  }
}
