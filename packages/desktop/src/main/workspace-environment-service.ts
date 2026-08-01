import { execFile } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type {
  WorkspaceEnvironmentGetInput,
  WorkspaceEnvironmentSnapshot,
  WorkspaceGitCommitAndPushInput,
  WorkspaceGitCommitInput,
  WorkspaceGitCreateBranchInput,
  WorkspaceGitMutationResult,
  WorkspaceGitPushInput,
} from "@actspace/shared";
import type { AppDataRoots } from "./agent-run";

const GIT_TIMEOUT_MS = 15_000;
const GIT_PUSH_TIMEOUT_MS = 30_000;
const GIT_MAX_OUTPUT_CHARS = 256 * 1024;
const DEFAULT_COMMIT_MESSAGE = "Update workspace changes";

export type WorkspaceGitCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
  startError?: string;
};

export type WorkspaceGitCommandRunner = (
  args: string[],
  options: { cwd: string; timeoutMs: number; maxOutputChars: number },
) => Promise<WorkspaceGitCommandResult>;

type ResolvedWorkspace =
  | { ok: true; workspaceRoot: string }
  | { ok: false; workspaceRoot: string; message: string };

type GitRepositoryState = {
  available: boolean;
  repository: boolean;
  branch?: string;
  detached: boolean;
  hasHead: boolean;
  upstream?: string;
  remotes: string[];
  locationKind: "this_mac" | "worktree";
};

type PushTarget =
  | { ok: true; branch: string; remote?: string; useUpstream: boolean }
  | {
      ok: false;
      branch?: string;
      error: "git_not_found" | "not_repository" | "detached_head" | "remote_required" | "no_remote" | "command_failed";
      message: string;
      remotes?: string[];
    };

export async function getWorkspaceEnvironment(
  input: WorkspaceEnvironmentGetInput,
  roots: AppDataRoots,
  runner: WorkspaceGitCommandRunner = runGitCommand,
): Promise<WorkspaceEnvironmentSnapshot> {
  const workspace = await resolveWorkspace(input.workspaceRoot, roots);
  if (workspace.ok === false) {
    throw new Error(workspace.message);
  }

  const git = await readGitRepositoryState(workspace.workspaceRoot, runner);
  return {
    workspaceRoot: workspace.workspaceRoot,
    workspaceLabel: basename(workspace.workspaceRoot) || workspace.workspaceRoot,
    locationKind: git.locationKind,
    git: {
      available: git.available,
      repository: git.repository,
      branch: git.branch,
      detached: git.detached,
      hasHead: git.hasHead,
      upstream: git.upstream,
      remotes: git.remotes,
    },
  };
}

export async function createWorkspaceBranch(
  input: WorkspaceGitCreateBranchInput,
  roots: AppDataRoots,
  runner: WorkspaceGitCommandRunner = runGitCommand,
): Promise<WorkspaceGitMutationResult> {
  const workspace = await resolveWorkspace(input.workspaceRoot, roots);
  if (workspace.ok === false) {
    return mutationFailure("create_branch", "branch", workspace.workspaceRoot, "invalid_workspace", workspace.message);
  }

  const branchName = input.branchName.trim();
  if (!branchName) {
    return mutationFailure("create_branch", "branch", workspace.workspaceRoot, "invalid_branch", "Branch name is required.");
  }

  const state = await readGitRepositoryState(workspace.workspaceRoot, runner);
  if (!state.available) {
    return mutationFailure("create_branch", "branch", workspace.workspaceRoot, "git_not_found", "Git is not available on this Mac.");
  }
  if (!state.repository) {
    return mutationFailure("create_branch", "branch", workspace.workspaceRoot, "not_repository", "Current workspace is not a Git repository.");
  }

  const validation = await runGit(runner, ["check-ref-format", "--branch", branchName], workspace.workspaceRoot);
  if (!isSuccess(validation)) {
    return mutationFailure("create_branch", "branch", workspace.workspaceRoot, "invalid_branch", "Branch name is not valid.");
  }

  const created = await runGit(runner, ["switch", "-c", branchName], workspace.workspaceRoot);
  if (!isSuccess(created)) {
    return mutationFailure("create_branch", "branch", workspace.workspaceRoot, gitMissing(created) ? "git_not_found" : "command_failed", sanitizeGitError(created, workspace.workspaceRoot));
  }

  return {
    ok: true,
    action: "create_branch",
    phase: "branch",
    workspaceRoot: workspace.workspaceRoot,
    branch: branchName,
  };
}

