/**
 * 工作区文件浏览器的 main 侧服务。
 *
 * 职责（见 `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`）：
 * - `listWorkspaceDir`：懒加载一层目录（忽略名单 + 条目上限 + 目录在前排序）。
 * - `readWorkspaceFile`：读单文件（大小上限 + 二进制识别 + 图片 data URL + renderKind 判定 + text 类语言推断）。
 * - `statWorkspaceFile`：只取 size / mtime，供右侧面板做已打开 Tab 的新鲜度重校验。
 *
 * 安全：renderer 不碰 FS，全部经此服务；**浏览器入口强约束在 workspaceRoot 内**，
 * 故意不复用读类工具放开越界的 resolveReadablePath（面向用户的可点界面不应暴露整盘）。
 */

import { open, readFile, readdir, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path";
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

/**
 * text 类扩展名 → highlight.js 语言 id（确定性映射，不做 highlightAuto）。
 *
 * 这里的**值域**必须与 renderer 侧 `right-panel/highlight.ts` 的按需注册表一致，
 * 否则文件会静默回退成纯文本。两侧各有一条单测锁住该约束。
 * 纯数据文本（`.txt` / `.log`）故意不给语言：误高亮比不高亮更干扰阅读。
 */
const LANGUAGE_BY_EXT: Record<string, string> = {
  // TypeScript / JavaScript
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  // 样式
  ".css": "css",
  ".scss": "scss",
  ".less": "less",
  // 标记 / 模板（Vue、Svelte、Astro 的单文件组件用 xml 语法最接近）
  ".vue": "xml",
  ".svelte": "xml",
  ".astro": "xml",
  ".xml": "xml",
  ".xsl": "xml",
  ".plist": "xml",
  ".mdx": "markdown",
  // 配置 / 序列化
  ".yaml": "yaml",
  ".yml": "yaml",
  ".json": "json",
  ".jsonc": "json",
  ".json5": "json",
  ".jsonl": "json",
  ".ndjson": "json",
  ".toml": "toml",
  ".ini": "ini",
  ".cfg": "ini",
  ".conf": "ini",
  ".properties": "ini",
  // Shell / 脚本
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".fish": "bash",
  ".ps1": "powershell",
  ".bat": "dos",
  ".cmd": "dos",
  // 通用编程语言
  ".py": "python",
  ".pyi": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".hh": "cpp",
  ".cs": "csharp",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".dart": "dart",
  ".lua": "lua",
  ".r": "r",
  ".pl": "perl",
  ".pm": "perl",
  ".ex": "elixir",
  ".exs": "elixir",
  ".scala": "scala",
  ".sql": "sql",
  // 基础设施 / 构建
  // highlight.js 不内置 HCL / Terraform 语法（第三方包才有），用 ini 近似：
  // `#` 注释、字符串和 `key = value` 都能正确着色，block 头行退化为纯文本，不会误标关键字。
  ".tf": "ini",
  ".tfvars": "ini",
  ".hcl": "ini",
  ".gradle": "gradle",
  ".cmake": "cmake",
  ".make": "makefile",
  ".mk": "makefile",
  ".dockerfile": "dockerfile",
  ".vim": "vim",
  // 数据 / 协议
  ".graphql": "graphql",
  ".gql": "graphql",
  ".proto": "protobuf",
  // 补丁
  ".diff": "diff",
  ".patch": "diff",
};

/**
 * 无扩展名 / dotfile 的 basename 兜底（小写精确匹配，优先于扩展名）。
 *
 * 必要性：`extname(".gitignore")` 返回空串，`extname("Dockerfile")` 也是空串，
 * 只靠扩展名这类文件永远拿不到语言。Go 的 `go.mod` / `go.sum` 也只有 basename 能判准。
 */
const LANGUAGE_BY_BASENAME: Record<string, string> = {
  dockerfile: "dockerfile",
  containerfile: "dockerfile",
  makefile: "makefile",
  gnumakefile: "makefile",
  justfile: "makefile",
  "cmakelists.txt": "cmake",
  "go.mod": "go",
  "go.sum": "go",
  "go.work": "go",
  ".npmrc": "ini",
  ".yarnrc": "ini",
  ".editorconfig": "ini",
  ".env": "bash",
  ".bashrc": "bash",
  ".zshrc": "bash",
  ".profile": "bash",
  ".prettierrc": "json",
  ".babelrc": "json",
  ".eslintrc": "json",
  ".gitignore": "plaintext",
  ".gitattributes": "plaintext",
  ".dockerignore": "plaintext",
  ".npmignore": "plaintext",
  ".prettierignore": "plaintext",
  codeowners: "plaintext",
};

/** basename 前缀 → 语言：覆盖 `.env.local`、`Dockerfile.dev` 这类带后缀变体。 */
const LANGUAGE_BY_BASENAME_PREFIX: ReadonlyArray<readonly [string, string]> = [
  [".env.", "bash"],
  ["dockerfile.", "dockerfile"],
  ["makefile.", "makefile"],
];

const MARKDOWN_EXTS = new Set([".md", ".markdown"]);
const HTML_EXTS = new Set([".html", ".htm"]);
const CSV_EXTS = new Set([".csv", ".tsv"]);

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
  if (CSV_EXTS.has(ext)) return "csv";
  return "text";
}

