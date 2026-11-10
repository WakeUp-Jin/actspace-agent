/**
 * Markdown 里“文件路径”的识别与解析，「文档」编辑器和聊天区共用。
 * 规则见 front-Markdown编辑与渲染规范.md §8 与 front-聊天区Markdown渲染规范.md §5.1。
 * 纯函数，不依赖 React 和宿主。
 */

export type PathRef = {
  /** 原文里的路径（去掉 `:行号`），可能以 `./`、`../` 开头 */
  path: string;
  line?: number;
  lineEnd?: number;
};

/** 不含 `/` 时，只认这些扩展名：避免把 `config.yaml` 以外的 `obj.method`、`console.log` 认成文件。 */
const COMMON_EXT = new Set([
  "md", "markdown", "mdx", "txt", "rst",
  "ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs", "json", "jsonc", "json5",
  "css", "scss", "sass", "less", "html", "htm", "vue", "svelte", "astro",
  "py", "pyi", "ipynb", "rs", "go", "java", "kt", "kts", "swift", "rb", "php", "lua", "dart", "scala", "ex", "exs", "erl", "hs", "clj",
  "c", "h", "cc", "cpp", "cxx", "hpp", "hh", "m", "mm", "cs", "fs", "zig", "nim", "sol",
  "sh", "bash", "zsh", "fish", "ps1", "bat", "cmd",
  "yml", "yaml", "toml", "ini", "cfg", "conf", "env", "xml", "plist", "properties", "gradle", "lock",
  "sql", "graphql", "gql", "proto", "prisma", "csv", "tsv",
  "svg", "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "avif", "pdf",
  "dockerfile", "makefile", "mk", "cmake", "tf", "nix", "patch", "diff",
]);

/** 一段路径：可选 `./`、`../` 前缀，若干目录，文件名必须带扩展名，可带 `:行号` 或 `:行号-行号`。 */
const PATH_RE = /^((?:\.{1,2}\/)*(?:[\w@\u4e00-\u9fa5.+-]+\/)*[\w@\u4e00-\u9fa5+-][\w@\u4e00-\u9fa5.+-]*\.([A-Za-z][\w]{0,9}))(?::(\d+)(?:-(\d+))?)?$/;

/**
 * 行内代码的整段文字是不是一个文件路径（D12）。
 * - 整段是一个路径，可带 `:行号` / `:行号-行号`；
 * - 包含 `/`，或者扩展名是常见的文件扩展名；
 * - 不含空白，不是 URL，不是 `~` 路径；
 * - 绝对路径（`/…`、`C:\…`）默认不认；`absolute: true` 时认出来、原样返回，
 *   由调用方用 `resolveWorkspacePath(…, { workspaceRoot })` 判断是否在工作区内（工作区外的会得到 null）。
 */
export function parseInlinePath(text: string, { absolute = false }: { absolute?: boolean } = {}): PathRef | null {
  if (!text || text.length > 400 || /\s/.test(text)) return null;
  const root = absolute ? /^(?:[A-Za-z]:[\\/]|\/)(?!\/)/.exec(text)?.[0] ?? "" : "";
  const rest = root ? text.slice(root.length).replace(/\\/g, "/") : text;
  if (/^[a-z][a-z0-9+.-]*:/i.test(rest) || rest.startsWith("/") || rest.startsWith("~") || /^[A-Za-z]:[\\/]/.test(rest)) return null;
  const m = PATH_RE.exec(rest);
  if (!m) return null;
  const [, relative, ext, line, lineEnd] = m;
  if (!root && !relative.includes("/") && !COMMON_EXT.has(ext.toLowerCase())) return null;
  // `1.2.3`、`v1.2.3` 这类版本号：扩展名以字母开头已排除大部分，这里再挡掉“文件名全是数字和点”的情况。
  if (/^[\d.]+$/.test(relative.replace(/\.[A-Za-z]\w*$/, ""))) return null;
  const path = root ? `${root.replace(/\\/g, "/")}${relative}` : relative;
  const ref: PathRef = { path };
  if (line) ref.line = Number(line);
  if (lineEnd) ref.lineEnd = Number(lineEnd);
  return ref;
}

export type LinkTarget =
  | { kind: "anchor"; id: string }
  | { kind: "external"; url: string }
  | { kind: "local"; path: string; line?: number }
  | { kind: "blocked" };

