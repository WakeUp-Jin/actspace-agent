import { ChevronRight, File, Folder, FolderOpen, RefreshCw, Search } from "lucide-react";
import { IconButton } from "../../../ui/IconButton";
import { fileRows } from "../../model/panel-fixtures";
import { useSpaceDemoActions, useSpaceDemoSelector } from "../../model/use-space-demo";

/** 文件标签：过滤框 + 文件树（样式对齐 WorkspaceFileTree，内容来自 mock）。点文件打开 file 标签。 */

const HEADER_CLASS = "flex shrink-0 items-center gap-0.5 border-b border-line px-1.5 py-1";
const FILTER_WRAP_CLASS =
  "flex min-w-0 flex-1 items-center gap-1.5 rounded-act-sm px-1.5 py-1 transition-colors hover:bg-surface-subtle focus-within:bg-surface-subtle focus-within:ring-2 focus-within:ring-focus-ring/20";
const FILTER_INPUT_CLASS =
  "min-w-0 flex-1 border-0 bg-transparent text-act-xs leading-none text-text-main outline-none placeholder:text-text-faint";
const ROW_CLASS =
  "flex w-full items-center gap-1.5 border-0 bg-transparent py-1 pr-2 text-left text-act-xs leading-none text-text-muted hover:bg-hover-overlay hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring [cursor:pointer]";

export function SpaceFilesView({ roots }: { roots: string[] }) {
  const open = useSpaceDemoSelector((s) => s.ftOpen);
  const query = useSpaceDemoSelector((s) => s.ftQuery);
  const selected = useSpaceDemoSelector((s) => s.ftSelected);
  const { toggleFileDir, setFileQuery, openFile, showNotice } = useSpaceDemoActions();
  const rows = fileRows(roots, open, query);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={HEADER_CLASS}>
        <label className={FILTER_WRAP_CLASS}>
          <Search size={12} strokeWidth={2} className="shrink-0 text-text-faint" aria-hidden="true" />
          <input
            className={FILTER_INPUT_CLASS} type="text" value={query} placeholder="过滤文件…" aria-label="过滤文件名"
            onChange={(event) => setFileQuery(event.target.value)}
          />
        </label>
        <IconButton label="刷新文件树" tooltip="刷新" size="xs" onClick={() => showNotice("演示里的文件树是固定的")}>
          <RefreshCw size={13} strokeWidth={1.9} aria-hidden="true" />
        </IconButton>
      </div>
      <div className="scrollbar-none min-h-0 flex-1 overflow-auto py-1">
        {rows.map((r) => {
          const expanded = open.includes(r.path);
          const indent = { paddingLeft: `${10 + r.depth * 12}px` };
          // 保留原生 <button>：缩进行，和 WorkspaceFileTree 的行同一套样式。
          return r.dir ? (
            <button
              key={r.path} type="button" style={indent} aria-expanded={expanded}
              className={`${ROW_CLASS} ${r.root ? "font-medium text-text-main" : ""}`} onClick={() => toggleFileDir(r.path)}
            >
              <ChevronRight size={13} className={`shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden="true" />
              {expanded ? <FolderOpen size={14} className="shrink-0" aria-hidden="true" /> : <Folder size={14} className="shrink-0" aria-hidden="true" />}
              <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap" title={r.name}>{r.name}</span>
            </button>
          ) : (
            <button
              key={r.path} type="button" style={indent} aria-current={selected === r.path}
              className={`${ROW_CLASS} ${selected === r.path ? "bg-selected font-semibold text-text-main" : ""}`} onClick={() => openFile(r.path)}
            >
              <span className="inline-block w-[13px] shrink-0" aria-hidden="true" />
              <File size={14} className="shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap" title={r.path}>{r.name}</span>
            </button>
          );
        })}
        {rows.length ? null : <div className="px-3 py-2 text-act-xs text-text-faint">没有匹配「{query}」的文件</div>}
      </div>
    </div>
  );
}