export async function commitWorkspaceChanges(
  input: WorkspaceGitCommitInput,
  roots: AppDataRoots,
  runner: WorkspaceGitCommandRunner = runGitCommand,
): Promise<WorkspaceGitMutationResult> {
  const workspace = await resolveWorkspace(input.workspaceRoot, roots);
  if (workspace.ok === false) {
    return mutationFailure("commit", "commit", workspace.workspaceRoot, "invalid_workspace", workspace.message);
  }
  return commitChangesInWorkspace(workspace.workspaceRoot, input, "commit", runner);
}

export async function pushWorkspaceBranch(
  input: WorkspaceGitPushInput,
  roots: AppDataRoots,
  runner: WorkspaceGitCommandRunner = runGitCommand,
): Promise<WorkspaceGitMutationResult> {
  const workspace = await resolveWorkspace(input.workspaceRoot, roots);
  if (workspace.ok === false) {
    return mutationFailure("push", "push", workspace.workspaceRoot, "invalid_workspace", workspace.message);
  }

  const target = await resolvePushTarget(workspace.workspaceRoot, input.remote, runner);
  if (target.ok === false) {
    return {
      ...mutationFailure("push", "push", workspace.workspaceRoot, target.error, target.message),
      branch: target.branch,
      remotes: target.remotes,
    };
  }
  return pushResolvedTarget(workspace.workspaceRoot, target, "push", runner);
}

export async function commitAndPushWorkspaceChanges(
  input: WorkspaceGitCommitAndPushInput,
  roots: AppDataRoots,
  runner: WorkspaceGitCommandRunner = runGitCommand,
): Promise<WorkspaceGitMutationResult> {
  const workspace = await resolveWorkspace(input.workspaceRoot, roots);
  if (workspace.ok === false) {
    return mutationFailure("commit_and_push", "commit", workspace.workspaceRoot, "invalid_workspace", workspace.message);
  }

  const branchName = input.branchName?.trim();
  if (branchName) {
    const validation = await validateBranchName(workspace.workspaceRoot, branchName, runner);
    if (validation.ok === false) {
      return mutationFailure("commit_and_push", "branch", workspace.workspaceRoot, validation.error, validation.message);
    }
  }

  // Remote selection is resolved before branch creation or commit so a multi-remote
  // repository cannot mutate local history before the user chooses a destination.
  const target = await resolvePushTarget(workspace.workspaceRoot, input.remote, runner, branchName);
  if (target.ok === false) {
    return {
      ...mutationFailure("commit_and_push", "push", workspace.workspaceRoot, target.error, target.message),
      branch: target.branch,
      remotes: target.remotes,
    };
  }

  const commit = await commitChangesInWorkspace(workspace.workspaceRoot, input, "commit_and_push", runner);
  if (!commit.ok) return commit;

  const pushed = await pushResolvedTarget(workspace.workspaceRoot, target, "commit_and_push", runner);
  return {
    ...pushed,
    branchCreated: commit.branchCreated,
    commitCreated: true,
    commitHash: commit.commitHash,
  };
}

