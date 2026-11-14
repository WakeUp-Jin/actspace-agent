/**
 * 工作区文件浏览器的 main 侧服务。
 *
 * 职责（见 `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`）：
 * - `listWorkspaceMarkdownFiles`：一次取回工作区全部 Markdown 的相对路径清单（git 仓库走 `git ls-files`，否则有上限的递归遍历）。
 * - `writeWorkspaceMarkdownFile`：把「文档」面板里编辑的内容写回一个已存在的 Markdown 文件。
 * - `readWorkspaceFile`：读单文件（markdown 文本 + 图片 data URL + renderKind 判定；其余 external 只返回 stat）。
 * - `statWorkspaceFile`：只取 size / mtime，供右侧面板做已打开 Tab 的新鲜度重校验。
 *
 * 安全：renderer 不碰 FS，全部经此服务；**浏览器入口强约束在 workspaceRoot 内**，
 * 故意不复用读类工具放开越界的 resolveReadablePath（面向用户的可点界面不应暴露整盘）。
 */

import { randomBytes } from "node:crypto";
import { open, readdir, rename, stat, unlink, writeFile, type FileHandle } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { WORKSPACE_TEXT_PREVIEW_LIMIT_BYTES } from "@actspace/shared";
import type {
  WorkspaceFileRenderKind,
  WorkspaceListMarkdownFilesResult,
  WorkspaceReadFileInput,
  WorkspaceReadFileResult,
  WorkspaceStatFileInput,
  WorkspaceStatFileResult,
  WorkspaceWriteMarkdownFileInput,
  WorkspaceWriteMarkdownFileResult,
} from "@actspace/shared";
import type { AppDataRoots } from "./app-paths";
import { runGitCommand, type GitRunner } from "./git/run-git";
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

/** Markdown 清单最多返回多少篇、非 git 遍历最多访问多少个目录项；超过就停止并标 truncated。 */
export const MARKDOWN_LIST_MAX_FILES = 5000;
export const MARKDOWN_WALK_MAX_ENTRIES = 50_000;
/** 用户点「继续加载」后两个上限都放大这么多倍。 */
export const MARKDOWN_LIST_EXPANDED_FACTOR = 4;
/** 截断时最多报告多少个没走完的目录。 */
const MARKDOWN_INCOMPLETE_DIRS_MAX = 20;
const GIT_LIST_TIMEOUT_MS = 15_000;
const GIT_LIST_MAX_OUTPUT_CHARS = 8 * 1024 * 1024;

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

  // 先 open 再用同一句柄 stat 和读：stat 与读取之间文件不会被换掉。
  let handle: FileHandle;
  try {
    handle = await open(inside.abs, "r");
  } catch (error) {
    // Windows 打开目录直接报 EISDIR；POSIX 能打开目录，交给下面的 isDirectory() 判断。
    const code = (error as NodeJS.ErrnoException).code;
    return {
      relativePath: inside.rel,
      renderKind: "external",
      size: 0,
      mtimeMs: 0,
      error: code === "EISDIR" ? "not_a_file" : "not_found",
    };
  }
  try {
    let size: number;
    let mtimeMs: number;
    try {
      const stats = await handle.stat();
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
      const buffer = await handle.readFile();
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
    const buffer = truncated ? await readHead(handle, MAX_TEXT_BYTES) : await handle.readFile();

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
  } finally {
    await handle.close();
  }
}

