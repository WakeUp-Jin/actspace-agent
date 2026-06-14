import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ToolResult } from "../../../internal-tools";
import { runRipgrep, getRipgrepFailureMessage } from "../../subprocess/ripgrep";
import { resolveReadablePath, displayReadablePath } from "../../workspace-guard";
import type { ToolExecutorFn } from "../../types";

const MAX_RESULTS = 200;

interface FileEntry {
  path: string;
  sizeBytes?: number;
  mtimeMs?: number;
}

export const globExecutor: ToolExecutorFn = async (
  args,
  workspaceRoot,
): Promise<ToolResult> => {
  const pattern = typeof args.pattern === "string" ? args.pattern : "";
  if (!pattern) {
    return { success: false, error: "pattern is required" };
  }

  const searchPathArg = typeof args.path === "string" && args.path
    ? args.path
    : workspaceRoot;

  // 读类工具不受 workspace 边界限制；只解析路径。
  const guard = resolveReadablePath(searchPathArg, workspaceRoot);
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const scope = resolveGlobScope(guard.resolvedPath, pattern);
  const searchRoot = resolve(scope.searchRoot);

  const result = await runRipgrep({
    args: ["--files", "--glob", scope.globPattern, "--color", "never", searchRoot],
    cwd: workspaceRoot,
  });

  if (result.timedOut || result.notFound || result.exitCode === 2 || result.startError) {
    return { success: false, error: getRipgrepFailureMessage(result) };
  }

  if (result.exitCode === 1 || !result.stdout.trim()) {
    return { success: true, data: `No files found matching "${pattern}"` };
  }

  const entries = await collectFileEntries(result.stdout, searchRoot, workspaceRoot);
  if (entries.length === 0) {
    return { success: true, data: `No files found matching "${pattern}"` };
  }

  entries.sort((a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0));
  const limited = entries.slice(0, MAX_RESULTS);

  const output = limited.map(formatFileEntry).join("\n");
  const header = `Found ${entries.length} file${entries.length > 1 ? "s" : ""}${entries.length > MAX_RESULTS ? ` (showing first ${MAX_RESULTS})` : ""} matching "${pattern}":\n\n`;
  const suffix = result.truncated ? "\n\n[Output truncated by ripgrep runner]" : "";

  return { success: true, data: header + output + suffix };
};

function normalizeGlobPattern(pattern: string): string {
  if (pattern.startsWith("**/") || pattern.includes("/") || pattern.startsWith("!")) {
    return pattern;
  }

  return `**/${pattern}`;
}

function resolveGlobScope(searchRoot: string, pattern: string): { searchRoot: string; globPattern: string } {
  if (!pattern.includes("/") || pattern.startsWith("**/") || pattern.startsWith("!")) {
    return {
      searchRoot,
      globPattern: normalizeGlobPattern(pattern),
    };
  }

  const parts = pattern.split("/");
  const staticParts: string[] = [];

  for (const part of parts) {
    if (hasGlobMagic(part)) break;
    staticParts.push(part);
  }

  if (staticParts.length === 0) {
    return {
      searchRoot,
      globPattern: normalizeGlobPattern(pattern),
    };
  }

  const remaining = parts.slice(staticParts.length).join("/");
  return {
    searchRoot: join(searchRoot, ...staticParts),
    globPattern: normalizeGlobPattern(remaining || "*"),
  };
}

function hasGlobMagic(value: string): boolean {
  return /[*?[\]{}]/.test(value);
}

async function collectFileEntries(stdout: string, searchRoot: string, workspaceRoot: string): Promise<FileEntry[]> {
  const paths = stdout.trim().split("\n").map((line) => line.trim()).filter(Boolean);
  const entries: FileEntry[] = [];

  for (const path of paths) {
    const absolutePath = resolveRipgrepFilePath(path, searchRoot);
    // workspace 内显示相对路径，workspace 外显示绝对路径（读边界已放开）。
    const displayPath = displayReadablePath(absolutePath, workspaceRoot);

    try {
      const fileStat = await stat(absolutePath);
      entries.push({ path: displayPath, sizeBytes: fileStat.size, mtimeMs: fileStat.mtimeMs });
    } catch {
      entries.push({ path: displayPath });
    }
  }

  return entries;
}

function formatFileEntry(entry: FileEntry): string {
  return `${entry.path} | size: ${formatFileSize(entry.sizeBytes)} | modified: ${formatModifiedTime(entry.mtimeMs)}`;
}

function formatFileSize(sizeBytes: number | undefined): string {
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return "unknown";
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = sizeBytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatModifiedTime(mtimeMs: number | undefined): string {
  if (typeof mtimeMs !== "number" || !Number.isFinite(mtimeMs) || mtimeMs <= 0) {
    return "unknown";
  }

  return new Date(mtimeMs).toISOString();
}

function resolveRipgrepFilePath(path: string, searchRoot: string): string {
  if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)) {
    return path;
  }

  return join(searchRoot, path);
}
