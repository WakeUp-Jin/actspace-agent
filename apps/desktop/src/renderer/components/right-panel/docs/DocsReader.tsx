import { Suspense, useEffect, useRef, useState } from "react";
import { ChevronsLeft, ChevronsRight, Copy, FolderOpen, LoaderCircle, Maximize2, Minimize2, ExternalLink, TriangleExclamationPoint } from "lucide-react";
import { WORKSPACE_TEXT_PREVIEW_LIMIT_BYTES } from "@actspace/shared";
import { workspacesApi } from "../../../api/workspaces";
import { Button } from "../../ui/Button";
import { IconButton } from "../../ui/IconButton";
import { MarkdownEditor, type MarkdownEditorHandle } from "../../markdown-editor";
import { PreviewSourceToggle } from "../PreviewSourceToggle";
import { isDocsDocDirty, useRightPanel, type DocsDocState } from "../RightPanelContext";
import { formatBytes } from "../WorkspaceOperationBar";
import { DocsOutline } from "./DocsOutline";
import type { DocsListingStatus } from "./use-docs-listing";

/**
 * 「MD 文档」面板的正文区（树的左侧）：操作栏 + 提示条 + Markdown 编辑器 + 空状态。
 * 预览和源码是同一个编辑器（`markdown-editor/`，懒加载）的两种模式，切换只重新配置，光标和撤销历史都保留。
 * 路径（工作区名弱化、文件名主色，未保存时文件名旁有圆点）在左，操作在右：
 * 预览 / 源码、大纲、在 Finder 中显示、用默认应用打开、复制路径、展开面板、收起文件树。
 */

const HEADER_CLASS = "flex h-10 shrink-0 items-center gap-1 border-b border-line pl-3 pr-2";
const CRUMBS_CLASS = "flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden whitespace-nowrap text-act-xs text-text-faint";
const BAR_CLASS = "flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5 text-act-xxs";
const STATE_CLASS = "flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center text-act-sm text-text-faint";

