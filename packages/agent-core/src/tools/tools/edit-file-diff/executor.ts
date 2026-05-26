import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import * as Diff from "diff";
import type { ToolResult, ResultRenderer } from "../../../internal-tools";
import { guardWorkspacePath } from "../../workspace-guard";
import { writeTextAtomic } from "../shared/write-atomic";
import type { ToolExecutorFn } from "../../types";

const QUOTE_MAP: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u2032": "'",
  "\u2033": '"',
};

function normalizeQuotes(s: string): string {
  let result = s;
  for (const [fancy, plain] of Object.entries(QUOTE_MAP)) {
    result = result.replaceAll(fancy, plain);
  }
  return result;
}

function countPrefixedLines(diff: string, prefix: string): number {
  return diff.split("\n").filter((l) => l.startsWith(prefix) && !l.startsWith(`${prefix}${prefix}`)).length;
}

export const editFileDiffExecutor: ToolExecutorFn = async (
  args,
  workspaceRoot,
): Promise<ToolResult> => {
  const pathArg = typeof args.path === "string" ? args.path : "";
  let oldString = typeof args.old_string === "string" ? args.old_string : "";
  let newString = typeof args.new_string === "string" ? args.new_string : "";
  const replaceAll = Boolean(args.replace_all);

  if (!pathArg) return { success: false, error: "path is required" };
  if (oldString === newString) return { success: false, error: "old_string and new_string must be different" };

  const guard = guardWorkspacePath(pathArg, workspaceRoot);
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const fileExists = existsSync(guard.resolvedPath);

  // old_string empty + file does not exist → create new file
  if (!fileExists && oldString === "") {
    await writeTextAtomic(guard.resolvedPath, newString);
    const diff = Diff.createTwoFilesPatch(pathArg, pathArg, "", newString, "", "", { context: 3 });
    return {
      success: true,
      data: {
        type: "create",
        filePath: guard.resolvedPath,
        diff,
        additions: countPrefixedLines(diff, "+"),
        deletions: 0,
        chars: newString.length,
      },
    };
  }

  if (!fileExists) {
    return { success: false, error: `File not found: ${pathArg}` };
  }

  let content: string;
  try {
    content = await readFile(guard.resolvedPath, "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Cannot read file: ${msg}` };
  }

  // old_string empty + file is not empty → error
  if (oldString === "" && content !== "") {
    return { success: false, error: "old_string is empty but target file is not empty" };
  }

  // old_string empty + file is empty → write new content
  if (oldString === "") {
    await writeTextAtomic(guard.resolvedPath, newString);
    const diff = Diff.createTwoFilesPatch(pathArg, pathArg, "", newString, "", "", { context: 3 });
    return {
      success: true,
      data: {
        type: "update",
        filePath: guard.resolvedPath,
        diff,
        additions: countPrefixedLines(diff, "+"),
        deletions: 0,
        chars: newString.length,
      },
    };
  }

  // Try direct match first, then quote-normalized match
  let matches = content.split(oldString).length - 1;

  if (matches === 0) {
    const normOld = normalizeQuotes(oldString);
    const normContent = normalizeQuotes(content);

    if (normContent.includes(normOld)) {
      const idx = normContent.indexOf(normOld);
      const actualOld = content.slice(idx, idx + oldString.length);

      for (const [fancy, plain] of Object.entries(QUOTE_MAP)) {
        if (actualOld.includes(fancy) && newString.includes(plain)) {
          newString = newString.replaceAll(plain, fancy);
        }
      }

      oldString = actualOld;
      matches = content.split(oldString).length - 1;
    } else {
      return {
        success: false,
        error: "old_string not found in file. Read the file first to verify the current content.",
      };
    }
  }

  if (matches > 1 && !replaceAll) {
    return {
      success: false,
      error: `old_string matches ${matches} locations. Include more context to make it unique, or set replace_all=true.`,
    };
  }

  // Perform replacement
  let updated: string;
  if (newString === "") {
    // Deletion: also remove trailing newline to avoid blank residue
    const withNewline = oldString.endsWith("\n") ? oldString : oldString + "\n";
    if (!oldString.endsWith("\n") && content.includes(withNewline)) {
      updated = replaceAll ? content.replaceAll(withNewline, "") : content.replace(withNewline, "");
    } else {
      updated = replaceAll ? content.replaceAll(oldString, "") : content.replace(oldString, "");
    }
  } else {
    updated = replaceAll ? content.replaceAll(oldString, newString) : content.replace(oldString, newString);
  }

  // Generate diff before writing
  const diff = Diff.createTwoFilesPatch(pathArg, pathArg, content, updated, "", "", { context: 3 });

  await writeTextAtomic(guard.resolvedPath, updated);

  return {
    success: true,
    data: {
      type: "update",
      filePath: guard.resolvedPath,
      diff,
      additions: countPrefixedLines(diff, "+"),
      deletions: countPrefixedLines(diff, "-"),
      chars: updated.length,
      replaceAll,
      matches,
    },
  };
};

export const renderEditResult: ResultRenderer = (result) => {
  if (!result.success) return `Error: ${result.error}`;
  const d = result.data as Record<string, unknown> | undefined;
  if (!d) return "Edit completed.";
  const diff = typeof d.diff === "string" ? d.diff : "";
  const fp = typeof d.filePath === "string" ? d.filePath : "";
  if (d.type === "create") return `${diff}\n\nFile created: ${fp}`;
  return `${diff}\n\nFile updated: ${fp}`;
};