/** 只读文件开头 `limit` 字节，避免把整个大文件载入内存。 */
async function readHead(handle: FileHandle, limit: number): Promise<Buffer> {
  const buffer = Buffer.alloc(limit);
  const { bytesRead } = await handle.read(buffer, 0, limit, 0);
  return buffer.subarray(0, bytesRead);
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

const MARKDOWN_NAME = /\.(?:md|markdown)$/i;

function byPath(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 扩展名大小写不敏感（`README.MD`、`a.Markdown` 也算）。 */
const GIT_MARKDOWN_PATHSPECS = [":(icase)*.md", ":(icase)*.markdown"];
const GIT_LIST_OPTIONS = {
  timeoutMs: GIT_LIST_TIMEOUT_MS,
  maxOutputChars: GIT_LIST_MAX_OUTPUT_CHARS,
  env: { LC_ALL: "C" },
};

type MarkdownLimits = { maxFiles: number; maxEntries: number };
type MarkdownListing = { files: string[]; truncated: boolean; incompleteDirs?: string[] };

/** 截断时报告没走完的顶层目录：取路径第一段去重（根目录本身记作 `.`），保持遍历顺序。 */
function topLevelDirs(paths: Iterable<string>): string[] {
  const seen = new Set<string>();
  for (const path of paths) {
    seen.add(path.split("/")[0] || ".");
    if (seen.size >= MARKDOWN_INCOMPLETE_DIRS_MAX) break;
  }
  return [...seen];
}

/** 在 `cwd` 里用 `git ls-files` 列 Markdown；不是仓库、没有 git、超时返回 null。路径相对 `cwd`。 */
async function gitMarkdownNames(
  cwd: string,
  runGit: GitRunner,
): Promise<{ names: string[]; outputTruncated: boolean } | null> {
  const result = await runGit(
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...GIT_MARKDOWN_PATHSPECS],
    { cwd, ...GIT_LIST_OPTIONS },
  );
  if (result.startError || result.timedOut || result.exitCode !== 0) return null;
  // 已被 git 跟踪、但磁盘上已经删掉的文件仍在 `--cached` 里，要排除掉（点开只会读取失败）。
  const deleted = new Set<string>();
  const deletedResult = await runGit(["ls-files", "-z", "--deleted", "--", ...GIT_MARKDOWN_PATHSPECS], {
    cwd,
    ...GIT_LIST_OPTIONS,
  });
  if (!deletedResult.startError && !deletedResult.timedOut && deletedResult.exitCode === 0) {
    for (const name of deletedResult.stdout.split("\0")) if (name.length > 0) deleted.add(name);
  }
  const names = result.stdout.split("\0").filter((name) => !deleted.has(name));
  // 输出被截断时最后一项可能只有半截路径，丢掉。
  if (result.truncated) names.pop();
  // 再按扩展名核对一次，保证两种来源的判定口径一致（都不区分大小写）。
  return {
    names: [...new Set(names.filter((name) => name.length > 0 && MARKDOWN_NAME.test(name)))],
    outputTruncated: result.truncated,
  };
}

async function listMarkdownViaGit(
  root: string,
  runGit: GitRunner,
  limits: MarkdownLimits,
): Promise<MarkdownListing | null> {
  const listed = await gitMarkdownNames(root, runGit);
  if (!listed) return null;
  const unique = listed.names.sort(byPath);
  const overLimit = unique.length > limits.maxFiles;
  const truncated = overLimit || listed.outputTruncated;
  if (!truncated) return { files: unique, truncated: false };
  const kept = unique.slice(0, limits.maxFiles);
  // 截断点所在目录和它之后的目录都不完整；输出被截断时只能确定最后一项所在目录。
  const cut = overLimit ? unique.slice(limits.maxFiles - 1) : kept.slice(-1);
  return { files: kept, truncated: true, incompleteDirs: topLevelDirs(cut) };
}

/**
 * 非 git 根目录的有上限遍历。遇到本身是 git 仓库的子目录（含 `.git`）改用 `git ls-files` 整块列出，
 * 不再逐项遍历：既遵守它自己的 `.gitignore`，也不会因为一两个大仓库把访问项数用光。
 */
async function walkMarkdown(root: string, runGit: GitRunner, limits: MarkdownLimits): Promise<MarkdownListing> {
  const files: string[] = [];
  let visited = 0;
  let truncated = false;
  let incomplete: string[] = [];
  // 显式栈 + 按名字排序，截断时保留的是稳定的「前一部分」。不跟随 symlink：Dirent 对 symlink 既不是目录也不是文件。
  const stack: string[] = [""];
  while (stack.length > 0 && !truncated) {
    const rel = stack.pop() as string;
    let entries;
    try {
      entries = await readdir(rel ? resolve(root, rel) : root, { withFileTypes: true });
    } catch {
      continue;
    }
    if (rel && entries.some((entry) => entry.name === ".git")) {
      const nested = await gitMarkdownNames(resolve(root, rel), runGit);
      if (nested) {
        visited += 1;
        const names = nested.names.sort(byPath);
        const room = limits.maxFiles - files.length;
        for (const name of names.slice(0, Math.max(0, room))) files.push(`${rel}/${name}`);
        if (names.length > room || nested.outputTruncated) {
          truncated = true;
          incomplete = [rel, ...stack.slice().reverse()];
        }
        continue;
      }
    }
    entries.sort((a, b) => byPath(a.name, b.name));
    const subdirs: string[] = [];
    for (const entry of entries) {
      visited += 1;
      if (visited > limits.maxEntries) {
        truncated = true;
        break;
      }
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (IGNORED_DIR_NAMES.has(entry.name) || entry.name.startsWith(".")) continue;
        subdirs.push(childRel);
      } else if (entry.isFile() && MARKDOWN_NAME.test(entry.name)) {
        if (files.length >= limits.maxFiles) {
          truncated = true;
          break;
        }
        files.push(childRel);
      }
    }
    if (truncated && incomplete.length === 0) {
      // 当前目录走到一半；它已收进栈的子目录和栈里剩下的目录都没走。栈顶是下一个要走的，倒过来就是遍历顺序。
      incomplete = [rel, ...stack.slice().reverse()];
      break;
    }
    for (let index = subdirs.length - 1; index >= 0; index -= 1) stack.push(subdirs[index]);
  }
  files.sort(byPath);
  return truncated ? { files, truncated, incompleteDirs: topLevelDirs(incomplete) } : { files, truncated };
}

