import { ChevronRight, FolderTree, TriangleAlert } from "lucide-react";
import { WORKSPACE_TEXT_PREVIEW_LIMIT_BYTES } from "@actspace/shared";
import { OpenInAppMenu } from "./OpenInAppMenu";
import { PreviewSourceButton } from "./PreviewSourceToggle";
import { useRightPanel, type RightPanelTab, type WorkspaceFileMeta } from "./RightPanelContext";
import { useReloadFileTab } from "./useFileFreshness";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";

// ② 工作区操作栏：左=面包屑路径，右=树栏开关 + 外部打开。只放这两个动作，多了就变成第二条工具栏。
const WORKSPACE_BAR_CLASS = "flex shrink-0 items-center gap-1 border-b border-line px-2.5 py-1.5";
const WORKSPACE_BAR_TOGGLE_CLASS =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-act-sm border-0 bg-transparent text-text-faint hover:bg-line hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring [cursor:pointer]";
const WORKSPACE_BAR_TOGGLE_ACTIVE_CLASS = "bg-selected text-text-main";
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
const WORKSPACE_TRUNCATED_BAR_CLASS =
  "shrink-0 border-b border-line bg-surface-subtle px-2.5 py-1.5 text-act-xxs text-text-faint";

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
 * ② 工作区操作栏：全宽、夹在 tab 条与两栏之间。
 *
 * 只承载「我在看哪个文件」+ 两个动作（开关树栏、外部打开），刻意不再放刷新：
 * 需要重新读取的唯一真实场景是文件已变更，而那时下方的 stale 提示条本身就带「重新加载」，
 * 常驻一个几乎不会被点的刷新图标只是让这一层看起来更满。
 */
export function WorkspaceOperationBar({
  activeTab,
  workspaceRoot,
}: {
  activeTab: RightPanelTab | null;
  workspaceRoot?: string;
}) {
  const { isFileTreeCollapsed, toggleFileTreeCollapsed, isSourceShown, setSourceShown } = useRightPanel();
  const reloadFile = useReloadFileTab(workspaceRoot);
  const path = relativePathOf(activeTab);
  const rootLabel = workspaceLabelOf(workspaceRoot);
  const meta = activeTab as WorkspaceFileMeta | null;
  const isStale = Boolean(meta?.isStale);
  const isTruncated = Boolean(meta?.truncated);
  // 只有「渲染态之外还有源码可看」的文件类型才给切换按钮：markdown 与 html。
  // 必须同时要求 path：浏览态下激活的可能是聊天生成的 markdown（内容区是占位页），
  // 那时按钮点了没有任何视图会响应。
  const dualViewTab =
    path && activeTab && (activeTab.kind === "markdown" || activeTab.kind === "html") ? activeTab : null;

  const reload = () => {
    if (!path || !activeTab) return;
    void reloadFile(path, activeTab.kind === "context" ? path : (activeTab as { title: string }).title);
  };

  return (
    <>
      <div className={WORKSPACE_BAR_CLASS}>
        {path ? (
          <span className={WORKSPACE_BAR_CRUMBS_CLASS}>
            {rootLabel ? (
              <>
                <span className={WORKSPACE_BAR_ROOT_CLASS} title={workspaceRoot}>
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
        {dualViewTab ? (
          <PreviewSourceButton
            mode={isSourceShown(dualViewTab.id) ? "source" : "preview"}
            onChange={(next) => setSourceShown(dualViewTab.id, next === "source")}
          />
        ) : null}
        {path ? <OpenInAppMenu workspaceRoot={workspaceRoot} relativePath={path} /> : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={`${WORKSPACE_BAR_TOGGLE_CLASS} ${isFileTreeCollapsed ? "" : WORKSPACE_BAR_TOGGLE_ACTIVE_CLASS}`}
              aria-label={isFileTreeCollapsed ? "展开文件树" : "收起文件树"}
              aria-expanded={!isFileTreeCollapsed}
              onClick={toggleFileTreeCollapsed}
            >
              <FolderTree size={14} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{isFileTreeCollapsed ? "展开文件树" : "收起文件树"}</TooltipContent>
        </Tooltip>
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
      {isTruncated ? (
        <div className={WORKSPACE_TRUNCATED_BAR_CLASS} role="status">
          {`文件过大，仅显示前 ${formatBytes(WORKSPACE_TEXT_PREVIEW_LIMIT_BYTES)} 内的完整行（共 ${formatBytes(meta?.size ?? 0)}）。`}
        </div>
      ) : null}
    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
