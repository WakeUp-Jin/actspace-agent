import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
  ReviewChangeSet,
  ReviewChunk,
  ReviewFileChange,
  ReviewFileStatus,
  ReviewGetWorkspaceChangesInput,
  ReviewGetWorkspaceChangesResult,
  ReviewInitGitInput,
  ReviewInitGitResult,
  ReviewProviderReason,
  ReviewWarning,
} from "@actspace/shared";
import type { AppDataRoots } from "./agent-turn";

const GIT_TIMEOUT_MS = 8_000;
const GIT_MAX_OUTPUT_CHARS = 2 * 1024 * 1024;
const UNTRACKED_MAX_TEXT_BYTES = 256 * 1024;
const UNTRACKED_TOTAL_TEXT_BYTES = 1024 * 1024;
const DIFF_WARNING_THRESHOLD_CHARS = Math.floor(GIT_MAX_OUTPUT_CHARS * 0.96);

export type GitCommandRunner = (
  args: string[],
  options: { cwd: string; timeoutMs: number; maxOutputChars: number },
) => Promise<GitCommandResult>;

export type GitCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
  startError?: string;
};

type WorkspaceResolution =
  | { ok: true; workspaceRoot: string }
  | { ok: false; workspaceRoot: string; message: string };

type ParsedFile = ReviewFileChange & {
  sortStatus: string;
};

const STATUS_SORT_ORDER: Record<ReviewFileStatus, number> = {
  added: 0,
  modified: 1,
  renamed: 2,
  deleted: 3,
};

export async function getWorkspaceGitChanges(
  input: ReviewGetWorkspaceChangesInput,
  roots: AppDataRoots,
  runner: GitCommandRunner = runGitCommand,
): Promise<ReviewGetWorkspaceChangesResult> {
  if (input.scope && input.scope !== "uncommitted") {
    return failed("unsupported_scope", "Review V1 only supports uncommitted changes.");
  }

  const workspace = await resolveWorkspaceRoot(input, roots);
  if (workspace.ok === false) {
    return failed("command_failed", workspace.message);
  }

  const repo = await runGit(runner, ["rev-parse", "--is-inside-work-tree"], workspace.workspaceRoot);
  if (isGitMissing(repo)) {
    return failed("git_not_found", "Git is not available on this machine.");
  }
  if (!isGitSuccess(repo) || repo.stdout.trim() !== "true") {
    return {
      provider: "git",
      status: "notAvailable",
      reason: "not_a_repository",
      message: "Current workspace is not a Git repository.",
    };
  }

  const hasHeadResult = await runGit(runner, ["rev-parse", "--verify", "HEAD"], workspace.workspaceRoot);
  const hasHead = isGitSuccess(hasHeadResult);
  const baselineLabel = hasHead ? "HEAD" : "No commits";
  const warnings: ReviewWarning[] = [];
  const trackedDiff = await runGit(
    runner,
    hasHead
      ? ["diff", "--find-renames", "--unified=3", "HEAD", "--", "."]
      : ["diff", "--cached", "--find-renames", "--unified=3", "--", "."],
    workspace.workspaceRoot,
  );
  if (isGitMissing(trackedDiff)) {
    return failed("git_not_found", "Git is not available on this machine.");
  }
  if (!isGitSuccess(trackedDiff)) {
    return failed("command_failed", sanitizeGitError(trackedDiff));
  }
  if (trackedDiff.truncated || trackedDiff.stdout.length >= DIFF_WARNING_THRESHOLD_CHARS) {
    warnings.push({
      kind: "truncated",
      message: "Tracked diff output was truncated.",
    });
  }

  const statusResult = await runGit(runner, ["status", "--porcelain=v1", "-z", "--", "."], workspace.workspaceRoot);
  if (!isGitSuccess(statusResult)) {
    return failed(isGitMissing(statusResult) ? "git_not_found" : "command_failed", sanitizeGitError(statusResult));
  }
  const statusMap = parsePorcelainStatus(statusResult.stdout);

  const files = new Map<string, ParsedFile>();
  for (const file of parseUnifiedDiff(trackedDiff.stdout, statusMap)) {
    files.set(file.path, file);
  }

  const untrackedResult = await runGit(runner, ["ls-files", "--others", "--exclude-standard", "-z", "--", "."], workspace.workspaceRoot);
  if (!isGitSuccess(untrackedResult)) {
    return failed(isGitMissing(untrackedResult) ? "git_not_found" : "command_failed", sanitizeGitError(untrackedResult));
  }
  await appendUntrackedFiles(files, warnings, workspace.workspaceRoot, parseNulList(untrackedResult.stdout));

  const sortedFiles = [...files.values()].sort(compareReviewFiles);
  const changeSet = createChangeSet(workspace.workspaceRoot, baselineLabel, sortedFiles, warnings);
  const hasWarnings = warnings.length > 0;
  if (changeSet.files.length === 0) {
    return {
      provider: "git",
      status: hasWarnings ? "partial" : "empty",
      changeSet,
      message: hasWarnings ? "No textual changes were available, but warnings were reported." : "No Git changes.",
    };
  }

  return {
    provider: "git",
    status: hasWarnings ? "partial" : "changes",
    changeSet,
  };
}

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
): Promise<WorkspaceResolution> {
  const workspaceRoot = resolve(input.workspaceRoot ?? roots.defaultWorkspaceRoot);
  try {
    const stats = await stat(workspaceRoot);
    if (!stats.isDirectory()) {
      return { ok: false, workspaceRoot, message: "Workspace root is not a directory." };
    }
    return { ok: true, workspaceRoot };
  } catch {
    return { ok: false, workspaceRoot, message: "Workspace root was not found." };
  }
}

