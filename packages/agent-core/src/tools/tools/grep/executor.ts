import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import type { ToolResult } from "../../../internal-tools";
import { guardWorkspacePath } from "../../workspace-guard";
import type { ToolExecutorFn } from "../../types";

const execFileAsync = promisify(execFile);
const MAX_RESULTS = 100;
const MAX_FILE_SIZE = 1024 * 1024;

interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

export const grepExecutor: ToolExecutorFn = async (
  args,
  workspaceRoot,
): Promise<ToolResult> => {
  const pattern = typeof args.pattern === "string" ? args.pattern : "";
  if (!pattern) {
    return { success: false, error: "pattern is required" };
  }

  const searchPath = typeof args.path === "string" && args.path
    ? join(workspaceRoot, args.path)
    : workspaceRoot;
  const glob = typeof args.glob === "string" ? args.glob : undefined;

  const guard = guardWorkspacePath(searchPath, workspaceRoot);
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  // Try ripgrep first (faster, respects .gitignore)
  const rgResult = await tryRipgrep(pattern, searchPath, workspaceRoot, glob);
  if (rgResult !== null) {
    return rgResult;
  }

  // Fallback to Node.js regex search
  return await nodeFallbackGrep(pattern, searchPath, workspaceRoot, glob);
};

async function tryRipgrep(
  pattern: string,
  searchPath: string,
  workspaceRoot: string,
  glob?: string,
): Promise<ToolResult | null> {
  try {
    const args = [
      "--line-number",
      "--no-heading",
      "--color", "never",
      "--max-count", String(MAX_RESULTS),
      "--max-filesize", "1M",
    ];

    if (glob) {
      args.push("--glob", glob);
    }

    args.push("--", pattern, searchPath);

    const { stdout } = await execFileAsync("rg", args, {
      maxBuffer: 1024 * 1024,
      timeout: 15_000,
    });

    return formatRgOutput(stdout, workspaceRoot);
  } catch (err: unknown) {
    const error = err as { code?: number | string; killed?: boolean; stdout?: string };
    if (error.code === "ENOENT") {
      return null; // rg not found, use fallback
    }
    if (error.code === 1 && !error.killed) {
      // rg exit code 1 = no matches
      return { success: true, data: `No matches found for pattern "${pattern}"` };
    }
    if (error.stdout) {
      return formatRgOutput(error.stdout, workspaceRoot);
    }
    return null; // unexpected error, use fallback
  }
}

function formatRgOutput(stdout: string, workspaceRoot: string): ToolResult {
  const lines = stdout.trim().split("\n").filter(Boolean);

  if (lines.length === 0) {
    return { success: true, data: "No matches found" };
  }

  const output = lines.map((line) => {
    if (line.startsWith(workspaceRoot)) {
      return line.slice(workspaceRoot.length + 1);
    }
    return line;
  }).join("\n");

  const header = `Found ${lines.length} match${lines.length > 1 ? "es" : ""}${lines.length >= MAX_RESULTS ? ` (limited to ${MAX_RESULTS})` : ""}:\n\n`;

  return { success: true, data: header + output };
}

async function nodeFallbackGrep(
  pattern: string,
  searchPath: string,
  workspaceRoot: string,
  glob?: string,
): Promise<ToolResult> {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    return { success: false, error: `Invalid regex pattern: ${pattern}` };
  }

  const files: string[] = [];
  await walkDir(searchPath, files);

  const filtered = glob ? files.filter((f) => matchesGlob(f, glob)) : files;
  const matches: GrepMatch[] = [];

  for (const filePath of filtered) {
    if (matches.length >= MAX_RESULTS) break;

    try {
      const fileStat = await stat(filePath);
      if (fileStat.size > MAX_FILE_SIZE) continue;

      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          matches.push({
            file: relative(workspaceRoot, filePath),
            line: i + 1,
            content: lines[i].trim(),
          });
          if (matches.length >= MAX_RESULTS) break;
        }
      }
    } catch {
      // skip unreadable files
    }
  }

  if (matches.length === 0) {
    return { success: true, data: `No matches found for pattern "${pattern}"` };
  }

  const output = matches
    .map((m) => `${m.file}:${m.line}: ${m.content}`)
    .join("\n");

  const header = `Found ${matches.length} match${matches.length > 1 ? "es" : ""}${matches.length >= MAX_RESULTS ? ` (limited to ${MAX_RESULTS})` : ""}:\n\n`;

  return { success: true, data: header + output };
}

async function walkDir(dir: string, results: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }
    if (entry.isDirectory()) {
      await walkDir(fullPath, results);
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
}

function matchesGlob(filePath: string, globPattern: string): boolean {
  const ext = globPattern.replace(/^\*/, "");
  if (globPattern.startsWith("*.") && !globPattern.includes("/")) {
    return filePath.endsWith(ext);
  }
  return true;
}
