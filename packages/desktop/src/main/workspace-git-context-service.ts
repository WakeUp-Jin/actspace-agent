import { execFile } from "node:child_process";
import { randomInt } from "node:crypto";
import { mkdir, rm, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type {
  SessionWorktreeContext,
  TurnExecutionContextInput,
  WorkspaceGitContext,
  WorkspacePreparationPayload,
} from "@actspace/shared";
import type { AppDataRoots } from "./agent-turn";

const GIT_TIMEOUT_MS = 10_000;
const GIT_MAX_OUTPUT_CHARS = 1024 * 1024;
const WORKTREE_ID_ATTEMPTS = 20;

export type GitCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  startError?: string;
};

export type GitCommandRunner = (
  args: string[],
  options: { cwd: string; timeoutMs: number; maxOutputChars: number },
) => Promise<GitCommandResult>;

export type PrepareExecutionContextResult =
  | {
      ok: true;
      workspaceId?: string;
      workspaceRoot: string;
      branch?: string;
      worktree?: SessionWorktreeContext;
      preparationEvent?: WorkspacePreparationPayload;
      rollback?: PreparedExecutionRollback;
    }
  | {
      ok: false;
      code:
        | "invalid_workspace"
        | "not_repository"
        | "no_head"
        | "branch_not_found"
        | "branch_conflict"
        | "path_conflict"
        | "git_not_found"
        | "command_failed"
        | "verification_failed";
      message: string;
    };

export type PreparedExecutionRollback =
  | { kind: "branch_switch"; repositoryRoot: string; branch: string }
  | { kind: "worktree"; worktree: SessionWorktreeContext };

export async function getWorkspaceGitContext(
  workspaceRoot: string,
  runner: GitCommandRunner = runGitCommand,
): Promise<WorkspaceGitContext> {
  const resolvedRoot = resolve(workspaceRoot);
  if (!(await isDirectory(resolvedRoot))) {
    return contextFailure("failed", resolvedRoot, "Workspace folder was not found.");
  }

  const repository = await runGit(runner, ["rev-parse", "--show-toplevel"], resolvedRoot);
  if (isGitMissing(repository)) {
    return contextFailure("git_not_found", resolvedRoot, "Git is not available on this machine.");
  }
  if (!isGitSuccess(repository)) {
    const error = sanitizeGitError(repository);
    return /not a git repository/i.test(error)
      ? contextFailure("not_repository", resolvedRoot)
      : contextFailure("failed", resolvedRoot, error);
  }

  const repositoryRoot = resolve(repository.stdout.trim());
  const head = await runGit(runner, ["rev-parse", "--verify", "HEAD"], repositoryRoot);
  if (!isGitSuccess(head)) {
    return contextFailure("no_head", resolvedRoot, "Git repository has no commits yet.", repositoryRoot);
  }

  const branch = await runGit(runner, ["symbolic-ref", "--quiet", "--short", "HEAD"], repositoryRoot);
  const currentBranch = isGitSuccess(branch) ? branch.stdout.trim() : undefined;
  const headCommit = head.stdout.trim();
  const refs = await runGit(
    runner,
    ["for-each-ref", "--format=%(refname:short)", "refs/heads"],
    repositoryRoot,
  );
  if (!isGitSuccess(refs)) {
    return contextFailure("failed", resolvedRoot, sanitizeGitError(refs), repositoryRoot);
  }
  const worktrees = await runGit(runner, ["worktree", "list", "--porcelain"], repositoryRoot);
  if (!isGitSuccess(worktrees)) {
    return contextFailure("failed", resolvedRoot, sanitizeGitError(worktrees), repositoryRoot);
  }

  const checkedOutBranches = parseWorktreeBranches(worktrees.stdout);
  return {
    status: "ready",
    workspaceRoot: resolvedRoot,
    repositoryRoot,
    currentBranch,
    ...(!currentBranch ? { detachedCommit: headCommit.slice(0, 8) } : {}),
    headCommit,
    branches: refs.stdout
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right))
      .map((name) => ({
        name,
        current: name === currentBranch,
        ...(checkedOutBranches.get(name) ? { checkedOutPath: checkedOutBranches.get(name) } : {}),
      })),
  };
}

