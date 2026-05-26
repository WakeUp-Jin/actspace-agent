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
      listSessions: () => Promise<import("@actspace/shared").SessionListItem[]>;
      getSession: (
        input: import("@actspace/shared").SessionGetInput
      ) => Promise<import("@actspace/shared").SessionRecord | null>;
      createSession: (
        input?: import("@actspace/shared").SessionCreateInput
      ) => Promise<import("@actspace/shared").SessionRecord>;
      onAgentStream: (
        callback: (event: import("@actspace/shared").RuntimeStreamEvent) => void
      ) => () => void;
      submitApproval: (
        input: import("@actspace/shared").ApprovalDecideInput
      ) => Promise<import("@actspace/shared").ApprovalDecideResult>;
      listPendingApprovals: (
        input?: import("@actspace/shared").ApprovalListPendingInput
      ) => Promise<import("@actspace/shared").PendingApprovalInfo[]>;
    };
  }
}
