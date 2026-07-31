export type ReviewSource = "git" | "session" | "snapshot" | "external";

export type ReviewSelection =
  | { kind: "lastTurn"; sessionId: string; turnId?: string }
  | { kind: "uncommitted" }
  | { kind: "unstaged" }
  | { kind: "staged" }
  | { kind: "commit"; sha: string }
  | { kind: "branch"; branch: string };

export type ReviewSelectionKind = ReviewSelection["kind"];

export type ReviewBaselineKind = "session-preview" | "git-ref" | "snapshot" | "empty-tree";

export type ReviewBaseline = {
  kind: ReviewBaselineKind;
  label: string;
  ref?: string;
};

export type ReviewTargetLabel = {
  label: string;
  ref?: string;
};

export type ReviewProviderStatus = "ready" | "empty" | "partial" | "notAvailable" | "noBaseline" | "failed";

export type ReviewFileStatus = "added" | "modified" | "deleted" | "renamed" | "copied" | "typeChanged";

export type ReviewFileSource = "turn" | "workingTree" | "index" | "commit" | "branch";

export type ReviewRenderKind = "text" | "image" | "binary";

export type ReviewWarningKind =
  | "truncated"
  | "binary_skipped"
  | "ignored_path"
  | "provider_failed"
  | "capped"
  | "stale"
  | "unsupported";

export type ReviewWarning = {
  kind: ReviewWarningKind;
  message: string;
  filePath?: string;
  omittedFiles?: number;
  omittedLines?: number;
};

export type ReviewMetrics = {
  files: number;
  additions: number;
  deletions: number;
  changedLines: number;
  estimatedChangedBytes: number;
};

export const REVIEW_LOAD_LIMITS = {
  fileCount: 128,
  changedLines: 9_000,
  changedBytes: 12 * 1024 * 1024,
} as const;

export type ReviewLoadPolicy = {
  mode: "all-files" | "single-file";
  reason?: "file-count" | "changed-lines" | "changed-bytes";
};

export type ReviewDiffQueryOptions = {
  ignoreWhitespaceChanges: boolean;
};

export type ReviewCapability =
  | "stageFile"
  | "stageHunk"
  | "unstageFile"
  | "unstageHunk"
  | "revertFile"
  | "revertHunk"
  | "loadFullFile"
  | "openFile"
  | "commit"
  | "push"
  | "createPullRequest";

export type ReviewCapabilities = {
  canStageFile: boolean;
  canStageHunk: boolean;
  canUnstageFile: boolean;
  canUnstageHunk: boolean;
  canRevertFile: boolean;
  canRevertHunk: boolean;
  canLoadFullFile: boolean;
  canOpenFile: boolean;
  canCommit: boolean;
  canPush: boolean;
  canCreatePullRequest: boolean;
  disabledReasons: Partial<Record<ReviewCapability, string>>;
};

export type ReviewFileSummary = {
  id: string;
  path: string;
  previousPath?: string;
  status: ReviewFileStatus;
  additions: number;
  deletions: number;
  binary: boolean;
  renderKind: ReviewRenderKind;
  source: ReviewFileSource;
  untracked?: boolean;
  diffLoadStatus: "idle" | "loading" | "ready" | "partial" | "failed";
  viewed: boolean;
  fingerprint: string;
};

export type ReviewWordDiff = {
  kind: "equal" | "addition" | "deletion";
  text: string;
};

export type ReviewLine = {
  id: string;
  kind: "context" | "addition" | "deletion" | "noNewline";
  oldLine?: number;
  newLine?: number;
  text: string;
  wordDiffs?: ReviewWordDiff[];
};

export type ReviewCollapsedContext = {
  before: number;
  after: number;
};

export type ReviewHunk = {
  id: string;
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: ReviewLine[];
  collapsed?: ReviewCollapsedContext;
  patchFingerprint: string;
};

export type ReviewFileDiff = {
  snapshotId: string;
  generation: number;
  fileId: string;
  path: string;
  previousPath?: string;
  hunks: ReviewHunk[];
  oldContentAvailable: boolean;
  newContentAvailable: boolean;
  partial: boolean;
  patchFingerprint: string;
  warning?: ReviewWarning;
};

export type ReviewSnapshot = {
  id: string;
  generation: number;
  workspaceId: string;
  workspaceRoot: string;
  repoRoot?: string;
  selection: ReviewSelection;
  baseline?: ReviewBaseline;
  target?: ReviewTargetLabel;
  comparison?: { from: string; to: string };
  status: ReviewProviderStatus;
  files: ReviewFileSummary[];
  totals: ReviewMetrics;
  capabilities: ReviewCapabilities;
  loadPolicy: ReviewLoadPolicy;
  queryOptions: ReviewDiffQueryOptions;
  generatedAt: string;
  warnings?: ReviewWarning[];
};

export type ReviewWorkspaceInput = {
  workspaceId?: string;
  workspaceRoot?: string;
  sessionId?: string;
};

export type ReviewGetSnapshotInput = ReviewWorkspaceInput & {
  selection: ReviewSelection;
  options?: Partial<ReviewDiffQueryOptions>;
};

export type ReviewGetSnapshotResult =
  | { ok: true; snapshot: ReviewSnapshot }
  | { ok: false; code: ReviewErrorCode; message: string };

export type ReviewGetFileDiffInput = ReviewWorkspaceInput & {
  snapshotId: string;
  expectedGeneration: number;
  fileId: string;
  contextLines?: number;
  loadFullFile?: boolean;
};