/**
 * 一次取回工作区里全部 Markdown 的相对路径（不读内容）。
 * git 仓库：`git ls-files --cached --others --exclude-standard`，遵守 `.gitignore` 且包含未跟踪的新文件；
 * 否则退回有上限的递归遍历（跳过忽略名单和所有 `.` 开头的目录，不跟随 symlink；本身是 git 仓库的子目录改用 `git ls-files`）。
 * 截断时给出没走完的顶层目录；`expanded` 是用户点了「继续加载」，上限放大 `MARKDOWN_LIST_EXPANDED_FACTOR` 倍。
 * `workspaceRoot` 必须是绝对路径，其访问权限由调用方（IPC handler）先校验。
 */
export async function listWorkspaceMarkdownFiles(
  workspaceRoot: string,
  deps: { runGit: GitRunner } = { runGit: runGitCommand },
  options: { expanded?: boolean } = {},
): Promise<WorkspaceListMarkdownFilesResult> {
  if (!isAbsolute(workspaceRoot)) return { ok: false, error: "escapes_root" };
  const root = resolve(workspaceRoot);
  try {
    if (!(await stat(root)).isDirectory()) return { ok: false, error: "not_a_directory" };
  } catch {
    return { ok: false, error: "not_found" };
  }
  const factor = options.expanded ? MARKDOWN_LIST_EXPANDED_FACTOR : 1;
  const limits = { maxFiles: MARKDOWN_LIST_MAX_FILES * factor, maxEntries: MARKDOWN_WALK_MAX_ENTRIES * factor };
  const viaGit = await listMarkdownViaGit(root, deps.runGit, limits);
  if (viaGit) return { ok: true, ...viaGit, source: "git" };
  return { ok: true, ...(await walkMarkdown(root, deps.runGit, limits)), source: "walk" };
}

/**
 * 把内容写回一个**已存在**的工作区 Markdown 文件（不新建）。
 * 先对相对路径和 realpath 都核对 `.md` / `.markdown`，越界（含经 symlink 指到 root 外）一律拒绝；
 * 写临时文件再 rename，中途失败不会留下半截文件。不做 mtime 冲突检测（以人为准）。
 */
export async function writeWorkspaceMarkdownFile(
  input: WorkspaceWriteMarkdownFileInput,
): Promise<WorkspaceWriteMarkdownFileResult> {
  if (!isAbsolute(input.workspaceRoot)) return { ok: false, error: "escapes_root" };
  const root = resolve(input.workspaceRoot);
  const inside = await toInsideRoot(root, normalizeRelative(input.relativePath));
  if (!inside) return { ok: false, error: "escapes_root" };
  if (!MARKDOWN_NAME.test(inside.rel) || !MARKDOWN_NAME.test(inside.abs)) return { ok: false, error: "not_markdown" };

  let mode: number;
  try {
    const stats = await stat(inside.abs);
    if (!stats.isFile()) return { ok: false, error: "not_found" };
    mode = stats.mode & 0o777;
  } catch {
    return { ok: false, error: "not_found" };
  }

  const temp = `${inside.abs}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(temp, input.content, { encoding: "utf8", mode, flag: "wx" });
    await rename(temp, inside.abs);
    const written = await stat(inside.abs);
    return { ok: true, mtimeMs: written.mtimeMs, size: written.size };
  } catch {
    await unlink(temp).catch(() => undefined);
    return { ok: false, error: "write_failed" };
  }
}