async function commitChangesInWorkspace(
  workspaceRoot: string,
  input: WorkspaceGitCommitInput,
  action: "commit" | "commit_and_push",
  runner: WorkspaceGitCommandRunner,
): Promise<WorkspaceGitMutationResult> {
  const message = input.message?.trim() || DEFAULT_COMMIT_MESSAGE;
  const includeUnstagedChanges = input.includeUnstagedChanges !== false;
  const branchName = input.branchName?.trim();

  const state = await readGitRepositoryState(workspaceRoot, runner);
  if (!state.available) {
    return mutationFailure(action, "commit", workspaceRoot, "git_not_found", "Git is not available on this Mac.");
  }
  if (!state.repository) {
    return mutationFailure(action, "commit", workspaceRoot, "not_repository", "Current workspace is not a Git repository.");
  }
  if (branchName) {
    const validation = await validateBranchName(workspaceRoot, branchName, runner);
    if (validation.ok === false) {
      return mutationFailure(action, "branch", workspaceRoot, validation.error, validation.message);
    }
  } else if (!state.branch) {
    return mutationFailure(action, "commit", workspaceRoot, "detached_head", "Create a branch before committing changes.");
  }

  const statusArgs = includeUnstagedChanges
    ? ["status", "--porcelain=v1", "--", "."]
    : ["diff", "--cached", "--name-only", "--", "."];
  const status = await runGit(runner, statusArgs, workspaceRoot);
  if (!isSuccess(status)) {
    return mutationFailure(action, "commit", workspaceRoot, gitMissing(status) ? "git_not_found" : "command_failed", sanitizeGitError(status, workspaceRoot));
  }
  if (!status.stdout.trim()) {
    return mutationFailure(action, "commit", workspaceRoot, "nothing_to_commit", "No workspace changes to commit.");
  }

  let branchCreated = false;
  const commitBranch = branchName || state.branch!;
  if (branchName) {
    const created = await runGit(runner, ["switch", "-c", branchName], workspaceRoot);
    if (!isSuccess(created)) {
      return mutationFailure(action, "branch", workspaceRoot, gitMissing(created) ? "git_not_found" : "command_failed", sanitizeGitError(created, workspaceRoot));
    }
    branchCreated = true;
  }

  if (includeUnstagedChanges) {
    const added = await runGit(runner, ["add", "-A", "--", "."], workspaceRoot);
    if (!isSuccess(added)) {
      return mutationFailure(action, "commit", workspaceRoot, gitMissing(added) ? "git_not_found" : "command_failed", sanitizeGitError(added, workspaceRoot), {
        branch: commitBranch,
        branchCreated,
      });
    }
  }

  const committed = await runGit(runner, ["commit", "-m", message], workspaceRoot);
  if (!isSuccess(committed)) {
    return mutationFailure(action, "commit", workspaceRoot, gitMissing(committed) ? "git_not_found" : "command_failed", sanitizeGitError(committed, workspaceRoot), {
      branch: commitBranch,
      branchCreated,
    });
  }

  const hash = await runGit(runner, ["rev-parse", "--short", "HEAD"], workspaceRoot);
  return {
    ok: true,
    action,
    phase: "commit",
    workspaceRoot,
    branch: commitBranch,
    branchCreated,
    commitCreated: true,
    commitHash: isSuccess(hash) ? hash.stdout.trim() : undefined,
  };
}

async function resolvePushTarget(
  workspaceRoot: string,
  requestedRemote: string | undefined,
  runner: WorkspaceGitCommandRunner,
  branchOverride?: string,
): Promise<PushTarget> {
  const state = await readGitRepositoryState(workspaceRoot, runner);
  if (!state.repository) {
    return {
      ok: false,
      error: state.available ? "not_repository" : "git_not_found",
      message: state.available ? "Current workspace is not a Git repository." : "Git is not available on this Mac.",
    };
  }
  const branch = branchOverride || state.branch;
  if (!branch) {
    return { ok: false, error: "detached_head", message: "Create a branch before pushing changes." };
  }

  const remote = requestedRemote?.trim();
  if (remote) {
    if (!state.remotes.includes(remote)) {
      return {
        ok: false,
        branch,
        error: "command_failed",
        message: "Selected Git remote is no longer available.",
        remotes: state.remotes,
      };
    }
    return { ok: true, branch, remote, useUpstream: false };
  }
  if (!branchOverride && state.upstream) {
    return { ok: true, branch, useUpstream: true };
  }
  if (state.remotes.length === 0) {
    return { ok: false, branch, error: "no_remote", message: "No Git remote is configured." };
  }
  if (state.remotes.length > 1) {
    return {
      ok: false,
      branch,
      error: "remote_required",
      message: "Choose a Git remote before pushing.",
      remotes: state.remotes,
    };
  }
  return { ok: true, branch, remote: state.remotes[0], useUpstream: false };
}

