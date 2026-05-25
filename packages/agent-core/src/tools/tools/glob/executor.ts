import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { ToolResult } from "../../../internal-tools";
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

  const searchPath = typeof args.path === "string" && args.path
    ? join(workspaceRoot, args.path)
    : workspaceRoot;

  const guard = guardWorkspacePath(searchPath, workspaceRoot);
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  try {
    const matcher = createGlobMatcher(pattern);
    const entries: FileEntry[] = [];
    await walkAndMatch(searchPath, workspaceRoot, matcher, entries);

    if (entries.length === 0) {
      return { success: true, data: `No files found matching "${pattern}"` };
    }

    // Sort by modification time, most recent first
    entries.sort((a, b) => b.mtime - a.mtime);
    const limited = entries.slice(0, MAX_RESULTS);

    const output = limited.map((e) => e.path).join("\n");
    const header = `Found ${entries.length} file${entries.length > 1 ? "s" : ""}${entries.length > MAX_RESULTS ? ` (showing first ${MAX_RESULTS})` : ""} matching "${pattern}":\n\n`;

    return { success: true, data: header + output };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Glob search failed: ${msg}` };
  }
};

async function walkAndMatch(
  dir: string,
  workspaceRoot: string,
  matcher: (path: string) => boolean,
  results: FileEntry[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }

    const fullPath = join(dir, entry.name);
    const relPath = relative(workspaceRoot, fullPath);

    if (entry.isDirectory()) {
      await walkAndMatch(fullPath, workspaceRoot, matcher, results);
    } else if (entry.isFile()) {
      if (matcher(relPath)) {
        try {
          const fileStat = await stat(fullPath);
          results.push({ path: relPath, mtime: fileStat.mtimeMs });
        } catch {
          results.push({ path: relPath, mtime: 0 });
        }
      }
    }
  }
}

function createGlobMatcher(pattern: string): (path: string) => boolean {
  // Normalize: if pattern doesn't start with ** and has no path separator, add **/
  let normalizedPattern = pattern;
  if (!pattern.startsWith("**/") && !pattern.includes("/")) {
    normalizedPattern = `**/${pattern}`;
  }

  const regexStr = globToRegex(normalizedPattern);
  const regex = new RegExp(`^${regexStr}$`);
  return (path: string) => regex.test(path);
}

function globToRegex(glob: string): string {
  let result = "";
  let i = 0;

  while (i < glob.length) {
    const ch = glob[i];

    if (ch === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          // **/ matches zero or more directory levels
          result += "(?:.*/)?";
          i += 3;
        } else {
          // ** at end matches everything
          result += ".*";
          i += 2;
        }
      } else {
        // * matches anything except /
        result += "[^/]*";
        i++;
      }
    } else if (ch === "?") {
      result += "[^/]";
      i++;
    } else if (ch === "{") {
      const end = glob.indexOf("}", i);
      if (end !== -1) {
        const alternatives = glob.slice(i + 1, end).split(",");
        result += `(?:${alternatives.map(escapeRegex).join("|")})`;
        i = end + 1;
      } else {
        result += escapeRegex(ch);
        i++;
      }
    } else {
      result += escapeRegex(ch);
      i++;
    }
  }

  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
