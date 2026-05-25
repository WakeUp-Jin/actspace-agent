import { stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { ToolResult } from "../../../internal-tools";
import { runRipgrep, getRipgrepFailureMessage } from "../../subprocess/ripgrep";
import { guardWorkspacePath } from "../../workspace-guard";
import type { ToolExecutorFn } from "../../types";

const MAX_RESULTS = 200;

interface FileEntry {
  path: string;
  mtime: number;
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
  const searchPath = resolve(workspaceRoot, searchPathArg);

  const guard = guardWorkspacePath(searchPath, workspaceRoot);
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const scope = resolveGlobScope(guard.resolvedPath, pattern);
  const scopeGuard = guardWorkspacePath(scope.searchRoot, workspaceRoot);
  if (!scopeGuard.ok) {
    return { success: false, error: scopeGuard.error };
  }

  const result = await runRipgrep({
    args: ["--files", "--glob", scope.globPattern, "--color", "never", scopeGuard.resolvedPath],
    cwd: workspaceRoot,
  });

  if (result.timedOut || result.notFound || result.exitCode === 2 || result.startError) {
    return { success: false, error: getRipgrepFailureMessage(result) };
  }

  if (result.exitCode === 1 || !result.stdout.trim()) {
    return { success: true, data: `No files found matching "${pattern}"` };
  }

  const entries = await collectFileEntries(result.stdout, scopeGuard.resolvedPath, workspaceRoot);
  if (entries.length === 0) {
    return { success: true, data: `No files found matching "${pattern}"` };
  }

  entries.sort((a, b) => b.mtime - a.mtime);
  const limited = entries.slice(0, MAX_RESULTS);

  const output = limited.map((e) => e.path).join("\n");
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
    const guard = guardWorkspacePath(absolutePath, workspaceRoot);
    if (!guard.ok) {
      continue;
    }

    try {
      const fileStat = await stat(guard.resolvedPath);
      entries.push({
        path: relative(workspaceRoot, guard.resolvedPath),
        mtime: fileStat.mtimeMs,
      });
    } catch {
      entries.push({
        path: relative(workspaceRoot, guard.resolvedPath),
        mtime: 0,
      });
    }
  }

  return entries;
}

function resolveRipgrepFilePath(path: string, searchRoot: string): string {
  if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)) {
    return path;
  }

  return join(searchRoot, path);
}