async function validateBranchName(
  workspaceRoot: string,
  branchName: string,
  runner: WorkspaceGitCommandRunner,
): Promise<{ ok: true } | { ok: false; error: "git_not_found" | "invalid_branch"; message: string }> {
  const validation = await runGit(runner, ["check-ref-format", "--branch", branchName], workspaceRoot);
  if (isSuccess(validation)) return { ok: true };
  if (gitMissing(validation)) return { ok: false, error: "git_not_found", message: "Git is not available on this Mac." };
  return { ok: false, error: "invalid_branch", message: "Branch name is not valid." };
}

async function pushResolvedTarget(
  workspaceRoot: string,
  target: Extract<PushTarget, { ok: true }>,
  action: "push" | "commit_and_push",
  runner: WorkspaceGitCommandRunner,
): Promise<WorkspaceGitMutationResult> {
  const args = target.useUpstream ? ["push"] : ["push", "-u", target.remote!, target.branch];
  const pushed = await runGit(runner, args, workspaceRoot, GIT_PUSH_TIMEOUT_MS);
  if (!isSuccess(pushed)) {
    return mutationFailure(action, "push", workspaceRoot, gitMissing(pushed) ? "git_not_found" : "command_failed", sanitizeGitError(pushed, workspaceRoot), {
      branch: target.branch,
      remote: target.remote,
    });
  }
  return {
    ok: true,
    action,
    phase: "push",
    workspaceRoot,
    branch: target.branch,
    pushed: true,
    remote: target.remote,
    upstreamSet: !target.useUpstream,
  };
}

async function readGitRepositoryState(
  workspaceRoot: string,
  runner: WorkspaceGitCommandRunner,
): Promise<GitRepositoryState> {
  const repo = await runGit(runner, ["rev-parse", "--is-inside-work-tree"], workspaceRoot);
  if (gitMissing(repo)) {
    return emptyGitState(false);
  }
  if (!isSuccess(repo) || repo.stdout.trim() !== "true") {
    return emptyGitState(true);
  }

  const [branchResult, headResult, upstreamResult, remotesResult, gitDirResult, commonDirResult] = await Promise.all([
    runGit(runner, ["symbolic-ref", "--quiet", "--short", "HEAD"], workspaceRoot),
    runGit(runner, ["rev-parse", "--verify", "HEAD"], workspaceRoot),
    runGit(runner, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], workspaceRoot),
    runGit(runner, ["remote"], workspaceRoot),
    runGit(runner, ["rev-parse", "--absolute-git-dir"], workspaceRoot),
    runGit(runner, ["rev-parse", "--git-common-dir"], workspaceRoot),
  ]);

  let locationKind: "this_mac" | "worktree" = "this_mac";
  if (isSuccess(gitDirResult) && isSuccess(commonDirResult)) {
    const gitDir = resolve(workspaceRoot, gitDirResult.stdout.trim());
    const commonDir = resolve(workspaceRoot, commonDirResult.stdout.trim());
    try {
      locationKind = (await realpath(gitDir)) === (await realpath(commonDir)) ? "this_mac" : "worktree";
    } catch {
      locationKind = gitDir === commonDir ? "this_mac" : "worktree";
    }
  }

  const branch = isSuccess(branchResult) ? branchResult.stdout.trim() || undefined : undefined;
  return {
    available: true,
    repository: true,
    branch,
    detached: !branch,
    hasHead: isSuccess(headResult),
    upstream: isSuccess(upstreamResult) ? upstreamResult.stdout.trim() || undefined : undefined,
    remotes: isSuccess(remotesResult) ? remotesResult.stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) : [],
    locationKind,
  };
}

