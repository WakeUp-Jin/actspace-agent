import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TriangleExclamationPoint, CircleCheck, LoaderCircle, RefreshCw } from "lucide-react";
import { ReviewDiffCanvas } from "./ReviewDiffCanvas";
import { ReviewFileTree } from "./ReviewFileTree";
import { ReviewToolbar } from "./ReviewToolbar";
import { useReviewWorkspaceStore } from "./review-store";

export function ReviewWorkspace({
  workspaceRoot,
  sessionId,
  refreshKey,
}: {
  workspaceRoot?: string;
  sessionId?: string | null;
  refreshKey?: number;
}) {
  const {
    state,
    setSelection,
    refresh,
    selectFile,
    toggleFile,
    setAllExpanded,
    retryDiff,
    expandContext,
    loadFileContents,
    toggleWhitespace,
    patchState,
  } = useReviewWorkspaceStore({ workspaceRoot, sessionId });
  const [reviewWidth, setReviewWidth] = useState(0);
  const rootRef = useRef<HTMLElement>(null);
  const lastRefreshKey = useRef(refreshKey);
  const filteredFiles = useMemo(
    () =>
      state.snapshot?.files.filter((file) =>
        file.path.toLocaleLowerCase().includes(state.fileFilter.toLocaleLowerCase()),
      ) ?? [],
    [state.fileFilter, state.snapshot],
  );
  const displayedFiles =
    state.snapshot?.loadPolicy.mode === "single-file" && state.selectedFileId
      ? filteredFiles.filter((file) => file.id === state.selectedFileId)
      : filteredFiles;
  const allExpanded =
    Boolean(displayedFiles.length) && displayedFiles.every((file) => state.expandedFileIds.has(file.id));
  const compactFiles = reviewWidth > 0 && reviewWidth < 560;
  const splitAvailable = reviewWidth >= 640;

  useEffect(() => {
    if (lastRefreshKey.current !== refreshKey) {
      lastRefreshKey.current = refreshKey;
      refresh();
    }
  }, [refreshKey, refresh]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => setReviewWidth(root.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!splitAvailable && state.diffMode === "split") patchState({ diffMode: "unified" });
  }, [patchState, splitAvailable, state.diffMode]);

  return (
    <section
      ref={rootRef}
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface"
      aria-label="工作区变更审查"
    >
      <ReviewToolbar
        snapshot={state.snapshot}
        selection={state.selection}
        workspaceRoot={workspaceRoot}
        sessionId={sessionId}
        files={state.snapshot?.files ?? []}
        filesVisible={state.filesVisible}
        diffMode={state.diffMode}
        splitAvailable={splitAvailable}
        singleFileMode={state.snapshot?.loadPolicy.mode === "single-file"}
        wrap={state.wrap}
        ignoreWhitespaceChanges={state.ignoreWhitespaceChanges}
        wordDiff={state.wordDiff}
        loadFullFiles={state.loadFullFiles}
        richPreview={state.richPreview}
        allExpanded={allExpanded}
        onSelectScope={setSelection}
        onRefresh={refresh}
        onToggleAll={setAllExpanded}
        onJump={selectFile}
        onDiffMode={(diffMode) => patchState({ diffMode: splitAvailable ? diffMode : "unified" })}
        onToggleFiles={() => patchState({ filesVisible: !state.filesVisible })}
        onWrap={() => patchState({ wrap: !state.wrap })}
        onWhitespace={toggleWhitespace}
        onWordDiff={() => patchState({ wordDiff: !state.wordDiff })}
        onLoadFullFiles={() => patchState({ loadFullFiles: !state.loadFullFiles })}
        onRichPreview={() => patchState({ richPreview: !state.richPreview })}
      />
      {state.feedback ? (
        <div
          className="flex min-h-8 shrink-0 items-center border-b border-line bg-surface-subtle px-3 text-act-xs text-text-muted"
          role="status"
        >
          {state.feedback}
        </div>
      ) : null}
      {state.snapshot?.status !== "notAvailable" &&
      state.snapshot?.warnings?.some((warning) => warning.kind !== "capped") ? (
        <div className="grid shrink-0 gap-1 border-b border-line bg-warning-soft px-3 py-2">
          {state.snapshot.warnings
            .filter((warning) => warning.kind !== "capped")
            .map((warning, index) => (
              <div key={`${warning.kind}-${index}`} className="flex items-start gap-2 text-act-xs text-text-muted">
                <TriangleExclamationPoint size={13} className="mt-0.5 shrink-0 text-on-warning" />
                {warning.filePath ? `${warning.filePath}: ` : ""}
                {warning.message}
              </div>
            ))}
        </div>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1">
        {state.filesVisible && state.snapshot && compactFiles ? (
          <div className="h-full min-h-0 min-w-0 flex-1 overflow-hidden" data-review-files-layout="compact">
            <ReviewFileTree
              files={state.snapshot.files}
              selectedFileId={state.selectedFileId}
              filter={state.fileFilter}
              onFilter={(fileFilter) => patchState({ fileFilter })}
              onSelect={(fileId) => {
                selectFile(fileId);
                patchState({ filesVisible: false });
              }}
              onClose={() => patchState({ filesVisible: false })}
            />
          </div>
        ) : (
          <>
            <div className="flex min-h-0 min-w-0 flex-1">
              {!workspaceRoot && !sessionId ? (
                <Centered
                  icon={<TriangleExclamationPoint size={18} />}
                  title="选择工作区"
                  message="请先在输入框中选择工作区，再打开变更审查。"
                />
              ) : state.loading ? (
                <Centered
                  icon={<LoaderCircle size={18} className="animate-spin" />}
                  title="正在加载变更审查"
                  message="正在读取所选变更。"
                />
              ) : state.error ? (
                <Centered
                  icon={<TriangleExclamationPoint size={18} />}
                  title="变更审查不可用"
                  message={state.error}
                  action={
                    <button
                      type="button"
                      className="mx-auto inline-flex h-8 items-center gap-1.5 rounded-act-sm bg-action px-3 text-act-xs font-medium text-on-action"
                      onClick={refresh}
                    >
                      <RefreshCw size={13} />
                      刷新
                    </button>
                  }
                />
              ) : state.snapshot?.status === "notAvailable" ? (
                <Centered
                  icon={<TriangleExclamationPoint size={18} />}
                  title={state.snapshot.warnings?.[0]?.message.replace(/。$/, "") || "变更审查不可用"}
                  message="这里显示 Git 仓库里未提交的改动、提交和分支的差异。"
                />
              ) : !state.snapshot || state.snapshot.status === "empty" || !filteredFiles.length ? (
                <Centered
                  icon={<CircleCheck size={18} />}
                  title="暂无变更"
                  message={state.fileFilter ? "没有符合当前筛选条件的文件。" : "当前审查范围内没有变更。"}
                />
              ) : (
                <ReviewDiffCanvas
                  workspaceRoot={workspaceRoot}
                  files={displayedFiles}
                  diffs={state.diffs}
                  fileRequests={state.fileRequests}
                  fileContents={state.fileContents}
                  capabilities={state.snapshot.capabilities}
                  expandedFileIds={state.expandedFileIds}
                  selectedFileId={state.selectedFileId}
                  mode={state.diffMode}
                  wrap={state.wrap}
                  wordDiff={state.wordDiff}
                  richPreview={state.richPreview}
                  loadFullFiles={state.loadFullFiles}
                  singleFileMode={state.snapshot.loadPolicy.mode === "single-file"}
                  onToggleFile={toggleFile}
                  onSelectFile={selectFile}
                  onExpandContext={expandContext}
                  onRetryDiff={retryDiff}
                  onVisibleFiles={(fileIds) => void loadFileContents(fileIds)}
                />
              )}
            </div>
            {state.filesVisible && state.snapshot ? (
              <div
                className="h-full w-[clamp(220px,34%,300px)] shrink-0 overflow-hidden border-l border-line"
                data-review-files-layout="docked"
              >
                <ReviewFileTree
                  files={state.snapshot.files}
                  selectedFileId={state.selectedFileId}
                  filter={state.fileFilter}
                  onFilter={(fileFilter) => patchState({ fileFilter })}
                  onSelect={selectFile}
                  onClose={() => patchState({ filesVisible: false })}
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function Centered({
  icon,
  title,
  message,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-0 min-w-0 flex-1 place-items-center p-8 text-center">
      <div className="grid max-w-[340px] gap-2">
        <div className="mx-auto text-text-faint">{icon}</div>
        <h2 className="text-act-sm font-semibold text-text-main">{title}</h2>
        <p className="text-act-xs leading-relaxed text-text-muted">{message}</p>
        {action}
      </div>
    </div>
  );
}