/**
 * 推断 highlight.js 语言 id。
 * 顺序：basename 精确匹配 → basename 前缀 → 扩展名；都不命中返回 undefined（渲染回退纯等宽）。
 * basename 优先于扩展名，因为 `CMakeLists.txt` 这类文件的扩展名会给出错误答案。
 */
export function languageOf(relativePath: string): string | undefined {
  const name = basename(relativePath).toLowerCase();
  const exact = LANGUAGE_BY_BASENAME[name];
  if (exact) return exact;
  for (const [prefix, language] of LANGUAGE_BY_BASENAME_PREFIX) {
    if (name.startsWith(prefix)) return language;
  }
  return LANGUAGE_BY_EXT[extname(name)];
}

/** 单测用：语言映射的全部值域，供 renderer 侧注册表比对，防止两侧漂移。 */
export function listMappedLanguages(): string[] {
  return [
    ...new Set([
      ...Object.values(LANGUAGE_BY_EXT),
      ...Object.values(LANGUAGE_BY_BASENAME),
      ...LANGUAGE_BY_BASENAME_PREFIX.map(([, language]) => language),
    ]),
  ].sort();
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
    return { relativePath: normalized, renderKind: "text", size: 0, mtimeMs: 0, error: "escapes_root" };
  }

  let size: number;
  let mtimeMs: number;
  try {
    const stats = await stat(inside.abs);
    if (stats.isDirectory()) {
      return { relativePath: inside.rel, renderKind: "text", size: 0, mtimeMs: 0, error: "not_a_file" };
    }
    size = stats.size;
    mtimeMs = stats.mtimeMs;
  } catch {
    return { relativePath: inside.rel, renderKind: "text", size: 0, mtimeMs: 0, error: "not_found" };
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

  // markdown / html / csv / text 都按 UTF-8 文本读。
  // 超限不再整体拒绝：只读上限内的完整行并标 truncated，让大文件至少前半段可读。
  const truncated = size > MAX_TEXT_BYTES;
  const buffer = truncated ? await readHead(inside.abs, MAX_TEXT_BYTES) : await readFile(inside.abs);

  // 纯文本类做二进制识别：含 NUL 字节判定二进制，不把乱码塞进 Tab。
  if (renderKind === "text" && buffer.includes(0)) {
    return { relativePath: inside.rel, renderKind, size, mtimeMs, error: "binary" };
  }

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
  if (renderKind === "text") {
    const language = languageOf(inside.rel);
    if (language) {
      result.language = language;
    }
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
  const inside = toInsideRoot(root, normalized);
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
