import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { ReviewInitGitInput, ReviewInitGitResult } from "@actspace/shared";
import type { AppDataRoots } from "./app-paths";
import { isGitRunSuccess, runGitCommand, type GitRunResult, type GitRunner } from "./git/run-git";

const GIT_TIMEOUT_MS = 8_000;
const GIT_MAX_OUTPUT_CHARS = 2 * 1024 * 1024;

export async function initializeGitRepository(
  input: ReviewInitGitInput,
  roots: AppDataRoots,
  runner: GitRunner = runGitCommand,
): Promise<ReviewInitGitResult> {
  const workspace = await resolveWorkspaceRoot(input, roots);
  if (workspace.ok === false) {
    return {
      ok: false,
      workspaceRoot: workspace.workspaceRoot,
      error: "invalid_workspace",
      message: workspace.message,
    };
  }

  const repo = await runGit(runner, ["rev-parse", "--is-inside-work-tree"], workspace.workspaceRoot);
  if (isGitMissing(repo)) {
    return {
      ok: false,
      workspaceRoot: workspace.workspaceRoot,
      error: "git_not_found",
      message: "Git is not available on this machine.",
    };
  }
  if (isGitRunSuccess(repo) && repo.stdout.trim() === "true") {
    return { ok: true, workspaceRoot: workspace.workspaceRoot, alreadyRepository: true };
  }

  const init = await runGit(runner, ["init"], workspace.workspaceRoot);
  if (isGitMissing(init)) {
    return {
      ok: false,
      workspaceRoot: workspace.workspaceRoot,
      error: "git_not_found",
      message: "Git is not available on this machine.",
    };
  }
  if (!isGitRunSuccess(init)) {
    return {
      ok: false,
      workspaceRoot: workspace.workspaceRoot,
      error: "command_failed",
      message: sanitizeGitError(init),
    };
  }
  return { ok: true, workspaceRoot: workspace.workspaceRoot, alreadyRepository: false };
}

async function resolveWorkspaceRoot(
  input: { workspaceRoot?: string },
  roots: AppDataRoots,
): Promise<{ ok: true; workspaceRoot: string } | { ok: false; workspaceRoot: string; message: string }> {
  const workspaceRoot = resolve(input.workspaceRoot ?? roots.defaultWorkspaceRoot);
  try {
    const stats = await stat(workspaceRoot);
    if (!stats.isDirectory()) return { ok: false, workspaceRoot, message: "Workspace root is not a directory." };
    return { ok: true, workspaceRoot };
  } catch {
    return { ok: false, workspaceRoot, message: "Workspace root was not found." };
  }
}

function runGit(runner: GitRunner, args: string[], cwd: string): Promise<GitRunResult> {
  return runner(args, { cwd, timeoutMs: GIT_TIMEOUT_MS, maxOutputChars: GIT_MAX_OUTPUT_CHARS });
}

function isGitMissing(result: GitRunResult): boolean {
  return Boolean(result.startError && /ENOENT|not found|spawn git/i.test(result.startError.message));
}

function sanitizeGitError(result: GitRunResult): string {
  if (result.timedOut) return "Git command timed out.";
  if (result.startError) return result.startError.message.replace(/\s+/g, " ").trim();
  return (result.stderr || result.stdout || "Git command failed.").replace(/\s+/g, " ").trim();
}
