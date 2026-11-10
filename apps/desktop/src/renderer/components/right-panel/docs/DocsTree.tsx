import { useMemo, useState, type CSSProperties } from "react";
import { ChevronRight, FileText, Folder, FolderOpen, LoaderCircle, RefreshCw, Search } from "lucide-react";
import { Button } from "../../ui/Button";
import { IconButton } from "../../ui/IconButton";
import { useRightPanel } from "../RightPanelContext";
import { buildDocsTree, nameMatchRange, pruneDocsTree, type DocsNode } from "./docs-tree-model";
import type { DocsListingStatus } from "./use-docs-listing";

/**
 * 「MD 文档」面板的目录树（最右侧一栏，宽 260px，可收起）。
 * 只列 Markdown，没有 Markdown 的文件夹整个隐藏；文件夹右侧是其中的篇数；
 * 搜索只匹配文件名，命中项所在的文件夹自动展开；筛选只有「全部 / 本会话改过」。
 * 展开层级在 `RightPanelContext`（树会随收起、切标签反复挂载）。
 */

const TREE_CLASS = "flex h-full w-[260px] shrink-0 flex-col overflow-hidden border-l border-line bg-surface";
const SEARCH_CLASS =
  "flex h-[30px] items-center gap-1.5 rounded-act-md border border-line bg-surface-subtle px-2 focus-within:border-line-strong focus-within:ring-2 focus-within:ring-focus-ring/20";
const SEARCH_INPUT_CLASS =
  "min-w-0 flex-1 border-0 bg-transparent text-act-xs text-text-main outline-none placeholder:text-text-faint";
const BODY_CLASS = "scrollbar-none min-h-0 flex-1 overflow-auto px-1.5 pb-3 pt-0.5";
const ROW_CLASS =
  "flex h-7 w-full items-center gap-1.5 rounded-act-sm border-0 pr-2 text-left text-act-xs text-text-main hover:bg-hover-overlay focus-visible:outline-2 focus-visible:outline-focus-ring [cursor:pointer]";
const ROW_SELECTED_CLASS = "bg-selected";
const STATE_CLASS = "px-3 py-3 text-act-xs text-text-faint";
const MARK_CLASS = "rounded-act-xs bg-warning-soft text-inherit";

type Row = { node: DocsNode; depth: number };

function indent(depth: number, extra = 0): CSSProperties {
  return { paddingLeft: `${6 + depth * 14 + extra}px` };
}

function HighlightedName({ name, query }: { name: string; query: string }) {
  const range = nameMatchRange(name, query.trim());
  if (!range) return <>{name}</>;
  return (
    <>
      {name.slice(0, range[0])}
      <mark className={MARK_CLASS}>{name.slice(range[0], range[1])}</mark>
      {name.slice(range[1])}
    </>
  );
}