export async function prepareExecutionContext(
  input: TurnExecutionContextInput,
  roots: AppDataRoots,
  options: {
    runner?: GitCommandRunner;
    now?: () => Date;
    createId?: () => string;
  } = {},
): Promise<PrepareExecutionContextResult> {
  const runner = options.runner ?? runGitCommand;
  const now = options.now ?? (() => new Date());
  const sourceWorkspaceRoot = resolve(input.sourceWorkspaceRoot);
  if (!(await isDirectory(sourceWorkspaceRoot))) {
    return failed("invalid_workspace", "Workspace folder was not found.");
  }

  if (input.runLocation === "this_mac") {
    const gitContext = await getWorkspaceGitContext(sourceWorkspaceRoot, runner);
    if (gitContext.status === "not_repository") {
      return {
        ok: true,
        workspaceId: input.workspaceId,
        workspaceRoot: sourceWorkspaceRoot,
      };
    }
    const gitFailure = gitContextToPreparationFailure(gitContext);
    if (gitFailure) return gitFailure;

    const targetBranch = input.branch?.trim();
    if (targetBranch && targetBranch !== gitContext.currentBranch) {
      if (!gitContext.branches.some((branch) => branch.name === targetBranch)) {
        return failed("branch_not_found", `Branch '${targetBranch}' was not found.`);
      }
      const switched = await runGit(runner, ["switch", targetBranch], gitContext.repositoryRoot!);
      if (!isGitSuccess(switched)) {
        return failed(
          isGitMissing(switched) ? "git_not_found" : "command_failed",
          isGitMissing(switched)
            ? "Git is not available on this machine."
            : `Could not switch branches. ${sanitizeGitError(switched)}`,
        );
      }
    }

    return {
      ok: true,
      workspaceId: input.workspaceId,
      workspaceRoot: sourceWorkspaceRoot,
      branch: targetBranch ?? gitContext.currentBranch,
      ...(targetBranch && targetBranch !== gitContext.currentBranch && gitContext.currentBranch
        ? {
            rollback: {
              kind: "branch_switch" as const,
              repositoryRoot: gitContext.repositoryRoot!,
              branch: gitContext.currentBranch,
            },
          }
        : {}),
    };
  }

  const startedAt = Date.now();
  const gitContext = await getWorkspaceGitContext(sourceWorkspaceRoot, runner);
  const gitFailure = gitContextToPreparationFailure(gitContext);
  if (gitFailure) return gitFailure;

  const baseBranch = input.branch?.trim() || gitContext.currentBranch;
  if (!baseBranch || !gitContext.branches.some((branch) => branch.name === baseBranch)) {
    return failed("branch_not_found", "Select an existing local branch for the worktree base.");
  }

  const baseCommitResult = await runGit(runner, ["rev-parse", `${baseBranch}^{commit}`], gitContext.repositoryRoot!);
  if (!isGitSuccess(baseCommitResult)) {
    return failed(
      isGitMissing(baseCommitResult) ? "git_not_found" : "branch_not_found",
      isGitMissing(baseCommitResult)
        ? "Git is not available on this machine."
        : `Branch '${baseBranch}' no longer exists.`,
    );
  }
  const baseCommit = baseCommitResult.stdout.trim();
  const repositoryName = basename(gitContext.repositoryRoot!);
  const generated = await createAvailableWorktreeTarget(
    gitContext.repositoryRoot!,
    roots.dataRoot,
    repositoryName,
    runner,
    options.createId,
  );
  if (!generated.ok) return generated;

  await mkdir(generated.parentRoot, { recursive: true });
  const created = await runGit(
    runner,
    ["worktree", "add", "-b", generated.branch, generated.workspaceRoot, baseCommit],
    gitContext.repositoryRoot!,
  );
  if (!isGitSuccess(created)) {
    await removeGeneratedWorktree(
      gitContext.repositoryRoot!,
      generated.parentRoot,
      generated.workspaceRoot,
      generated.branch,
      runner,
    );
    return failed(
      isGitMissing(created) ? "git_not_found" : "command_failed",
      isGitMissing(created) ? "Git is not available on this machine." : sanitizeGitError(created),
    );
  }

  const [createdBranch, createdCommit, createdCommonDir, sourceCommonDir] = await Promise.all([
    runGit(runner, ["symbolic-ref", "--quiet", "--short", "HEAD"], generated.workspaceRoot),
    runGit(runner, ["rev-parse", "HEAD"], generated.workspaceRoot),
    runGit(runner, ["rev-parse", "--path-format=absolute", "--git-common-dir"], generated.workspaceRoot),
    runGit(runner, ["rev-parse", "--path-format=absolute", "--git-common-dir"], gitContext.repositoryRoot!),
  ]);
  if (
    !isGitSuccess(createdBranch) ||
    !isGitSuccess(createdCommit) ||
    !isGitSuccess(createdCommonDir) ||
    !isGitSuccess(sourceCommonDir) ||
    createdBranch.stdout.trim() !== generated.branch ||
    createdCommit.stdout.trim() !== baseCommit ||
    resolve(createdCommonDir.stdout.trim()) !== resolve(sourceCommonDir.stdout.trim())
  ) {
    await removeGeneratedWorktree(
      gitContext.repositoryRoot!,
      generated.parentRoot,
      generated.workspaceRoot,
      generated.branch,
      runner,
    );
    return failed("verification_failed", "Worktree was created but could not be verified.");
  }

  const createdAt = now().toISOString();
  const worktree: SessionWorktreeContext = {
    kind: "worktree",
    sourceWorkspaceRoot,
    workspaceRoot: generated.workspaceRoot,
    baseBranch,
    branch: generated.branch,
    baseCommit,
    createdAt,
  };
  const durationMs = Math.max(0, Date.now() - startedAt);
  return {
    ok: true,
    workspaceId: input.workspaceId,
    workspaceRoot: generated.workspaceRoot,
    branch: generated.branch,
    worktree,
    rollback: { kind: "worktree", worktree },
    preparationEvent: {
      kind: "worktree",
      status: "completed",
      sourceWorkspaceRoot,
      workspaceRoot: generated.workspaceRoot,
      baseBranch,
      branch: generated.branch,
      baseCommit,
      durationMs,
      environmentSetup: "none",
    },
  };
}

