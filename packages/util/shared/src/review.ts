export type ReviewSource = "git" | "session" | "snapshot" | "external";

export type ReviewSelection =
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

export type ReviewCapabilities = {
  canLoadFullFile: boolean;
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

export type ReviewChangeNotification = {
  workspaceId: string;
  generation: number;
  reason: "refresh";
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

export type ReviewCommit = {
  sha: string;
  subject: string;
  authoredAt: string;
};

export type ReviewListCommitsResult =
  | { ok: true; commits: ReviewCommit[] }
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