export function DocsTree({
  workspaceLabel,
  files,
  truncated,
  incompleteDirs = [],
  onLoadMore,
  status,
  error,
  editedPaths,
}: {
  workspaceLabel: string;
  files: readonly string[] | null;
  truncated: boolean;
  /** 截断时没走完的顶层目录（`.` 表示根目录本身）。 */
  incompleteDirs?: readonly string[];
  /** 用放大的上限重新取；没有时不显示「继续加载」。 */
  onLoadMore?: () => void;
  status: DocsListingStatus;
  error: string | null;
  /** 当前会话里 Agent 写过 / 改过的 Markdown（相对路径）。 */
  editedPaths: ReadonlySet<string>;
}) {
  const { docsSelectedPath, selectDocsPath, expandedDirs, toggleDir, docsFilter, setDocsFilter, refreshDocs } = useRightPanel();
  const [query, setQuery] = useState("");

  const tree = useMemo(() => buildDocsTree(files ?? []), [files]);
  const visible = useMemo(
    () => pruneDocsTree(tree, { filter: docsFilter, query, editedPaths }),
    [tree, docsFilter, query, editedPaths],
  );
  const rows = useMemo(() => {
    const out: Row[] = [];
    const walk = (nodes: readonly DocsNode[], depth: number) => {
      for (const node of nodes) {
        out.push({ node, depth });
        if (node.kind === "dir" && (expandedDirs.has(node.path) || visible.autoExpand.has(node.path))) walk(node.children, depth + 1);
      }
    };
    walk(visible.nodes, 0);
    return out;
  }, [visible, expandedDirs]);

  const total = files?.length ?? 0;
  const loading = status === "loading" && files === null;
  const empty = files !== null && rows.length === 0;

  return (
    <nav className={TREE_CLASS} aria-label="文档目录">
      <div className="flex shrink-0 flex-col gap-2 px-2.5 pb-1.5 pt-2.5">
        <div className="flex items-center gap-1.5 px-1 text-act-sm font-semibold text-text-main">
          <Folder size={14} className="shrink-0 text-text-faint" aria-hidden="true" />
          <span className="min-w-0 truncate" title={workspaceLabel}>{workspaceLabel}</span>
          <span className="ml-auto shrink-0 text-act-xs font-normal text-text-faint">{files ? `${total}${truncated ? "+" : ""} 篇` : ""}</span>
          <IconButton label="刷新文档列表" tooltip="刷新" size="xs" onClick={refreshDocs} disabled={status === "loading"}>
            {status === "loading" ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={13} aria-hidden="true" />}
          </IconButton>
        </div>
        <label className={SEARCH_CLASS}>
          <Search size={13} className="shrink-0 text-text-faint" aria-hidden="true" />
          <input
            className={SEARCH_INPUT_CLASS}
            type="text"
            value={query}
            placeholder="搜索文档文件名"
            aria-label="搜索文档文件名"
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="flex gap-1" role="group" aria-label="筛选">
          <Button size="xs" shape="pill" variant={docsFilter === "all" ? "primary" : "secondary"} aria-pressed={docsFilter === "all"} onClick={() => setDocsFilter("all")}>
            全部
          </Button>
          <Button size="xs" shape="pill" variant={docsFilter === "session" ? "primary" : "secondary"} aria-pressed={docsFilter === "session"} onClick={() => setDocsFilter("session")}>
            本会话改过
          </Button>
        </div>
      </div>

      <div className={BODY_CLASS} role="tree" aria-label="Markdown 文档">
        {loading ? <div className={STATE_CLASS}><LoaderCircle size={13} className="animate-spin" aria-label="正在读取文档列表" /></div> : null}
        {status === "error" && files === null ? <div className={STATE_CLASS} role="alert">{error ?? "无法读取文档列表。"}</div> : null}
        {empty && total === 0 ? <div className={STATE_CLASS}>没有 Markdown 文档</div> : null}
        {empty && total > 0 ? (
          <div className={STATE_CLASS}>{docsFilter === "session" && !query.trim() ? "本会话还没有改过 Markdown" : "没有匹配的文档"}</div>
        ) : null}
        {rows.map(({ node, depth }) => {
          if (node.kind === "dir") {
            const expanded = expandedDirs.has(node.path) || visible.autoExpand.has(node.path);
            return (
              <button
                key={`d:${node.path}`}
                type="button"
                role="treeitem"
                aria-expanded={expanded}
                aria-selected={false}
                className={`${ROW_CLASS} bg-transparent`}
                style={indent(depth)}
                onClick={() => toggleDir(node.path)}
              >
                <ChevronRight size={13} className={`shrink-0 text-text-faint transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden="true" />
                {expanded ? <FolderOpen size={14} className="shrink-0 text-text-faint" aria-hidden="true" /> : <Folder size={14} className="shrink-0 text-text-faint" aria-hidden="true" />}
                <span className="min-w-0 flex-1 truncate text-text-muted" title={node.path}><HighlightedName name={node.name} query={query} /></span>
                <span className="shrink-0 text-act-xxs text-text-faint">{node.count}</span>
              </button>
            );
          }
          const selected = docsSelectedPath === node.path;
          const edited = editedPaths.has(node.path);
          return (
            <button
              key={`f:${node.path}`}
              type="button"
              role="treeitem"
              aria-selected={selected}
              aria-current={selected ? "true" : undefined}
              className={`${ROW_CLASS} ${selected ? ROW_SELECTED_CLASS : "bg-transparent"}`}
              style={indent(depth, 19)}
              title={node.path}
              onClick={() => selectDocsPath(node.path)}
            >
              <FileText size={14} className="shrink-0 text-text-faint" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate"><HighlightedName name={node.name} query={query} /></span>
              {edited ? <span className="size-1.5 shrink-0 rounded-full bg-operational" role="img" aria-label="本会话改过" /> : null}
            </button>
          );
        })}
      </div>

      {truncated ? <TruncatedNotice dirs={incompleteDirs} onLoadMore={onLoadMore} /> : null}
    </nav>
  );
}

/**
 * 清单被截断：固定在树底，写明哪些目录没列全（原因是工作区太大，遍历到上限就停了），
 * 第一次给「继续加载」（放大上限重取），放大后仍截断就只留说明。
 */
function TruncatedNotice({ dirs, onLoadMore }: { dirs: readonly string[]; onLoadMore?: () => void }) {
  const names = dirs.map((dir) => (dir === "." ? "根目录" : dir));
  const shown = names.slice(0, 3).join("、");
  const label = names.length === 0 ? "工作区太大，部分目录没有列出。" : `工作区太大，${shown}${names.length > 3 ? ` 等 ${names.length} 个目录` : ""}没有列全。`;
  return (
    <div role="status" className="flex shrink-0 flex-col gap-1.5 border-t border-line bg-warning-soft px-3 py-2 text-act-xs text-warning">
      <span title={names.join("、") || undefined}>{label}</span>
      {onLoadMore ? (
        <Button size="xs" variant="secondary" className="self-start" onClick={onLoadMore}>继续加载</Button>
      ) : (
        <span className="text-act-xxs">已到加载上限，可以把这些目录单独加成工作区。</span>
      )}
    </div>
  );
}
