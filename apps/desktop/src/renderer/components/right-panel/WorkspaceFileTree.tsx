import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ChevronRight,
  FileCode,
  FileImage,
  FileJson,
  FileText,
  File as FileIcon,
  Folder,
  FolderOpen,
  Loader2,
  RefreshCw,
  Search,
  Table,
} from "lucide-react";
import type { WorkspaceDirEntry } from "@actspace/shared";
import { useRightPanel, workspaceFileTabId } from "./RightPanelContext";
import { readFailureTab, tabFromFile } from "./workspaceFileTab";

/**
 * 右侧面板的工作区文件树 rail（见 `front-右侧面板与文件渲染规范.md`）。
 *
 * - 数据来源：当前会话 workspaceRoot（main 用 BootstrapState.workspaceRoot 兜底），全部经 IPC，renderer 不碰 FS。
 * - 懒加载逐层展开；点文件读盘后复用现有渲染视图开 Tab，`file:<相对路径>` 去重。
 * - **展开层级与目录缓存放在 RightPanelContext**：本组件在「收起树栏」和「切到对象 Tab」时会被整体卸载，
 *   状态留在行组件里的话回来后所有目录都会塌回根层。
 * - 浏览器 mock 无 IPC 时优雅降级为空态，不抛错。
 */

// rail 是右面板「两栏」的**右**栏；折叠按钮与路径都在上方的工作区操作栏里。
const RAIL_CLASS = "flex h-full w-[200px] shrink-0 flex-col overflow-hidden border-l border-line bg-surface";
const RAIL_HEADER_CLASS = "flex shrink-0 items-center gap-0.5 border-b border-line px-1.5 py-1";
// 常态无边框、无填充，只有 hover / 聚焦时浮出底色：一条 200px 窄栏里，
// 输入框的边框会和下面每一行树项的缩进线抢视觉层级，把最该看的文件名压下去。
const FILTER_WRAP_CLASS =
  "flex min-w-0 flex-1 items-center gap-1.5 rounded-act-sm px-1.5 py-1 transition-colors hover:bg-surface-subtle focus-within:bg-surface-subtle";
const FILTER_INPUT_CLASS =
  "min-w-0 flex-1 border-0 bg-transparent text-[12px] leading-none text-text-main outline-none placeholder:text-text-faint";
const RAIL_ICON_BUTTON_CLASS =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-act-sm border-0 bg-transparent text-text-faint hover:bg-line hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring [cursor:pointer]";
const RAIL_BODY_CLASS = "scrollbar-none min-h-0 flex-1 overflow-auto py-1";
const ROW_CLASS =
  "flex w-full items-center gap-1.5 border-0 bg-transparent py-1 pr-2 text-left text-[12px] leading-none text-text-muted hover:bg-hover-overlay hover:text-text-main [cursor:pointer]";
const ROW_ACTIVE_CLASS = "bg-selected font-semibold text-text-main";
const STATE_CLASS = "px-3 py-2 text-[12px] text-text-faint";
const NOTICE_CLASS = "px-3 py-1.5 text-[11px] text-text-faint";

function indentStyle(depth: number): CSSProperties {
  return { paddingLeft: `${10 + depth * 12}px` };
}

const CODE_EXTS = new Set([
  "ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs", "py", "go", "rs", "java", "kt", "kts",
  "c", "h", "cpp", "cc", "hpp", "cs", "rb", "php", "swift", "dart", "lua", "r", "pl", "ex", "exs",
  "scala", "sql", "sh", "bash", "zsh", "fish", "ps1", "vue", "svelte", "astro", "css", "scss", "less", "html", "htm",
]);
const DATA_EXTS = new Set(["json", "jsonc", "json5", "jsonl", "ndjson", "yaml", "yml", "toml", "ini", "xml"]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);
const TABLE_EXTS = new Set(["csv", "tsv"]);
const DOC_EXTS = new Set(["md", "markdown", "mdx", "txt", "log"]);

/** 按类型给图标：整棵树全用同一个通用图标时，扫一眼分不出代码、配置和资源。 */
function FileTypeIcon({ name }: { name: string }) {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  const props = { size: 14, className: "shrink-0 text-text-faint" } as const;
  if (CODE_EXTS.has(ext)) return <FileCode {...props} />;
  if (DATA_EXTS.has(ext)) return <FileJson {...props} />;
  if (IMAGE_EXTS.has(ext)) return <FileImage {...props} />;
  if (TABLE_EXTS.has(ext)) return <Table {...props} />;
  if (DOC_EXTS.has(ext)) return <FileText {...props} />;
  return <FileIcon {...props} />;
}

