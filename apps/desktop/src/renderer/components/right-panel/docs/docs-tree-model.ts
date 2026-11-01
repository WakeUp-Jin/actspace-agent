/**
 * 「文档」面板的目录树模型（纯函数，无 React）。
 *
 * 数据来源是 `workspaces.listMarkdownFiles` 返回的相对路径清单：
 * 先组装成完整树（文件夹篇数 = 其下 Markdown 总数），再按「全部 / 本会话改过」筛选和文件名搜索裁剪。
 * 清单里只有 Markdown，所以树里天然没有不含 Markdown 的文件夹。
 */

export type DocsFilter = "all" | "session";

export type DocsFileNode = {
  kind: "file";
  name: string;
  /** 相对工作区根的 POSIX 路径。 */
  path: string;
};

export type DocsDirNode = {
  kind: "dir";
  name: string;
  path: string;
  /** 其中 Markdown 的总篇数（不受筛选影响）。 */
  count: number;
  children: DocsNode[];
};

export type DocsNode = DocsFileNode | DocsDirNode;

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, "zh-Hans-CN", { numeric: true, sensitivity: "base" }) || (a < b ? -1 : a > b ? 1 : 0);
}

/** 同级排序：文件夹在前，文件在后，各自按名称排序。 */
function sortNodes(nodes: DocsNode[]): void {
  nodes.sort((a, b) => (a.kind !== b.kind ? (a.kind === "dir" ? -1 : 1) : compareNames(a.name, b.name)));
  for (const node of nodes) if (node.kind === "dir") sortNodes(node.children);
}

export function buildDocsTree(files: readonly string[]): DocsNode[] {
  const root: DocsDirNode = { kind: "dir", name: "", path: "", count: 0, children: [] };
  const dirs = new Map<string, DocsDirNode>([["", root]]);
  for (const file of files) {
    const parts = file.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    let parent = root;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const path = parts.slice(0, index + 1).join("/");
      let dir = dirs.get(path);
      if (!dir) {
        dir = { kind: "dir", name: parts[index], path, count: 0, children: [] };
        dirs.set(path, dir);
        parent.children.push(dir);
      }
      dir.count += 1;
      parent = dir;
    }
    parent.children.push({ kind: "file", name: parts[parts.length - 1], path: parts.join("/") });
  }
  sortNodes(root.children);
  return root.children;
}

/** `a/b/c.md` → `["a", "a/b"]`。 */
export function ancestorDirs(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  const result: string[] = [];
  for (let index = 1; index < parts.length; index += 1) result.push(parts.slice(0, index).join("/"));
  return result;
}

export type VisibleDocsTree = {
  nodes: DocsNode[];
  /** 筛选 / 搜索后剩下的文件数。 */
  matchedFiles: number;
  /** 搜索或「本会话改过」生效时需要自动展开的文件夹（命中项的所有祖先）。 */
  autoExpand: ReadonlySet<string>;
};

/** 搜索只匹配文件名（不区分大小写），不搜正文。 */
export function nameMatchRange(name: string, query: string): [number, number] | null {
  if (!query) return null;
  const index = name.toLowerCase().indexOf(query.toLowerCase());
  return index < 0 ? null : [index, index + query.length];
}

export function pruneDocsTree(
  nodes: readonly DocsNode[],
  { filter, query, editedPaths }: { filter: DocsFilter; query: string; editedPaths: ReadonlySet<string> },
): VisibleDocsTree {
  const needle = query.trim();
  const autoExpand = new Set<string>();
  let matchedFiles = 0;
  const keep = (list: readonly DocsNode[]): DocsNode[] => {
    const out: DocsNode[] = [];
    for (const node of list) {
      if (node.kind === "file") {
        if (filter === "session" && !editedPaths.has(node.path)) continue;
        if (needle && !nameMatchRange(node.name, needle)) continue;
        matchedFiles += 1;
        out.push(node);
        continue;
      }
      const children = keep(node.children);
      if (children.length === 0) continue;
      if (needle || filter === "session") autoExpand.add(node.path);
      out.push({ ...node, children });
    }
    return out;
  };
  return { nodes: keep(nodes), matchedFiles, autoExpand };
}

const MARKDOWN_NAME = /\.(?:md|markdown)$/i;

/**
 * 把消息流里 Agent 改过的路径（可能是绝对路径，也可能已是相对路径）转成工作区相对的 Markdown 路径集合。
 * 不在工作区内的绝对路径丢弃。
 */
export function editedMarkdownPaths(paths: readonly string[], workspaceRoot: string | undefined): Set<string> {
  const root = workspaceRoot?.replace(/\\/g, "/").replace(/\/+$/, "");
  const result = new Set<string>();
  for (const raw of paths) {
    let path = raw.replace(/^file:\/\//i, "").replace(/\\/g, "/");
    if (root && path.startsWith(`${root}/`)) path = path.slice(root.length + 1);
    else if (path.startsWith("/") || /^[A-Za-z]:\//.test(path)) continue;
    path = path.replace(/^\.\//, "");
    if (path && MARKDOWN_NAME.test(path)) result.add(path);
  }
  return result;
}