export async function rollbackPreparedWorktree(
  worktree: SessionWorktreeContext,
  runner: GitCommandRunner = runGitCommand,
): Promise<void> {
  await removeGeneratedWorktree(
    worktree.sourceWorkspaceRoot,
    resolve(worktree.workspaceRoot, ".."),
    worktree.workspaceRoot,
    worktree.branch,
    runner,
  );
}

export async function rollbackPreparedExecution(
  rollback: PreparedExecutionRollback | undefined,
  runner: GitCommandRunner = runGitCommand,
): Promise<void> {
  if (!rollback) return;
  if (rollback.kind === "worktree") {
    await rollbackPreparedWorktree(rollback.worktree, runner);
    return;
  }
  await runGit(runner, ["switch", rollback.branch], rollback.repositoryRoot);
}

async function createAvailableWorktreeTarget(
  repositoryRoot: string,
  dataRoot: string,
  repositoryName: string,
  runner: GitCommandRunner,
  createId: (() => string) | undefined,
): Promise<
  | { ok: true; branch: string; parentRoot: string; workspaceRoot: string }
  | Extract<PrepareExecutionContextResult, { ok: false }>
> {
  for (let attempt = 0; attempt < WORKTREE_ID_ATTEMPTS; attempt += 1) {
    const id = createId?.() ?? String(randomInt(0, 100_000_000)).padStart(8, "0");
    if (!/^\d{8}$/.test(id)) continue;
    const branch = `actspace/${id}`;
    const parentRoot = resolve(dataRoot, "worktrees", id);
    const workspaceRoot = join(parentRoot, repositoryName);
    if (await pathExists(parentRoot)) continue;
    const ref = await runGit(runner, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], repositoryRoot);
    if (isGitMissing(ref)) return failed("git_not_found", "Git is not available on this machine.");
    if (!isGitSuccess(ref)) return { ok: true, branch, parentRoot, workspaceRoot };
  }
  return failed("branch_conflict", "Could not allocate a unique worktree branch.");
}

