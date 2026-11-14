// 工作区与本地 Git IPC（`workspace.*`、`workspaceGit.*`）：工作区注册表、顶部 Environment、
// 分支 / 提交 / 推送、用外部工具打开目录。工作区内文件的读写见 `./workspace-files`。

export type GitBranchItem = {
  name: string;
  current: boolean;
  /** 存在时表示该 branch 已被某个 worktree checkout。 */
  checkedOutPath?: string;
};

export type WorkspaceGitContextStatus = "ready" | "not_repository" | "no_head" | "git_not_found" | "failed";

export type WorkspaceGitContextInput = {
  workspaceRoot?: string;
};

export type WorkspaceGitContext = {
  status: WorkspaceGitContextStatus;
  workspaceRoot: string;
  repositoryRoot?: string;
  currentBranch?: string;
  detachedCommit?: string;
  headCommit?: string;
  branches: GitBranchItem[];
  error?: string;
};

export type WorkspaceCreateFolderInput = {
  parentRoot: string;
  name: string;
};

export type WorkspaceCreateFolderResult =
  | { ok: true; workspaceId: string; workspaceRoot: string }
  | { ok: false; error: string };

// ─── 顶部 Environment 与本地 Git 操作 ───

export type WorkspaceEnvironmentGetInput = {
  workspaceRoot?: string;
};

export type WorkspaceEnvironmentSnapshot = {
  workspaceRoot: string;
  workspaceLabel: string;
  locationKind: "this_mac" | "worktree";
  git: {
    available: boolean;
    repository: boolean;
    branch?: string;
    branches: GitBranchItem[];
    detached: boolean;
    hasHead: boolean;
    upstream?: string;
    remotes: string[];
  };
};

export type WorkspaceGitErrorCode =
  | "invalid_workspace"
  | "git_not_found"
  | "not_repository"
  | "detached_head"
  | "invalid_branch"
  | "branch_checked_out"
  | "nothing_to_commit"
  | "remote_required"
  | "no_remote"
  | "command_failed";

export type WorkspaceGitCreateBranchInput = {
  workspaceRoot?: string;
  branchName: string;
};

export type WorkspaceGitSwitchBranchInput = {
  workspaceRoot?: string;
  branchName: string;
};

export type WorkspaceGitCommitInput = {
  workspaceRoot?: string;
  message?: string;
  includeUnstagedChanges?: boolean;
  branchName?: string;
};

export type WorkspaceGitPushInput = {
  workspaceRoot?: string;
  remote?: string;
};

export type WorkspaceGitCommitAndPushInput = WorkspaceGitCommitInput & {
  remote?: string;
};

export type WorkspaceGitMutationResult = {
  ok: boolean;
  action: "create_branch" | "switch_branch" | "commit" | "push" | "commit_and_push";
  phase: "branch" | "commit" | "push";
  workspaceRoot: string;
  branch?: string;
  branchCreated?: boolean;
  commitCreated?: boolean;
  commitHash?: string;
  pushed?: boolean;
  remote?: string;
  upstreamSet?: boolean;
  remotes?: string[];
  error?: WorkspaceGitErrorCode;
  message?: string;
};

export type WorkspaceOpenToolId = "vscode" | "cursor" | "finder" | "terminal" | "iterm2";

export type WorkspaceOpenTool = {
  id: WorkspaceOpenToolId;
  label: string;
  available: boolean;
  iconDataUrl?: string;
};

export type WorkspaceOpenToolsResult = {
  tools: WorkspaceOpenTool[];
};

export type WorkspaceOpenInput = {
  workspaceRoot?: string;
  toolId: WorkspaceOpenToolId;
  /**
   * 要打开的目标（相对 workspaceRoot）；不传则打开根目录本身。
   *
   * 越界路径按 `escapes_root` 拒绝——这个入口来自右侧面板的可点 UI，
   * 和文件浏览器同一条边界，不能因为「只是调用 /usr/bin/open」就放开整盘。
   */
  relativePath?: string;
};

export type WorkspaceOpenResult = {
  ok: boolean;
  workspaceRoot: string;
  toolId: WorkspaceOpenToolId;
  /** 回显实际打开的相对路径；打开根目录时为 undefined。 */
  relativePath?: string;
  error?: "invalid_workspace" | "unsupported_platform" | "not_installed" | "open_failed" | "escapes_root";
  message?: string;
};

// ─── 工作区注册表 ───

export type WorkspaceEntryKind = "folder";

export type WorkspaceEntry = {
  id: string;
  kind: WorkspaceEntryKind;
  label: string;
  path: string;
  hidden?: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceRegistry = {
  version: 1;
  items: WorkspaceEntry[];
};

export type WorkspaceListResult = WorkspaceRegistry;

export type WorkspaceIdInput = {
  workspaceId: string;
};

export type WorkspaceOpenInIdeResult = {
  ok: boolean;
  error?: "workspace_not_found" | "workspace_hidden" | "directory_not_found" | "open_failed";
};

export type WorkspaceVisibilityInput = WorkspaceIdInput & {
  hidden: boolean;
};

export type WorkspaceVisibilityResult = {
  ok: boolean;
  error?: "workspace_not_found";
};