export type ReviewGetFileDiffResult =
  | { ok: true; diff: ReviewFileDiff }
  | { ok: false; code: ReviewErrorCode; message: string; currentGeneration?: number };

export type ReviewDiffRequest = {
  fileId: string;
  contextLines?: number;
};

export type ReviewFileDiffOutcome =
  | { fileId: string; status: "ready" | "partial"; diff: ReviewFileDiff }
  | { fileId: string; status: "failed"; code: ReviewErrorCode; message: string };

export type ReviewGetFileDiffsInput = ReviewWorkspaceInput & {
  snapshotId: string;
  expectedGeneration: number;
  requests: ReviewDiffRequest[];
};

export type ReviewGetFileDiffsResult =
  | { ok: true; outcomes: ReviewFileDiffOutcome[] }
  | { ok: false; code: ReviewErrorCode; message: string; currentGeneration?: number };

export type ReviewFileContentSide = {
  available: boolean;
  text?: string;
  bytes: number;
  partial: boolean;
};

export type ReviewFileContents = {
  snapshotId: string;
  generation: number;
  fileId: string;
  path: string;
  baseline: ReviewFileContentSide;
  target: ReviewFileContentSide;
  warning?: ReviewWarning;
};

export type ReviewGetFileContentsInput = ReviewWorkspaceInput & {
  snapshotId: string;
  expectedGeneration: number;
  fileIds: string[];
};

export type ReviewFileContentsOutcome =
  | { fileId: string; status: "ready" | "partial"; contents: ReviewFileContents }
  | { fileId: string; status: "failed"; code: ReviewErrorCode; message: string };

export type ReviewGetFileContentsResult =
  | { ok: true; outcomes: ReviewFileContentsOutcome[] }
  | { ok: false; code: ReviewErrorCode; message: string; currentGeneration?: number };

export type ReviewMutationAction = "stage" | "unstage" | "revert";
export type ReviewMutationScope = "section" | "file" | "hunk";

export type ReviewMutation = {
  snapshotId: string;
  expectedGeneration: number;
  action: ReviewMutationAction;
  scope: ReviewMutationScope;
  source: "workingTree" | "index";
  path?: string;
  hunkId?: string;
  patchFingerprint?: string;
};

export type ReviewMutationStep = {
  id: string;
  status: "completed" | "failed";
  message?: string;
};

export type ReviewMutationResult = {
  status: "success" | "partialSuccess" | "stale" | "rejected" | "failed";
  generation: number;
  completedSteps: ReviewMutationStep[];
  failedSteps: ReviewMutationStep[];
  message?: string;
};

export type ReviewApplyMutationInput = ReviewWorkspaceInput & {
  mutation: ReviewMutation;
};

export type ReviewSetFileViewedInput = ReviewWorkspaceInput & {
  snapshotId: string;
  expectedGeneration: number;
  fileId: string;
  viewed: boolean;
};

export type ReviewSetFileViewedResult =
  | { ok: true; viewed: boolean }
  | { ok: false; code: ReviewErrorCode; message: string; currentGeneration?: number };

export type ReviewPullRequestCapability = {
  enabled: boolean;
  reason?: "gh_missing" | "not_github" | "not_authenticated" | "detached_head" | "no_upstream" | "existing_pull_request" | "not_repository";
  message?: string;
  currentBranch?: string;
  baseBranch?: string;
  existingUrl?: string;
};

export type ReviewPullRequestCapabilityResult =
  | { ok: true; capability: ReviewPullRequestCapability }
  | { ok: false; code: ReviewErrorCode; message: string };

export type ReviewCreatePullRequestInput = ReviewWorkspaceInput & {
  title: string;
  body: string;
  baseBranch: string;
  draft: boolean;
};

export type ReviewCreatePullRequestResult =
  | { ok: true; url: string; alreadyExisted: boolean }
  | { ok: false; code: ReviewErrorCode | "pull_request_unavailable"; message: string };

export type ReviewChangeNotification = {
  workspaceId: string;
  generation: number;
  reason: "refresh" | "mutation" | "workspace" | "git" | "watch";
};

export type ReviewBranch = {
  branch: string;
  upstream: string;
  current: boolean;
  ahead: number;
  behind: number;
};

export type ReviewListBranchesResult =
  | { ok: true; branches: ReviewBranch[] }
  | { ok: false; code: ReviewErrorCode; message: string };

export type ReviewCopyApplyCommandInput = ReviewWorkspaceInput & {
  snapshotId: string;
  expectedGeneration: number;
};

export type ReviewCopyApplyCommandResult =
  | { ok: true; command: string; patchPath: string }
  | { ok: false; code: ReviewErrorCode; message: string };

export type ReviewErrorCode =
  | "invalid_workspace"
  | "not_a_repository"
  | "git_not_found"
  | "unsupported_scope"
  | "invalid_selection"
  | "snapshot_not_found"
  | "file_not_found"
  | "stale_generation"
  | "invalid_path"
  | "invalid_range"
  | "command_failed"
  | "cancelled";

export type ReviewInitGitInput = {
  workspaceRoot?: string;
};

export type ReviewInitGitResult = {
  ok: boolean;
  alreadyRepository?: boolean;
  workspaceRoot: string;
  error?: "git_not_found" | "command_failed" | "invalid_workspace";
  message?: string;
};
