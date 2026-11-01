/**
 * 工作区文件浏览器的 main 侧服务。
 *
 * 职责（见 `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`）：
 * - `listWorkspaceDir`：懒加载一层目录（忽略名单 + 条目上限 + 目录在前排序）。
 * - `readWorkspaceFile`：读单文件（markdown 文本 + 图片 data URL + renderKind 判定；其余 external 只返回 stat）。
 * - `statWorkspaceFile`：只取 size / mtime，供右侧面板做已打开 Tab 的新鲜度重校验。
 *
 * 安全：renderer 不碰 FS，全部经此服务；**浏览器入口强约束在 workspaceRoot 内**，
 * 故意不复用读类工具放开越界的 resolveReadablePath（面向用户的可点界面不应暴露整盘）。
 */

import { open, readFile, readdir, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { WORKSPACE_TEXT_PREVIEW_LIMIT_BYTES } from "@actspace/shared";
import type {
  WorkspaceDirEntry,
  WorkspaceFileRenderKind,
  WorkspaceListDirInput,
  WorkspaceListDirResult,
  WorkspaceReadFileInput,
  WorkspaceReadFileResult,
  WorkspaceStatFileInput,
  WorkspaceStatFileResult,
} from "@actspace/shared";
import type { AppDataRoots } from "./app-paths";
import { isPathInside, realpathOfNearestExisting, realpathOrNull } from "./workspace-access";

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
// 上限定义在契约层：renderer 的截断提示条要复述同一个数（见 shared/ipc.ts）。
const MAX_TEXT_BYTES = WORKSPACE_TEXT_PREVIEW_LIMIT_BYTES;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

const MARKDOWN_EXTS = new Set([".md", ".markdown"]);

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

/**
 * 把相对路径解析成 root 内的绝对路径和 POSIX 相对路径；越界返回 null。
 * root 先 realpath；目标对最近存在的祖先做 realpath，所以经由 symlink 指到 root 外的路径（存在与否）都算越界。
 */
async function toInsideRoot(root: string, relativePath: string): Promise<{ abs: string; rel: string } | null> {
  const realRoot = (await realpathOrNull(root)) ?? resolve(root);
  const lexical = resolve(realRoot, relativePath);
  if (!isPathInside(realRoot, lexical)) return null;
  const real = await realpathOfNearestExisting(lexical);
  if (!isPathInside(realRoot, real)) return null;
  return { abs: real, rel: relative(realRoot, lexical).split(sep).join("/") };
}

function renderKindOf(ext: string): WorkspaceFileRenderKind {
  if (MARKDOWN_EXTS.has(ext)) return "markdown";
  if (ext in IMAGE_MIME_BY_EXT) return "image";
  return "external";
}

/**
 * 截断到最后一个完整行。
 * 直接按字节切会把多字节字符和最后一行切两半，前者产生乱码、后者让最后一行看起来像另一个语句。
 */
function sliceToLastCompleteLine(buffer: Buffer): string {
  const lastNewline = buffer.lastIndexOf(0x0a);
  const usable = lastNewline === -1 ? buffer : buffer.subarray(0, lastNewline + 1);
  return usable.toString("utf8");
}

export async function listWorkspaceDir(
  input: WorkspaceListDirInput,
  roots: AppDataRoots,
): Promise<WorkspaceListDirResult> {
  const root = resolveRoot(input, roots);
  const normalized = normalizeRelative(input.relativePath);
  const inside = await toInsideRoot(root, normalized);
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
  const inside = await toInsideRoot(root, normalized);
  if (!inside) {
    return { relativePath: normalized, renderKind: "external", size: 0, mtimeMs: 0, error: "escapes_root" };
  }

  let size: number;
  let mtimeMs: number;
  try {
    const stats = await stat(inside.abs);
    if (stats.isDirectory()) {
      return { relativePath: inside.rel, renderKind: "external", size: 0, mtimeMs: 0, error: "not_a_file" };
    }
    size = stats.size;
    mtimeMs = stats.mtimeMs;
  } catch {
    return { relativePath: inside.rel, renderKind: "external", size: 0, mtimeMs: 0, error: "not_found" };
  }

  const ext = extname(inside.rel).toLowerCase();
  const renderKind = renderKindOf(ext);

  if (renderKind === "image") {
    // 图片保留整体拒绝：截断的字节流无法解码成可显示的图，部分读没有意义。
    if (size > MAX_IMAGE_BYTES) {
      return { relativePath: inside.rel, renderKind, size, mtimeMs, error: "too_large" };
    }
    const buffer = await readFile(inside.abs);
    const mime = IMAGE_MIME_BY_EXT[ext] ?? "application/octet-stream";
    return {
      relativePath: inside.rel,
      renderKind,
      size,
      mtimeMs,
      dataUrl: `data:${mime};base64,${buffer.toString("base64")}`,
    };
  }

  // external 不读内容：由 renderer 交给系统默认应用打开，这里只给 stat。
  if (renderKind === "external") {
    return { relativePath: inside.rel, renderKind, size, mtimeMs };
  }

  // markdown 按 UTF-8 文本读。
  // 超限不再整体拒绝：只读上限内的完整行并标 truncated，让大文件至少前半段可读。
  const truncated = size > MAX_TEXT_BYTES;
  const buffer = truncated ? await readHead(inside.abs, MAX_TEXT_BYTES) : await readFile(inside.abs);

  const result: WorkspaceReadFileResult = {
    relativePath: inside.rel,
    renderKind,
    size,
    mtimeMs,
    content: truncated ? sliceToLastCompleteLine(buffer) : buffer.toString("utf8"),
  };
  if (truncated) {
    result.truncated = true;
  }
  return result;
}

/** 只读文件开头 `limit` 字节，避免把整个大文件载入内存。 */
async function readHead(absPath: string, limit: number): Promise<Buffer> {
  const handle = await open(absPath, "r");
  try {
    const buffer = Buffer.alloc(limit);
    const { bytesRead } = await handle.read(buffer, 0, limit, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * 只取 size / mtime，不读内容。
 * 右侧面板用它判断已打开的文件 Tab 是否已在磁盘上被改动（Agent 编辑、外部编辑器、git checkout）。
 */
export async function statWorkspaceFile(
  input: WorkspaceStatFileInput,
  roots: AppDataRoots,
): Promise<WorkspaceStatFileResult> {
  const root = resolveRoot(input, roots);
  const normalized = normalizeRelative(input.relativePath);
  const inside = await toInsideRoot(root, normalized);
  if (!inside) {
    return { relativePath: normalized, size: 0, mtimeMs: 0, error: "escapes_root" };
  }
  try {
    const stats = await stat(inside.abs);
    if (stats.isDirectory()) {
      return { relativePath: inside.rel, size: 0, mtimeMs: 0, error: "not_a_file" };
    }
    return { relativePath: inside.rel, size: stats.size, mtimeMs: stats.mtimeMs };
  } catch {
    return { relativePath: inside.rel, size: 0, mtimeMs: 0, error: "not_found" };
  }
}
