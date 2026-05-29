import { relative } from "node:path";
import type { ToolResult } from "../../../internal-tools";
import { runRipgrep, getRipgrepFailureMessage } from "../../subprocess/ripgrep";
import { resolveReadablePath } from "../../workspace-guard";
import type { ToolExecutorFn } from "../../types";

const MAX_RESULTS = 100;

export const grepExecutor: ToolExecutorFn = async (
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
  const glob = typeof args.glob === "string" ? args.glob : undefined;

  // 读类工具不受 workspace 边界限制；只解析路径。
  const guard = resolveReadablePath(searchPathArg, workspaceRoot);
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const rgArgs = [
    "--line-number",
    "--no-heading",
    "--color", "never",
    "--max-count", String(MAX_RESULTS),
    "--max-filesize", "1M",
  ];

  if (glob) {
    rgArgs.push("--glob", glob);
  }

  rgArgs.push("--", pattern, guard.resolvedPath);

  const result = await runRipgrep({
    args: rgArgs,
    cwd: workspaceRoot,
  });

  if (result.timedOut || result.notFound || result.exitCode === 2 || result.startError) {
    return { success: false, error: getRipgrepFailureMessage(result) };
  }

  if (result.exitCode === 1 || !result.stdout.trim()) {
    return { success: true, data: `No matches found for pattern "${pattern}"` };
  }

  return formatGrepOutput(result.stdout, workspaceRoot, result.truncated);
};

function formatGrepOutput(stdout: string, workspaceRoot: string, truncated: boolean): ToolResult {
  const lines = stdout.trim().split("\n").filter(Boolean);

  if (lines.length === 0) {
    return { success: true, data: "No matches found" };
  }

  const output = lines.map((line) => normalizeGrepLine(line, workspaceRoot)).join("\n");
  const header = `Found ${lines.length} match${lines.length > 1 ? "es" : ""}${lines.length >= MAX_RESULTS ? ` (limited to ${MAX_RESULTS})` : ""}:\n\n`;
  const suffix = truncated ? "\n\n[Output truncated by ripgrep runner]" : "";

  return { success: true, data: header + output + suffix };
}

function normalizeGrepLine(line: string, workspaceRoot: string): string {
  if (line.startsWith(workspaceRoot)) {
    return line.slice(workspaceRoot.length + 1);
  }

  const separatorIndex = line.indexOf(":");
  if (separatorIndex === -1) {
    return line;
  }

  const filePath = line.slice(0, separatorIndex);
  if (!filePath.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(filePath)) {
    return line;
  }

  const rest = line.slice(separatorIndex);
  const rel = relative(workspaceRoot, filePath);
  return rel.startsWith("..") ? line : rel + rest;
}
