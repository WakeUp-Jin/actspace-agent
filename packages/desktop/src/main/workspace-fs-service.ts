/**
 * 工作区文件浏览器的 main 侧服务。
 *
 * 职责（见 `docs/design-docs/front-右侧面板与文件渲染规范.md`）：
 * - `listWorkspaceDir`：懒加载一层目录（忽略名单 + 条目上限 + 目录在前排序）。
 * - `readWorkspaceFile`：读单文件（大小上限 + 二进制识别 + 图片 data URL + renderKind 判定 + text 类语言推断）。
 *
 * 安全：renderer 不碰 FS，全部经此服务；**浏览器入口强约束在 workspaceRoot 内**，
 * 故意不复用读类工具放开越界的 resolveReadablePath（面向用户的可点界面不应暴露整盘）。
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import type {
  WorkspaceDirEntry,
  WorkspaceFileRenderKind,
  WorkspaceListDirInput,
  WorkspaceListDirResult,
  WorkspaceReadFileInput,
  WorkspaceReadFileResult,
} from "@actspace/shared";
import type { AppDataRoots } from "./agent-turn";

/** 一次性铺开会拖垮 UI 的大目录，直接从树里隐藏。 */
const IGNORED_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".pnpm-store",
  "dist",
  ".next",
  ".turbo",
  "coverage",
  ".DS_Store",
]);

const MAX_ENTRIES = 1000;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

/** text 类扩展名 → highlight.js 语言 id（确定性映射，不做 highlightAuto）。 */
const LANGUAGE_BY_EXT: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".css": "css",
  ".scss": "scss",
  ".less": "less",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".json": "json",
  ".jsonc": "json",
  ".toml": "toml",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".sql": "sql",
};

const MARKDOWN_EXTS = new Set([".md", ".markdown"]);
const HTML_EXTS = new Set([".html", ".htm"]);

function resolveRoot(input: { workspaceRoot?: string }, roots: AppDataRoots): string {
  return resolve(input.workspaceRoot ?? roots.defaultWorkspaceRoot);
}

/** 规范化相对路径为不含 `./`、`..`、首尾斜杠的 POSIX 形式；空 / "." → 根。 */
function normalizeRelative(relativePath: string | undefined): string {
  return (relativePath ?? "")
    .replace(/\\/g, "/")
    .replace(/^\.(?=\/|$)/, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

/** 把绝对路径解析回 root 内 POSIX 相对路径；越界返回 null。 */
function toInsideRoot(root: string, relativePath: string): { abs: string; rel: string } | null {
  const abs = resolve(root, relativePath);
  const rel = relative(root, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return null;
  }
  return { abs, rel: rel.split(sep).join("/") };
}

function renderKindOf(ext: string): WorkspaceFileRenderKind {
  if (MARKDOWN_EXTS.has(ext)) return "markdown";
  if (HTML_EXTS.has(ext)) return "html";
  if (ext in IMAGE_MIME_BY_EXT) return "image";
  return "text";
}

export async function listWorkspaceDir(
  input: WorkspaceListDirInput,
  roots: AppDataRoots,
): Promise<WorkspaceListDirResult> {
  const root = resolveRoot(input, roots);
  const normalized = normalizeRelative(input.relativePath);
  const inside = toInsideRoot(root, normalized);
  if (!inside) {
    return { root, relativePath: normalized, entries: [], error: "escapes_root" };
  }

  let dirEntries;
  try {
    const stats = await stat(inside.abs);
    if (!stats.isDirectory()) {
      return { root, relativePath: inside.rel, entries: [], error: "not_a_directory" };
    }
    dirEntries = await readdir(inside.abs, { withFileTypes: true });
  } catch {
    return { root, relativePath: inside.rel, entries: [], error: "not_found" };
  }

  const visible = dirEntries.filter((entry) => {
    if (entry.isDirectory()) return !IGNORED_DIR_NAMES.has(entry.name);
    return !IGNORED_DIR_NAMES.has(entry.name);
  });

  const tooMany = visible.length > MAX_ENTRIES;
  const capped = tooMany ? visible.slice(0, MAX_ENTRIES) : visible;

  const entries: WorkspaceDirEntry[] = await Promise.all(
    capped.map(async (entry) => {
      const childRel = inside.rel ? `${inside.rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        return { name: entry.name, relativePath: childRel, kind: "dir" as const };
      }
      let size: number | undefined;
      try {
        size = (await stat(resolve(inside.abs, entry.name))).size;
      } catch {
        size = undefined;
      }
      return { name: entry.name, relativePath: childRel, kind: "file" as const, size };
    }),
  );

  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    root,
    relativePath: inside.rel,
    entries,
    ...(tooMany ? { error: "too_many_entries" as const } : {}),
  };
}

export async function readWorkspaceFile(
  input: WorkspaceReadFileInput,
  roots: AppDataRoots,
): Promise<WorkspaceReadFileResult> {
  const root = resolveRoot(input, roots);
  const normalized = normalizeRelative(input.relativePath);
  const inside = toInsideRoot(root, normalized);
  if (!inside) {
    return { relativePath: normalized, renderKind: "text", size: 0, error: "escapes_root" };
  }

  let size: number;
  try {
    const stats = await stat(inside.abs);
    if (stats.isDirectory()) {
      return { relativePath: inside.rel, renderKind: "text", size: 0, error: "not_a_file" };
    }
    size = stats.size;
  } catch {
    return { relativePath: inside.rel, renderKind: "text", size: 0, error: "not_found" };
  }

  const ext = extname(inside.rel).toLowerCase();
  const renderKind = renderKindOf(ext);

  if (renderKind === "image") {
    if (size > MAX_IMAGE_BYTES) {
      return { relativePath: inside.rel, renderKind, size, error: "too_large" };
    }
    const buffer = await readFile(inside.abs);
    const mime = IMAGE_MIME_BY_EXT[ext] ?? "application/octet-stream";
    return {
      relativePath: inside.rel,
      renderKind,
      size,
      dataUrl: `data:${mime};base64,${buffer.toString("base64")}`,
    };
  }

  // markdown / html / text 都按 UTF-8 文本读，超限直接 too_large（V1 不做部分读）。
  if (size > MAX_TEXT_BYTES) {
    return { relativePath: inside.rel, renderKind, size, error: "too_large" };
  }

  const buffer = await readFile(inside.abs);
  // 纯文本类做二进制识别：含 NUL 字节判定二进制，不把乱码塞进 Tab。
  if (renderKind === "text" && buffer.includes(0)) {
    return { relativePath: inside.rel, renderKind, size, error: "binary" };
  }

  const result: WorkspaceReadFileResult = {
    relativePath: inside.rel,
    renderKind,
    size,
    content: buffer.toString("utf8"),
  };
  if (renderKind === "text" && ext in LANGUAGE_BY_EXT) {
    result.language = LANGUAGE_BY_EXT[ext];
  }
  return result;
}