function emptyGitState(available: boolean): GitRepositoryState {
  return {
    available,
    repository: false,
    detached: false,
    hasHead: false,
    remotes: [],
    locationKind: "this_mac",
  };
}

async function resolveWorkspace(workspaceRoot: string | undefined, roots: AppDataRoots): Promise<ResolvedWorkspace> {
  const resolvedRoot = resolve(workspaceRoot ?? roots.defaultWorkspaceRoot);
  try {
    const info = await stat(resolvedRoot);
    if (!info.isDirectory()) {
      return { ok: false, workspaceRoot: resolvedRoot, message: "Workspace root is not a directory." };
    }
    return { ok: true, workspaceRoot: resolvedRoot };
  } catch {
    return { ok: false, workspaceRoot: resolvedRoot, message: "Workspace root was not found." };
  }
}

function mutationFailure(
  action: WorkspaceGitMutationResult["action"],
  phase: WorkspaceGitMutationResult["phase"],
  workspaceRoot: string,
  error: WorkspaceGitMutationResult["error"],
  message: string,
  extra: Partial<WorkspaceGitMutationResult> = {},
): WorkspaceGitMutationResult {
  return { ok: false, action, phase, workspaceRoot, error, message, ...extra };
}

function runGit(
  runner: WorkspaceGitCommandRunner,
  args: string[],
  cwd: string,
  timeoutMs = GIT_TIMEOUT_MS,
): Promise<WorkspaceGitCommandResult> {
  return runner(args, { cwd, timeoutMs, maxOutputChars: GIT_MAX_OUTPUT_CHARS });
}

function isSuccess(result: WorkspaceGitCommandResult): boolean {
  return result.exitCode === 0 && !result.startError && !result.timedOut;
}

function gitMissing(result: WorkspaceGitCommandResult): boolean {
  return result.startError === "ENOENT" || /not found|is not recognized/i.test(result.startError ?? "");
}

function sanitizeGitError(result: WorkspaceGitCommandResult, workspaceRoot: string): string {
  if (result.timedOut) return "Git command timed out.";
  if (gitMissing(result)) return "Git is not available on this Mac.";
  const raw = (result.stderr || result.stdout || result.startError || "Git command failed.").trim();
  return raw
    .replaceAll(workspaceRoot, "<workspace>")
    .replace(/([a-z][a-z0-9+.-]*:\/\/)([^\s/@]+)@/gi, "$1<redacted>@")
    .slice(0, 1_200) || "Git command failed.";
}

function runGitCommand(
  args: string[],
  options: { cwd: string; timeoutMs: number; maxOutputChars: number },
): Promise<WorkspaceGitCommandResult> {
  return new Promise((resolveResult) => {
    execFile(
      "git",
      args,
      {
        cwd: options.cwd,
        timeout: options.timeoutMs,
        maxBuffer: options.maxOutputChars,
        windowsHide: true,
        encoding: "utf8",
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      },
      (error, stdout, stderr) => {
        const nodeError = error as NodeJS.ErrnoException & { code?: string | number; killed?: boolean } | null;
        resolveResult({
          stdout: String(stdout ?? "").slice(0, options.maxOutputChars),
          stderr: String(stderr ?? "").slice(0, options.maxOutputChars),
          exitCode: error ? (typeof nodeError?.code === "number" ? nodeError.code : null) : 0,
          timedOut: Boolean(nodeError?.killed),
          truncated: String(stdout ?? "").length > options.maxOutputChars || String(stderr ?? "").length > options.maxOutputChars,
          startError: typeof nodeError?.code === "string" ? nodeError.code : undefined,
        });
      },
    );
  });
}