const SAFE_PROTOCOL = /^(?:https?:|mailto:)/i;

/** Markdown 链接、图片目标的分类：`#片段`、外链（只放行 http / https / mailto）、本地路径、其余不可点。 */
export function classifyLinkTarget(href: string): LinkTarget {
  const raw = href.trim();
  if (!raw) return { kind: "blocked" };
  if (raw.startsWith("#")) return { kind: "anchor", id: safeDecode(raw.slice(1)) };
  if (raw.startsWith("//")) return { kind: "blocked" };
  // `a.ts:12` 形如协议，其实是“裸文件名 + 行号”：冒号后只有行号、冒号前带扩展名时按本地路径处理。
  const bareWithLine = /^([^:/?#\s]+\.[A-Za-z]\w{0,9}):(\d+)(?:-\d+)?$/.exec(raw);
  if (bareWithLine) return { kind: "local", path: safeDecode(bareWithLine[1]), line: Number(bareWithLine[2]) };
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    // Windows 盘符（`C:\…`、`C:/…`）是本地绝对路径，按本地处理，后面解析时会被判为工作区外。
    if (/^[A-Za-z]:[\\/]/.test(raw)) return { kind: "local", path: raw.replace(/\\/g, "/") };
    if (/^file:/i.test(raw)) return { kind: "local", path: safeDecode(raw.replace(/^file:\/\//i, "")) };
    return SAFE_PROTOCOL.test(raw) ? { kind: "external", url: raw } : { kind: "blocked" };
  }
  let path = safeDecode(raw.replace(/[?#].*$/, ""));
  const lineFromHash = /#L(\d+)/.exec(raw)?.[1];
  let line = lineFromHash ? Number(lineFromHash) : undefined;
  const suffix = /:(\d+)(?:-\d+)?$/.exec(path);
  if (suffix) {
    line = Number(suffix[1]);
    path = path.slice(0, suffix.index);
  }
  if (!path) return { kind: "blocked" };
  return line ? { kind: "local", path, line } : { kind: "local", path };
}

export type ResolveOptions = {
  /** 当前文档所在目录（工作区相对路径，空串表示工作区根） */
  baseDir?: string;
  /** 工作区根目录的绝对路径；用来把工作区内的绝对路径转成相对路径 */
  workspaceRoot?: string;
  /** 不以 `./`、`../` 开头的路径是否也相对于 baseDir（链接、图片是；行内代码路径不是） */
  plainRelativeToBase?: boolean;
};

/**
 * 解析成工作区相对路径；越出工作区、工作区外的绝对路径、`~` 开头的，返回 null（不可点）。
 */
export function resolveWorkspacePath(raw: string, { baseDir = "", workspaceRoot, plainRelativeToBase = false }: ResolveOptions = {}): string | null {
  let path = raw.trim().replace(/\\/g, "/");
  if (!path || path.startsWith("~")) return null;
  if (path.startsWith("/") || /^[A-Za-z]:\//.test(path)) {
    const root = workspaceRoot?.trim().replace(/\\/g, "/").replace(/\/+$/, "");
    if (!root || !path.startsWith(`${root}/`)) return null;
    path = path.slice(root.length + 1);
    return normalizeSegments(path.split("/"));
  }
  const explicitRelative = path.startsWith("./") || path.startsWith("../");
  const base = explicitRelative || plainRelativeToBase ? baseDir.replace(/^\/+|\/+$/g, "") : "";
  return normalizeSegments([...(base ? base.split("/") : []), ...path.split("/")]);
}

/** 处理 `.`、`..`、空段；越过根目录返回 null。 */
function normalizeSegments(parts: string[]): string | null {
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.length ? out.join("/") : null;
}

/** 工作区相对路径所在目录（`docs/a.md` → `docs`，`a.md` → 空串）。 */
export function dirnameOf(relativePath: string): string {
  const index = relativePath.lastIndexOf("/");
  return index < 0 ? "" : relativePath.slice(0, index);
}

/** `/…` 或 `C:/…`、`C:\\…` 形式的绝对路径。 */
export function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
}

function safeDecode(value: string): string {
  try { return decodeURI(value); } catch { return value; }
}