function DirView({
  relativePath,
  depth,
  workspaceRoot,
  filter,
}: {
  relativePath: string;
  depth: number;
  workspaceRoot?: string;
  filter: string;
}) {
  const { dirCache, cacheDir, fileTreeRefreshKey } = useRightPanel();
  const cached = dirCache.get(relativePath);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(cached ? "ready" : "loading");
  const [truncatedListing, setTruncatedListing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const api = typeof window !== "undefined" ? window.actspace?.listWorkspaceDir : undefined;
    if (!api) {
      setStatus("error");
      return;
    }
    // 命中缓存就不再打 IPC：收起 / 展开树栏、来回切 Tab 都不该重新拉一遍目录。
    if (dirCache.has(relativePath)) {
      setStatus("ready");
      return;
    }
    setStatus("loading");
    api({ workspaceRoot, relativePath })
      .then((result) => {
        if (cancelled) return;
        // too_many_entries 仍返回前 N 条，按已截断列表渲染；其余错误码当作读失败。
        if (result.error && result.error !== "too_many_entries") {
          setStatus("error");
          return;
        }
        setTruncatedListing(result.error === "too_many_entries");
        cacheDir(relativePath, result.entries);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // fileTreeRefreshKey 变化时缓存已被清空，需要重新拉取。
  }, [relativePath, workspaceRoot, dirCache, cacheDir, fileTreeRefreshKey]);

  const entries = cached;

  const visible = useMemo(() => {
    if (!entries) return [];
    if (!filter) return entries;
    const needle = filter.toLowerCase();
    // 目录一律保留：过滤是在已展开的层级里找名字，藏掉目录会让下层命中无法触达。
    return entries.filter((entry) => entry.kind === "dir" || entry.name.toLowerCase().includes(needle));
  }, [entries, filter]);

  if (status === "loading") {
    return (
      <div className={STATE_CLASS} style={indentStyle(depth)}>
        <Loader2 size={13} className="animate-spin" />
      </div>
    );
  }
  if (status === "error" || !entries) {
    return (
      <div className={STATE_CLASS} style={indentStyle(depth)}>
        无法读取目录
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className={STATE_CLASS} style={indentStyle(depth)}>
        空目录
      </div>
    );
  }
  return (
    <>
      {visible.map((entry) => (
        <EntryRow
          key={entry.relativePath}
          entry={entry}
          depth={depth}
          workspaceRoot={workspaceRoot}
          filter={filter}
        />
      ))}
      {filter && visible.length === 0 ? (
        <div className={STATE_CLASS} style={indentStyle(depth)}>
          无匹配文件
        </div>
      ) : null}
      {truncatedListing ? (
        <div className={NOTICE_CLASS} style={indentStyle(depth)}>
          条目过多，仅显示前 1000 项。
        </div>
      ) : null}
    </>
  );
}

function EntryRow({
  entry,
  depth,
  workspaceRoot,
  filter,
}: {
  entry: WorkspaceDirEntry;
  depth: number;
  workspaceRoot?: string;
  filter: string;
}) {
  const { openTab, activeTabId, expandedDirs, toggleDir } = useRightPanel();
  const [opening, setOpening] = useState(false);

  if (entry.kind === "dir") {
    const expanded = expandedDirs.has(entry.relativePath);
    return (
      <>
        <button
          type="button"
          className={ROW_CLASS}
          style={indentStyle(depth)}
          aria-expanded={expanded}
          onClick={() => toggleDir(entry.relativePath)}
        >
          <ChevronRight size={13} className={`shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
          {expanded ? <FolderOpen size={14} className="shrink-0" /> : <Folder size={14} className="shrink-0" />}
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap" title={entry.name}>
            {entry.name}
          </span>
        </button>
        {expanded ? (
          <DirView
            relativePath={entry.relativePath}
            depth={depth + 1}
            workspaceRoot={workspaceRoot}
            filter={filter}
          />
        ) : null}
      </>
    );
  }

  const isActive = activeTabId === workspaceFileTabId(entry.relativePath);

  const openFile = async () => {
    const api = typeof window !== "undefined" ? window.actspace?.readWorkspaceFile : undefined;
    if (!api || opening) return;
    setOpening(true);
    try {
      openTab(tabFromFile(await api({ workspaceRoot, relativePath: entry.relativePath })));
    } catch {
      openTab(readFailureTab(entry.relativePath, entry.name));
    } finally {
      setOpening(false);
    }
  };

  return (
    <button
      type="button"
      className={`${ROW_CLASS} ${isActive ? ROW_ACTIVE_CLASS : ""}`}
      style={indentStyle(depth)}
      // 多 Tab 并存时，树里必须能看出正在看的是哪个文件。
      aria-current={isActive ? "true" : undefined}
      onClick={openFile}
    >
      <span className="inline-block w-[13px] shrink-0" aria-hidden />
      {opening ? <Loader2 size={14} className="shrink-0 animate-spin" /> : <FileTypeIcon name={entry.name} />}
      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap" title={entry.name}>
        {entry.name}
      </span>
    </button>
  );
}

export function WorkspaceFileTree({ workspaceRoot }: { workspaceRoot?: string }) {
  const { refreshFileTree, syncFileTreeRoot } = useRightPanel();
  const available = typeof window !== "undefined" && typeof window.actspace?.listWorkspaceDir === "function";
  const [filter, setFilter] = useState("");

  // 换 workspace 后旧的展开层级和缓存都属于另一个根，留着只会显示不存在的路径。
  // 「上次是哪个根」记在 Provider 里，所以本组件反复挂载卸载不会被误判成换根。
  useEffect(() => {
    syncFileTreeRoot(workspaceRoot);
  }, [workspaceRoot, syncFileTreeRoot]);

  if (!available) {
    return (
      <div className={RAIL_CLASS}>
        <div className={RAIL_BODY_CLASS}>
          <div className={STATE_CLASS}>当前环境不支持文件浏览。</div>
        </div>
      </div>
    );
  }

  return (
    <div className={RAIL_CLASS}>
      <div className={RAIL_HEADER_CLASS}>
        <div className={FILTER_WRAP_CLASS}>
          <Search size={12} strokeWidth={2} className="shrink-0 text-text-faint" aria-hidden="true" />
          <input
            className={FILTER_INPUT_CLASS}
            type="text"
            value={filter}
            placeholder="过滤文件…"
            aria-label="过滤文件名"
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        <button type="button" className={RAIL_ICON_BUTTON_CLASS} aria-label="刷新文件树" onClick={refreshFileTree}>
          <RefreshCw size={13} strokeWidth={1.9} />
        </button>
      </div>
      <div className={RAIL_BODY_CLASS}>
        <DirView relativePath="" depth={0} workspaceRoot={workspaceRoot} filter={filter} />
      </div>
    </div>
  );
}
