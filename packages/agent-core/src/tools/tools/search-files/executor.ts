import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { ToolResult } from "../../../internal-tools";
import { guardWorkspacePath } from "../../workspace-guard";
import type { ToolExecutorFn } from "../../types";

const MAX_RESULTS = 50;
const CONTEXT_LINES = 0;

interface SearchMatch {
  file: string;
  line: number;
  content: string;
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

export const searchFilesExecutor: ToolExecutorFn = async (
  args,
  workspaceRoot,
): Promise<ToolResult> => {
  const query = typeof args.query === "string" ? args.query : "";
  if (!query) {
    return { success: false, error: "query is required" };
  }

  const glob = typeof args.glob === "string" ? args.glob : undefined;

  const guard = guardWorkspacePath(workspaceRoot, workspaceRoot);
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  try {
    const files: string[] = [];
    await walkDir(workspaceRoot, files);

    const filtered = glob ? files.filter((f) => matchesGlob(f, glob)) : files;
    const matches: SearchMatch[] = [];

    for (const filePath of filtered) {
      if (matches.length >= MAX_RESULTS) break;

      try {
        const fileStat = await stat(filePath);
        if (fileStat.size > 1024 * 1024) continue;

        const content = await readFile(filePath, "utf-8");
        const lines = content.split("\n");

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(query)) {
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
      return {
        success: true,
        data: `No matches found for "${query}"`,
      };
    }

    const output = matches
      .map((m) => `${m.file}:${m.line}: ${m.content}`)
      .join("\n");

    const header = `Found ${matches.length} match${matches.length > 1 ? "es" : ""}${matches.length >= MAX_RESULTS ? ` (limited to ${MAX_RESULTS})` : ""}:\n\n`;

    return {
      success: true,
      data: header + output,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Search failed: ${msg}` };
  }
};