function runGit(runner: GitCommandRunner, args: string[], cwd: string): Promise<GitCommandResult> {
  return runner(args, {
    cwd,
    timeoutMs: GIT_TIMEOUT_MS,
    maxOutputChars: GIT_MAX_OUTPUT_CHARS,
  });
}

function runGitCommand(
  args: string[],
  options: { cwd: string; timeoutMs: number; maxOutputChars: number },
): Promise<GitCommandResult> {
  return new Promise((resolveResult) => {
    let settled = false;
    let timedOut = false;
    let truncated = false;
    let stdout = "";
    let stderr = "";
    const child = execFile(
      "git",
      ["-C", options.cwd, ...args],
      {
        cwd: options.cwd,
        timeout: options.timeoutMs,
        maxBuffer: options.maxOutputChars,
        windowsHide: true,
        encoding: "utf8",
      },
      (error, out, err) => {
        if (settled) return;
        settled = true;
        stdout = String(out ?? "");
        stderr = String(err ?? "");
        if (stdout.length > options.maxOutputChars) {
          stdout = stdout.slice(0, options.maxOutputChars);
          truncated = true;
        }
        if (stderr.length > options.maxOutputChars) {
          stderr = stderr.slice(0, options.maxOutputChars);
          truncated = true;
        }
        if (!error) {
          resolveResult({ stdout, stderr, exitCode: 0, timedOut, truncated });
          return;
        }
        const errObj = error as NodeJS.ErrnoException & {
          code?: string | number;
          signal?: NodeJS.Signals | null;
          killed?: boolean;
        };
        if (errObj.killed) timedOut = true;
        if (errObj.message.includes("stdout maxBuffer") || errObj.message.includes("stderr maxBuffer")) {
          truncated = true;
        }
        const exitCode = typeof errObj.code === "number" ? errObj.code : null;
        resolveResult({
          stdout,
          stderr,
          exitCode,
          timedOut,
          truncated,
          startError: typeof errObj.code === "string" ? errObj.message : undefined,
        });
      },
    );

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      resolveResult({
        stdout,
        stderr,
        exitCode: null,
        timedOut,
        truncated,
        startError: error.message,
      });
    });
  });
}