function parseWorktreeBranches(output: string): Map<string, string> {
  const result = new Map<string, string>();
  let currentPath: string | undefined;
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      currentPath = line.slice("worktree ".length).trim();
    } else if (line.startsWith("branch refs/heads/") && currentPath) {
      result.set(line.slice("branch refs/heads/".length).trim(), currentPath);
    } else if (!line.trim()) {
      currentPath = undefined;
    }
  }
  return result;
}

function contextFailure(
  status: WorkspaceGitContext["status"],
  workspaceRoot: string,
  error?: string,
  repositoryRoot?: string,
): WorkspaceGitContext {
  return { status, workspaceRoot, ...(repositoryRoot ? { repositoryRoot } : {}), branches: [], ...(error ? { error } : {}) };
}

function gitContextToPreparationFailure(
  context: WorkspaceGitContext,
): Extract<PrepareExecutionContextResult, { ok: false }> | null {
  switch (context.status) {
    case "ready":
      return null;
    case "not_repository":
      return failed("not_repository", "Current workspace is not a Git repository.");
    case "no_head":
      return failed("no_head", "Git repository has no commits yet.");
    case "git_not_found":
      return failed("git_not_found", "Git is not available on this machine.");
    case "failed":
      return failed("command_failed", context.error ?? "Git repository could not be inspected.");
  }
}

function failed(
  code: Extract<PrepareExecutionContextResult, { ok: false }>["code"],
  message: string,
): Extract<PrepareExecutionContextResult, { ok: false }> {
  return { ok: false, code, message };
}

async function runGit(runner: GitCommandRunner, args: string[], cwd: string): Promise<GitCommandResult> {
  return runner(args, { cwd, timeoutMs: GIT_TIMEOUT_MS, maxOutputChars: GIT_MAX_OUTPUT_CHARS });
}

function runGitCommand(
  args: string[],
  options: { cwd: string; timeoutMs: number; maxOutputChars: number },
): Promise<GitCommandResult> {
  return new Promise((resolveResult) => {
    execFile(
      "git",
      ["-C", options.cwd, ...args],
      {
        cwd: options.cwd,
        timeout: options.timeoutMs,
        maxBuffer: options.maxOutputChars,
        windowsHide: true,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolveResult({ stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), exitCode: 0, timedOut: false });
          return;
        }
        const typed = error as NodeJS.ErrnoException & { code?: string | number; killed?: boolean };
        resolveResult({
          stdout: String(stdout ?? ""),
          stderr: String(stderr ?? ""),
          exitCode: typeof typed.code === "number" ? typed.code : null,
          timedOut: typed.killed === true,
          startError: typeof typed.code === "string" ? typed.message : undefined,
        });
      },
    );
  });
}

function isGitSuccess(result: GitCommandResult): boolean {
  return !result.startError && !result.timedOut && result.exitCode === 0;
}

function isGitMissing(result: GitCommandResult): boolean {
  return Boolean(result.startError && /ENOENT|not found|spawn git/i.test(result.startError));
}

function sanitizeGitError(result: GitCommandResult): string {
  if (result.timedOut) return "Git command timed out.";
  const message = result.stderr.trim() || result.stdout.trim();
  if (!message) return "Git command failed.";
  return message.replace(/\s+/g, " ").slice(0, 400);
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function cleanupGeneratedWorktree(workspaceRoot: string): Promise<void> {
  await rm(workspaceRoot, { recursive: true, force: true }).catch(() => undefined);
}

async function removeGeneratedWorktree(
  repositoryRoot: string,
  parentRoot: string,
  workspaceRoot: string,
  branch: string,
  runner: GitCommandRunner,
): Promise<void> {
  await runGit(runner, ["worktree", "remove", "--force", workspaceRoot], repositoryRoot).catch(() => undefined);
  await runGit(runner, ["branch", "-D", branch], repositoryRoot).catch(() => undefined);
  await cleanupGeneratedWorktree(parentRoot);
}
