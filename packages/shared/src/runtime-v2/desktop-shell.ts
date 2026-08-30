import type {
  WorkspaceListDirInput,
  WorkspaceListDirResult,
  WorkspaceListResult,
  WorkspaceReadFileInput,
  WorkspaceReadFileResult,
  WorkspaceStatFileInput,
  WorkspaceStatFileResult,
} from "../ipc";
import type {
  ReviewApplyMutationInput,
  ReviewChangeNotification,
  ReviewGetFileContentsInput,
  ReviewGetFileContentsResult,
  ReviewGetFileDiffsInput,
  ReviewGetFileDiffsResult,
  ReviewGetSnapshotInput,
  ReviewGetSnapshotResult,
  ReviewMutationResult,
  ReviewSetFileViewedInput,
  ReviewSetFileViewedResult,
} from "../review";
import type {
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
} from "../ipc";

export const RUNTIME_V2_DESKTOP_SHELL_CHANNELS = Object.freeze({
  capabilities: "runtime-v2:shell:get-capabilities",
  listWorkspaces: "runtime-v2:shell:list-workspaces",
  listWorkspaceDir: "runtime-v2:shell:list-workspace-dir",
  readWorkspaceFile: "runtime-v2:shell:read-workspace-file",
  statWorkspaceFile: "runtime-v2:shell:stat-workspace-file",
  getReviewSnapshot: "runtime-v2:shell:get-review-snapshot",
  refreshReviewSnapshot: "runtime-v2:shell:refresh-review-snapshot",
  getReviewFileDiffs: "runtime-v2:shell:get-review-file-diffs",
  getReviewFileContents: "runtime-v2:shell:get-review-file-contents",
  applyReviewMutation: "runtime-v2:shell:apply-review-mutation",
  setReviewFileViewed: "runtime-v2:shell:set-review-file-viewed",
  reviewChanged: "runtime-v2:shell:review-changed",
  terminalCreate: "runtime-v2:shell:terminal-create",
  terminalList: "runtime-v2:shell:terminal-list",
  terminalAttach: "runtime-v2:shell:terminal-attach",
  terminalDetach: "runtime-v2:shell:terminal-detach",
  terminalWrite: "runtime-v2:shell:terminal-write",
  terminalResize: "runtime-v2:shell:terminal-resize",
  terminalAck: "runtime-v2:shell:terminal-ack",
  terminalClose: "runtime-v2:shell:terminal-close",
  terminalEvent: "runtime-v2:shell:terminal-event",
} as const);

export type RuntimeV2DesktopShellCapabilities = {
  readonly workspace: { readonly available: true };
  readonly review: { readonly available: true };
  readonly terminal: {
    readonly available: boolean;
    readonly reason: string | null;
  };
};

export type RuntimeV2DesktopShellBridge = {
  getCapabilities(): Promise<RuntimeV2DesktopShellCapabilities>;
  listWorkspaces(): Promise<WorkspaceListResult>;
  listWorkspaceDir(input: WorkspaceListDirInput): Promise<WorkspaceListDirResult>;
  readWorkspaceFile(input: WorkspaceReadFileInput): Promise<WorkspaceReadFileResult>;
  statWorkspaceFile(input: WorkspaceStatFileInput): Promise<WorkspaceStatFileResult>;
  getReviewSnapshot(input: ReviewGetSnapshotInput): Promise<ReviewGetSnapshotResult>;
  refreshReviewSnapshot(input: ReviewGetSnapshotInput): Promise<ReviewGetSnapshotResult>;
  getReviewFileDiffs(input: ReviewGetFileDiffsInput): Promise<ReviewGetFileDiffsResult>;
  getReviewFileContents(input: ReviewGetFileContentsInput): Promise<ReviewGetFileContentsResult>;
  applyReviewMutation(input: ReviewApplyMutationInput): Promise<ReviewMutationResult>;
  setReviewFileViewed(input: ReviewSetFileViewedInput): Promise<ReviewSetFileViewedResult>;
  createTerminal(input: TerminalCreateInput): Promise<TerminalSessionResult>;
  listTerminals(input: TerminalListInput): Promise<TerminalListResult>;
  attachTerminal(input: TerminalAttachInput): Promise<TerminalSessionResult>;
  detachTerminal(input: TerminalDetachInput): Promise<TerminalOperationResult>;
  writeTerminal(input: TerminalWriteInput): Promise<TerminalOperationResult>;
  resizeTerminal(input: TerminalResizeInput): Promise<TerminalOperationResult>;
  ackTerminal(input: TerminalAckInput): Promise<TerminalOperationResult>;
  closeTerminal(input: TerminalCloseInput): Promise<TerminalOperationResult>;
  onTerminalEvent(listener: (event: TerminalEvent) => void): () => void;
  onReviewChanged(listener: (notification: ReviewChangeNotification) => void): () => void;
};