function isGitSuccess(result: GitCommandResult): boolean {
  return !result.startError && !result.timedOut && result.exitCode === 0;
}

function isGitMissing(result: GitCommandResult): boolean {
  return Boolean(result.startError && /ENOENT|not found|spawn git/i.test(result.startError));
}

function failed(reason: ReviewProviderReason, message: string): ReviewGetWorkspaceChangesResult {
  return {
    provider: "git",
    status: "failed",
    reason,
    message,
  };
}

function sanitizeGitError(result: GitCommandResult): string {
  if (result.timedOut) return "Git command timed out.";
  if (result.startError) return result.startError.replace(/\s+/g, " ").trim();
  return (result.stderr || result.stdout || "Git command failed.").replace(/\s+/g, " ").trim();
}

function parseNulList(stdout: string): string[] {
  return stdout.split("\0").map((item) => item.trim()).filter(Boolean);
}

type GitFileStatus = {
  status: ReviewFileStatus;
  previousPath?: string;
};

function parsePorcelainStatus(stdout: string): Map<string, GitFileStatus> {
  const statuses = new Map<string, GitFileStatus>();
  const entries = parseNulList(stdout);
  for (let index = 0; index < entries.length; index += 1) {
    const raw = entries[index];
    if (raw.length < 4) continue;
    const code = raw.slice(0, 2);
    const path = raw.slice(3);
    if (code.includes("R")) {
      const nextPath = entries[index + 1];
      if (nextPath) {
        statuses.set(nextPath, { status: "renamed", previousPath: path });
        index += 1;
      }
      continue;
    }
    statuses.set(path, { status: statusFromPorcelain(code) });
  }
  return statuses;
}

function statusFromPorcelain(code: string): ReviewFileStatus {
  if (code.includes("A") || code.includes("?")) return "added";
  if (code.includes("D")) return "deleted";
  return "modified";
}

function parseUnifiedDiff(diff: string, statusMap: Map<string, GitFileStatus>): ParsedFile[] {
  if (!diff.trim()) return [];
  const files: ParsedFile[] = [];
  const lines = diff.split(/\r?\n/);
  let current: ParsedFile | null = null;
  let currentChunk: ReviewChunk | null = null;

  const finishChunk = () => {
    if (currentChunk && current) {
      current.chunks.push(currentChunk);
    }
    currentChunk = null;
  };

  const finishFile = () => {
    finishChunk();
    if (current) {
      const status = statusMap.get(current.path);
      if (status) {
        current.status = status.status;
        current.previousPath = status.previousPath ?? current.previousPath;
      }
      files.push(current);
    }
    current = null;
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      finishFile();
      current = createParsedFileFromDiffHeader(line);
      continue;
    }
    if (!current) continue;

    if (line.startsWith("new file mode")) {
      current.status = "added";
      continue;
    }
    if (line.startsWith("deleted file mode")) {
      current.status = "deleted";
      continue;
    }
    if (line.startsWith("rename from ")) {
      current.status = "renamed";
      current.previousPath = line.slice("rename from ".length);
      continue;
    }
    if (line.startsWith("rename to ")) {
      current.path = line.slice("rename to ".length);
      continue;
    }

    const hunk = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/.exec(line);
    if (hunk) {
      finishChunk();
      currentChunk = {
        oldStart: Number(hunk[1]),
        oldLines: hunk[2] ? Number(hunk[2]) : 1,
        newStart: Number(hunk[3]),
        newLines: hunk[4] ? Number(hunk[4]) : 1,
        unifiedText: line,
      };
      continue;
    }

    if (!currentChunk) continue;
    currentChunk.unifiedText = currentChunk.unifiedText ? `${currentChunk.unifiedText}\n${line}` : line;
    if (line.startsWith("+") && !line.startsWith("+++")) {
      current.additions += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      current.deletions += 1;
    }
  }

  finishFile();
  return files;
}

