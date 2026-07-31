import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { ReviewInitGitInput, ReviewInitGitResult } from "@actspace/shared";
import type { AppDataRoots } from "./agent-turn";

const GIT_TIMEOUT_MS = 8_000;
const GIT_MAX_OUTPUT_CHARS = 2 * 1024 * 1024;

export type GitCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
  startError?: string;
};

export type GitCommandRunner = (
  args: string[],
  options: { cwd: string; timeoutMs: number; maxOutputChars: number },
) => Promise<GitCommandResult>;

export async function initializeGitRepository(
  input: ReviewInitGitInput,
  roots: AppDataRoots,
  runner: GitCommandRunner = runGitCommand,
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
  if (isGitSuccess(repo) && repo.stdout.trim() === "true") {
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
  if (!isGitSuccess(init)) {
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

function runGit(runner: GitCommandRunner, args: string[], cwd: string): Promise<GitCommandResult> {
  return runner(args, { cwd, timeoutMs: GIT_TIMEOUT_MS, maxOutputChars: GIT_MAX_OUTPUT_CHARS });
}

function runGitCommand(
  args: string[],
  options: { cwd: string; timeoutMs: number; maxOutputChars: number },
): Promise<GitCommandResult> {
  return new Promise((resolveResult) => {
    let settled = false;
    const child = execFile(
      "git",
      ["-C", options.cwd, ...args],
      { cwd: options.cwd, timeout: options.timeoutMs, maxBuffer: options.maxOutputChars, windowsHide: true, encoding: "utf8" },
      (error, out, err) => {
        if (settled) return;
        settled = true;
        const stdout = String(out ?? "").slice(0, options.maxOutputChars);
        const stderr = String(err ?? "").slice(0, options.maxOutputChars);
        const truncated = String(out ?? "").length > options.maxOutputChars || String(err ?? "").length > options.maxOutputChars
          || Boolean(error?.message.includes("maxBuffer"));
        if (!error) {
          resolveResult({ stdout, stderr, exitCode: 0, timedOut: false, truncated });
          return;
        }
        const typed = error as NodeJS.ErrnoException & { killed?: boolean };
        resolveResult({
          stdout,
          stderr,
          exitCode: typeof typed.code === "number" ? typed.code : null,
          timedOut: Boolean(typed.killed),
          truncated,
          ...(typeof typed.code === "string" ? { startError: typed.message } : {}),
        });
      },
    );
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      resolveResult({ stdout: "", stderr: "", exitCode: null, timedOut: false, truncated: false, startError: error.message });
    });
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
  if (result.startError) return result.startError.replace(/\s+/g, " ").trim();
  return (result.stderr || result.stdout || "Git command failed.").replace(/\s+/g, " ").trim();
}