export function DocsReader({
  workspaceRoot,
  workspaceLabel,
  doc,
  saveError,
  onDraftChange,
  onSave,
  onReload,
  listingStatus,
  listingEmpty,
}: {
  workspaceRoot?: string;
  workspaceLabel: string;
  doc: DocsDocState | null;
  saveError: string | null;
  onDraftChange: (draft: string) => void;
  onSave: () => void;
  onReload: () => void;
  listingStatus: DocsListingStatus;
  /** 清单已取回且一篇 Markdown 都没有。 */
  listingEmpty: boolean;
}) {
  const {
    docsSelectedPath, docsMode, setDocsMode, docsTreeCollapsed, toggleDocsTreeCollapsed, docsExpanded, toggleDocsExpanded,
    docsPendingLine, clearDocsPendingLine,
  } = useRightPanel();
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);
  useEffect(() => setActionError(null), [docsSelectedPath]);

  const ready = doc?.status === "ready" ? doc : null;
  const dirty = isDocsDocDirty(doc);
  const path = docsSelectedPath;
  const parts = path ? path.split("/") : [];
  const dir = parts.slice(0, -1).join(" / ");
  const fileName = parts.at(-1) ?? "";

  const run = async (action: "open" | "reveal") => {
    if (!path) return;
    setActionError(null);
    try {
      const result = await workspacesApi.openFile({ workspaceRoot, relativePath: path, action });
      if (!result.ok) setActionError("无法打开这个文件。");
    } catch {
      setActionError("无法打开这个文件。");
    }
  };

  const copyPath = async () => {
    if (!path) return;
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      setActionError("无法复制路径。");
    }
  };

  const treeLabel = docsTreeCollapsed ? "展开文件树" : "收起文件树";
  const expandLabel = docsExpanded ? "还原面板" : "展开面板";

  return (
    <div className="@container flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
      <div className={HEADER_CLASS}>
        <div className={CRUMBS_CLASS}>
          {path ? (
            <>
              <span className="hidden min-w-0 truncate @[560px]:inline" title={workspaceRoot}>{workspaceLabel}</span>
              {dir ? <span className="hidden min-w-0 truncate @[560px]:inline" title={dir}>/ {dir}</span> : null}
              <span className="min-w-0 truncate font-medium text-text-main" title={path}>{fileName}</span>
            </>
          ) : (
            <span>MD 文档</span>
          )}
        </div>
        {path && dirty ? <span className="size-1.5 shrink-0 rounded-full bg-warning" role="img" aria-label="有未保存的改动" /> : null}
        {path ? (
          <>
            <PreviewSourceToggle mode={docsMode} onChange={setDocsMode} />
            <DocsOutline editorRef={editorRef} disabled={!ready} />
            {/* 面板窄时先收掉三个次要操作，保证文件名、未保存圆点、展开面板和收起文件树始终看得见。 */}
            <div className="hidden items-center gap-1 @[460px]:flex">
            <IconButton label="在 Finder 中显示" onClick={() => void run("reveal")}>
              <FolderOpen size={15} aria-hidden="true" />
            </IconButton>
            <IconButton label="用默认应用打开" onClick={() => void run("open")}>
              <ExternalLink size={15} aria-hidden="true" />
            </IconButton>
            <IconButton label="复制路径" tooltip={copied ? "已复制路径" : "复制路径"} onClick={() => void copyPath()}>
              <Copy size={15} aria-hidden="true" />
            </IconButton>
            </div>
          </>
        ) : null}
        <IconButton label={expandLabel} aria-pressed={docsExpanded} onClick={toggleDocsExpanded}>
          {docsExpanded ? <Minimize2 size={15} aria-hidden="true" /> : <Maximize2 size={15} aria-hidden="true" />}
        </IconButton>
        {/* 用方向箭头而不是 PanelRight：PanelRight 已是窗口右上角「收起右侧面板」的图标，并排会认错。 */}
        <IconButton label={treeLabel} aria-expanded={!docsTreeCollapsed} onClick={toggleDocsTreeCollapsed}>
          {docsTreeCollapsed
            ? <ChevronsLeft size={15} aria-hidden="true" />
            : <ChevronsRight size={15} aria-hidden="true" />}
        </IconButton>
      </div>

      {ready?.isStale ? (
        <div className={`${BAR_CLASS} bg-warning-soft text-on-warning`} role="status">
          <TriangleExclamationPoint size={13} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {dirty ? "文件已在磁盘上变更。保存会覆盖磁盘上的版本，重新加载会丢弃未保存的改动。" : "文件已在磁盘上变更，当前显示的是旧内容。"}
          </span>
          <Button size="xs" variant="ghost" onClick={onReload}>重新加载</Button>
        </div>
      ) : null}
      {ready?.truncated ? (
        <div className={`${BAR_CLASS} bg-surface-subtle text-text-faint`} role="status">
          {`文件过大，请用默认应用编辑（共 ${formatBytes(ready.size)}，这里只显示前 ${formatBytes(WORKSPACE_TEXT_PREVIEW_LIMIT_BYTES)} 内的完整行，只读）。`}
        </div>
      ) : null}
      {saveError ? <div className={`${BAR_CLASS} bg-danger-soft text-on-danger`} role="alert">{saveError}</div> : null}
      {actionError ? <div className={`${BAR_CLASS} bg-danger-soft text-on-danger`} role="alert">{actionError}</div> : null}

      {!workspaceRoot ? (
        <div className={STATE_CLASS}>请先在顶部选择工作区。</div>
      ) : !path ? (
        <div className={STATE_CLASS}>
          {listingEmpty ? "这个工作区还没有 Markdown 文档" : listingStatus === "loading" ? <LoaderCircle size={15} className="animate-spin" aria-label="正在读取文档列表" /> : "从右侧选择一篇文档"}
        </div>
      ) : !doc || doc.status === "loading" ? (
        <div className={STATE_CLASS}><LoaderCircle size={15} className="animate-spin" aria-label="正在读取文档" /></div>
      ) : doc.status === "error" ? (
        <div className={STATE_CLASS} role="alert">{doc.message ?? "读取文件失败。"}</div>
      ) : (
        // 编辑器是懒加载的 chunk：加载期间显示与读取文档时一样的占位。
        <Suspense fallback={<div className={STATE_CLASS}><LoaderCircle size={15} className="animate-spin" aria-label="正在加载编辑器" /></div>}>
          <MarkdownEditor
            ref={editorRef}
            value={doc.draft}
            docPath={doc.relativePath}
            workspaceRoot={workspaceRoot}
            mode={docsMode}
            readOnly={doc.truncated}
            replaceKey={doc.relativePath}
            revealLine={docsPendingLine?.path === doc.relativePath ? docsPendingLine : null}
            onRevealed={clearDocsPendingLine}
            onChange={onDraftChange}
            onSave={onSave}
          />
        </Suspense>
      )}
    </div>
  );
}