function createParsedFileFromDiffHeader(line: string): ParsedFile {
  const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
  const path = match?.[2] ?? "unknown";
  const previousPath = match?.[1] && match[1] !== path ? match[1] : undefined;
  return {
    path,
    previousPath,
    status: previousPath ? "renamed" : "modified",
    additions: 0,
    deletions: 0,
    chunks: [],
    sortStatus: "",
  };
}

async function appendUntrackedFiles(
  files: Map<string, ParsedFile>,
  warnings: ReviewWarning[],
  workspaceRoot: string,
  paths: string[],
): Promise<void> {
  let totalBytes = 0;
  for (const path of paths) {
    if (files.has(path) || path.startsWith(".git/")) continue;
    const absolutePath = resolve(workspaceRoot, path);
    if (!isInsideRoot(workspaceRoot, absolutePath)) {
      warnings.push({
        kind: "ignored_path",
        filePath: path,
        message: "Ignored a path outside the current workspace.",
      });
      continue;
    }
    let size = 0;
    try {
      const stats = await stat(absolutePath);
      if (!stats.isFile()) continue;
      size = stats.size;
    } catch {
      continue;
    }
    if (size > UNTRACKED_MAX_TEXT_BYTES || totalBytes + size > UNTRACKED_TOTAL_TEXT_BYTES) {
      warnings.push({
        kind: "truncated",
        filePath: path,
        message: "Untracked file is too large to include in Review diff.",
      });
      files.set(path, {
        path,
        status: "added",
        additions: 0,
        deletions: 0,
        chunks: [],
        sortStatus: "",
      });
      continue;
    }
    const buffer = await readFile(absolutePath);
    if (buffer.includes(0)) {
      warnings.push({
        kind: "binary_skipped",
        filePath: path,
        message: "Binary untracked file was skipped.",
      });
      files.set(path, {
        path,
        status: "added",
        additions: 0,
        deletions: 0,
        chunks: [],
        sortStatus: "",
      });
      continue;
    }
    totalBytes += size;
    files.set(path, createUntrackedFileChange(path, buffer.toString("utf8")));
  }
}

function createUntrackedFileChange(path: string, content: string): ParsedFile {
  const lines = content.split(/\r?\n/);
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }
  const additions = lines.length;
  const body = [
    `@@ -0,0 +1,${Math.max(additions, 1)} @@`,
    ...lines.map((line) => `+${line}`),
  ].join("\n");
  return {
    path,
    status: "added",
    additions,
    deletions: 0,
    chunks: [
      {
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: additions,
        unifiedText: body,
      },
    ],
    sortStatus: "",
  };
}

function isInsideRoot(root: string, absolutePath: string): boolean {
  const rel = relative(root, absolutePath);
  return !rel.startsWith("..") && !isAbsolute(rel);
}

function compareReviewFiles(a: ParsedFile, b: ParsedFile): number {
  const statusCompare = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
  if (statusCompare !== 0) return statusCompare;
  return a.path.localeCompare(b.path);
}

function createChangeSet(
  workspaceRoot: string,
  baselineLabel: string,
  files: ParsedFile[],
  warnings: ReviewWarning[],
): ReviewChangeSet {
  const cleanedFiles: ReviewFileChange[] = files.map(({ sortStatus: _sortStatus, ...file }) => file);
  const totalAdditions = cleanedFiles.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = cleanedFiles.reduce((sum, file) => sum + file.deletions, 0);
  return {
    id: `review:${workspaceRoot.split(sep).join("/")}:git:uncommitted`,
    workspaceRoot,
    source: "git",
    scope: "uncommitted",
    baseline: {
      kind: "git-ref",
      label: baselineLabel,
    },
    files: cleanedFiles,
    totalAdditions,
    totalDeletions,
    generatedAt: new Date().toISOString(),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
