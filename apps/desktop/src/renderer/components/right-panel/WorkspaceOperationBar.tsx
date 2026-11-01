import { ChevronRight, TriangleAlert } from "lucide-react";
import { OpenInAppMenu } from "./OpenInAppMenu";
import type { RightPanelTab, WorkspaceFileMeta } from "./RightPanelContext";
import { useReloadFileTab } from "./useFileFreshness";

// 文件标签（本机图片、读取失败说明）的操作栏：左=面包屑路径，右=外部打开。
// Markdown 不在这里：「文档」面板有自己的操作栏（`docs/DocsReader.tsx`）。
const WORKSPACE_BAR_CLASS = "flex shrink-0 items-center gap-1 border-b border-line px-2.5 py-1.5";
// 面包屑：根名弱化、文件名主色，中间用 chevron 分隔（与 Cursor 的 `root › file` 同形）。
const WORKSPACE_BAR_CRUMBS_CLASS = "flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden text-act-xs";
const WORKSPACE_BAR_ROOT_CLASS = "shrink-0 text-text-faint";
const WORKSPACE_BAR_PATH_CLASS = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-text-main";
const WORKSPACE_BAR_HINT_CLASS =
  "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-act-xs text-text-faint";
// 过期提示用 warning 语义：内容不可信但不是错误，需要用户注意并显式重载。
const WORKSPACE_STALE_BAR_CLASS =
  "flex shrink-0 items-center gap-2 border-b border-line bg-warning-soft px-2.5 py-1.5 text-act-xxs text-on-warning";
const WORKSPACE_STALE_ACTION_CLASS =
  "shrink-0 rounded-act-sm border-0 bg-transparent px-1.5 py-0.5 text-act-xxs font-semibold text-on-warning underline decoration-dotted hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring [cursor:pointer]";

/** 当前 Tab 的工作区相对路径（仅工作区文件 Tab 有）；其余返回空。 */
function relativePathOf(tab: RightPanelTab | null): string | undefined {
  if (tab && "relativePath" in tab && typeof tab.relativePath === "string") {
    return tab.relativePath;
  }
  return undefined;
}

/** workspace 绝对路径的末段目录名，用作面包屑的根标签。 */
function workspaceLabelOf(workspaceRoot: string | undefined): string | undefined {
  if (!workspaceRoot) return undefined;
  return workspaceRoot.replace(/[/\\]+$/, "").split(/[/\\]/).filter(Boolean).at(-1);
}

/**
 * 文件标签的操作栏：全宽、夹在 tab 条与内容之间。
 *
 * 只承载「我在看哪个文件」+ 外部打开，刻意不放刷新：
 * 需要重新读取的唯一真实场景是文件已变更，而那时下方的 stale 提示条本身就带「重新加载」。
 */
export function WorkspaceOperationBar({
  activeTab,
  workspaceRoot,
}: {
  activeTab: RightPanelTab | null;
  workspaceRoot?: string;
}) {
  const meta = activeTab as WorkspaceFileMeta | null;
  const boundRoot = meta?.workspaceRoot ?? workspaceRoot;
  const reloadFile = useReloadFileTab(boundRoot);
  const path = relativePathOf(activeTab);
  const rootLabel = workspaceLabelOf(boundRoot);
  const isStale = Boolean(meta?.isStale);

  const reload = () => {
    if (!path || !activeTab) return;
    void reloadFile(path, activeTab.kind === "context" ? path : (activeTab as { title: string }).title, meta?.workspaceRoot !== undefined || meta?.hostId ? meta : undefined);
  };

  return (
    <>
      <div className={WORKSPACE_BAR_CLASS}>
        {path ? (
          <span className={WORKSPACE_BAR_CRUMBS_CLASS}>
            {rootLabel ? (
              <>
                <span className={WORKSPACE_BAR_ROOT_CLASS} title={boundRoot}>
                  {rootLabel}
                </span>
                <ChevronRight size={12} strokeWidth={1.8} className="shrink-0 text-text-faint" aria-hidden="true" />
              </>
            ) : null}
            <span className={WORKSPACE_BAR_PATH_CLASS} title={path}>
              {path}
            </span>
          </span>
        ) : (
          <span className={WORKSPACE_BAR_HINT_CLASS}>工作区文件</span>
        )}
        {path && !meta?.hostId ? <OpenInAppMenu workspaceRoot={boundRoot} relativePath={path} /> : null}
      </div>
      {isStale ? (
        <div className={WORKSPACE_STALE_BAR_CLASS} role="status">
          <TriangleAlert size={13} strokeWidth={2} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">文件已在磁盘上变更，当前显示的是旧内容。</span>
          <button type="button" className={WORKSPACE_STALE_ACTION_CLASS} onClick={reload}>
            重新加载
          </button>
        </div>
      ) : null}
    </>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
