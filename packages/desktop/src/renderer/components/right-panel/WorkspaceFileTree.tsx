import { useEffect, useState, type CSSProperties } from "react";
import { ChevronRight, File, Folder, FolderOpen, Loader2 } from "lucide-react";
import type { WorkspaceDirEntry, WorkspaceReadFileResult } from "@actspace/shared";
import { useRightPanel, type RightPanelTab } from "./RightPanelContext";

/**
 * 右侧面板的工作区文件树 rail（V1，见 `工作区文件浏览器规范.md`）。
 *
 * - 数据来源：当前会话 workspaceRoot（V1 由 main 用 BootstrapState.workspaceRoot 兜底），全部经 IPC，renderer 不碰 FS。
 * - 懒加载逐层展开；点文件读盘后复用现有渲染视图（markdown / html / image / text）开 Tab，`file:<相对路径>` 去重。
 * - 浏览器 mock 无 IPC 时优雅降级为空态，不抛错。
 */

// rail 是右面板「两栏」的左栏；折叠按钮与路径都在上方的工作区操作栏里，树本身不再自带头部。
const RAIL_CLASS = "flex h-full w-[200px] shrink-0 flex-col overflow-hidden border-r border-line bg-surface";
const RAIL_BODY_CLASS = "scrollbar-none min-h-0 flex-1 overflow-auto py-1";
const ROW_CLASS =
  "flex w-full items-center gap-1.5 border-0 bg-transparent py-1 pr-2 text-left text-[12px] leading-none text-text-muted hover:bg-brand-soft hover:text-text-main [cursor:pointer]";
const ROW_NAME_CLASS = "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap";
const STATE_CLASS = "px-3 py-2 text-[12px] text-text-faint";

const READ_ERROR_TEXT: Record<NonNullable<WorkspaceReadFileResult["error"]>, string> = {
  too_large: "文件过大，暂不在此预览。",
  binary: "二进制文件，暂不预览。",
  not_found: "文件不存在或已被移动。",
  not_a_file: "这是一个目录，不是文件。",
  escapes_root: "路径超出工作区范围，已拒绝读取。",
};

function indentStyle(depth: number): CSSProperties {
  return { paddingLeft: `${10 + depth * 12}px` };
}

/** 读盘结果 → 右侧面板 Tab；复用现有渲染视图，错误码降级为可读文本 Tab。 */
function tabFromFile(result: WorkspaceReadFileResult): RightPanelTab {
  const id = `file:${result.relativePath}`;
  const title = result.relativePath.split("/").pop() || result.relativePath;
  if (result.error) {
    return { id, kind: "text", title, content: READ_ERROR_TEXT[result.error], relativePath: result.relativePath };
  }
  switch (result.renderKind) {
    case "markdown":
      return { id, kind: "markdown", title, source: result.content ?? "", relativePath: result.relativePath };
    case "html":
      return { id, kind: "html", title, html: result.content ?? "", trust: "file", relativePath: result.relativePath };
    case "image":
      return { id, kind: "image", title, src: result.dataUrl ?? "", relativePath: result.relativePath };
    default:
      return {
        id,
        kind: "text",
        title,
        content: result.content ?? "",
        language: result.language,
        relativePath: result.relativePath,
      };
  }
}

function DirView({ relativePath, depth }: { relativePath: string; depth: number }) {
  const [entries, setEntries] = useState<WorkspaceDirEntry[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    const api = typeof window !== "undefined" ? window.actspace?.listWorkspaceDir : undefined;
    if (!api) {
      setStatus("error");
      return;
    }
    setStatus("loading");
    api({ relativePath })
      .then((result) => {
        if (cancelled) return;
        // too_many_entries 仍返回前 N 条，按已截断列表渲染；其余错误码当作读失败。
        if (result.error && result.error !== "too_many_entries") {
          setStatus("error");
          return;
        }
        setEntries(result.entries);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [relativePath]);

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
      {entries.map((entry) => (
        <EntryRow key={entry.relativePath} entry={entry} depth={depth} />
      ))}
    </>
  );
}

function EntryRow({ entry, depth }: { entry: WorkspaceDirEntry; depth: number }) {
  const { openTab } = useRightPanel();
  const [expanded, setExpanded] = useState(false);
  const [opening, setOpening] = useState(false);

  if (entry.kind === "dir") {
    return (
      <>
        <button
          type="button"
          className={ROW_CLASS}
          style={indentStyle(depth)}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronRight size={13} className={`shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
          {expanded ? <FolderOpen size={14} className="shrink-0" /> : <Folder size={14} className="shrink-0" />}
          <span className={ROW_NAME_CLASS} title={entry.name}>
            {entry.name}
          </span>
        </button>
        {expanded ? <DirView relativePath={entry.relativePath} depth={depth + 1} /> : null}
      </>
    );
  }

  const openFile = async () => {
    const api = typeof window !== "undefined" ? window.actspace?.readWorkspaceFile : undefined;
    if (!api || opening) return;
    setOpening(true);
    try {
      const result = await api({ relativePath: entry.relativePath });
      openTab(tabFromFile(result));
    } catch {
      openTab({
        id: `file:${entry.relativePath}`,
        kind: "text",
        title: entry.name,
        content: "读取文件失败。",
        relativePath: entry.relativePath,
      });
    } finally {
      setOpening(false);
    }
  };

  return (
    <button type="button" className={ROW_CLASS} style={indentStyle(depth)} onClick={openFile}>
      <span className="inline-block w-[13px] shrink-0" aria-hidden />
      {opening ? (
        <Loader2 size={14} className="shrink-0 animate-spin" />
      ) : (
        <File size={14} className="shrink-0 text-text-faint" />
      )}
      <span className={ROW_NAME_CLASS} title={entry.name}>
        {entry.name}
      </span>
    </button>
  );
}

export function WorkspaceFileTree() {
  const available = typeof window !== "undefined" && typeof window.actspace?.listWorkspaceDir === "function";

  return (
    <div className={RAIL_CLASS}>
      <div className={RAIL_BODY_CLASS}>
        {available ? (
          <DirView relativePath="" depth={0} />
        ) : (
          <div className={STATE_CLASS}>当前环境不支持文件浏览。</div>
        )}
      </div>
    </div>
  );
}
