export {};

declare global {
  interface Window {
    actspace: {
      getBootstrapState: () => Promise<import("@actspace/shared").BootstrapState>;
      runTurn: (
        input: import("@actspace/shared").RunTurnInput
      ) => Promise<import("@actspace/shared").AgentTurnResult>;
      abortTurn: (
        input: import("@actspace/shared").AbortTurnInput
      ) => Promise<boolean>;
      visualizeReply: (
        input: import("@actspace/shared").VisualizeReplyInput
      ) => Promise<import("@actspace/shared").VisualizeReplyResult>;
      listVisualizations: (
        input: import("@actspace/shared").ListVisualizationsInput
      ) => Promise<import("@actspace/shared").ListVisualizationsResult>;
      describeContext: (
        input: import("@actspace/shared").DescribeContextInput
      ) => Promise<import("@actspace/shared").ContextState | null>;
      listSessions: () => Promise<import("@actspace/shared").SessionListItem[]>;
      getSession: (
        input: import("@actspace/shared").SessionGetInput
      ) => Promise<import("@actspace/shared").SessionRecord | null>;
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
      /** 整窗缩放（Electron webFrame.setZoomFactor）；外观设置的「界面字号」走这里。 */
      setUiZoom: (factor: number) => void;
      /** 主题三态同步原生 chrome（main nativeTheme.themeSource）。 */
      setNativeTheme: (mode: "light" | "dark" | "system") => void;
    };
    /**
     * Kairos 自治模式 API。preload 在 `kairos` 命名空间下暴露；
     * 详细契约见 `@actspace/shared` 的 `KairosBridgeApi`。
     */
    kairos?: import("@actspace/shared").KairosBridgeApi;
  }
}
