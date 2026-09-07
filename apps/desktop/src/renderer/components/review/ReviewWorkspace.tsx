import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, GitPullRequestArrow, Loader2, RefreshCw } from "lucide-react";
import { ReviewDiffCanvas } from "./ReviewDiffCanvas";
import { ReviewFileTree } from "./ReviewFileTree";
import { ReviewToolbar } from "./ReviewToolbar";
import { useReviewWorkspaceStore } from "./review-store";

export function ReviewWorkspace({ workspaceRoot, sessionId, refreshKey, onReviewChanged }: {
  workspaceRoot?: string;
  sessionId?: string | null;
  refreshKey?: number;
  onReviewChanged?: () => void;
}) {
  const { state, setSelection, refresh, selectFile, toggleFile, setAllExpanded, retryDiff, expandContext, loadFileContents, toggleWhitespace, setViewed, applyMutation, patchState } = useReviewWorkspaceStore({ workspaceRoot, sessionId });
  const [dialog, setDialog] = useState<"git" | "pr" | null>(null);
  const [reviewWidth, setReviewWidth] = useState(0);
  const rootRef = useRef<HTMLElement>(null);
  const lastRefreshKey = useRef(refreshKey);
  const filteredFiles = useMemo(() => state.snapshot?.files.filter((file) => file.path.toLocaleLowerCase().includes(state.fileFilter.toLocaleLowerCase())) ?? [], [state.fileFilter, state.snapshot]);
  const displayedFiles = state.snapshot?.loadPolicy.mode === "single-file" && state.selectedFileId
    ? filteredFiles.filter((file) => file.id === state.selectedFileId)
    : filteredFiles;
  const allExpanded = Boolean(displayedFiles.length) && displayedFiles.every((file) => state.expandedFileIds.has(file.id));
  const compactFiles = reviewWidth > 0 && reviewWidth < 560;
  const splitAvailable = reviewWidth >= 640;

  useEffect(() => {
    if (lastRefreshKey.current !== refreshKey) {
      lastRefreshKey.current = refreshKey;
      refresh();
    }
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const copyGitApplyCommand = async () => {
    if (!state.snapshot || !window.actspace?.copyReviewGitApplyCommand) return;
    const result = await window.actspace.copyReviewGitApplyCommand({
      workspaceRoot,
      sessionId: sessionId ?? undefined,
      snapshotId: state.snapshot.id,
      expectedGeneration: state.snapshot.generation,
    });
    if (result.ok === false) {
      patchState({ feedback: result.message });
      return;
    }
    await navigator.clipboard.writeText(result.command);
    patchState({ feedback: "Git apply command copied." });
  };

  return (
    <section ref={rootRef} className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface" aria-label="Review workspace">
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
        onCopyApply={() => void copyGitApplyCommand()}
        onCommitOrPush={() => setDialog("git")}
        onCreatePr={() => setDialog("pr")}
      />
      {state.feedback ? <div className="flex min-h-8 shrink-0 items-center border-b border-line bg-surface-subtle px-3 text-[12px] text-text-muted" role="status">{state.feedback}</div> : null}
      {state.snapshot?.warnings?.some((warning) => warning.kind !== "capped") ? <div className="grid shrink-0 gap-1 border-b border-line bg-warning-soft px-3 py-2">{state.snapshot.warnings.filter((warning) => warning.kind !== "capped").map((warning, index) => <div key={`${warning.kind}-${index}`} className="flex items-start gap-2 text-[12px] text-text-muted"><AlertTriangle size={13} className="mt-0.5 shrink-0 text-on-warning" />{warning.filePath ? `${warning.filePath}: ` : ""}{warning.message}</div>)}</div> : null}
      <div className="flex min-h-0 min-w-0 flex-1">
        {state.filesVisible && state.snapshot && compactFiles ? (
          <div className="h-full min-h-0 min-w-0 flex-1 overflow-hidden" data-review-files-layout="compact"><ReviewFileTree files={state.snapshot.files} selectedFileId={state.selectedFileId} filter={state.fileFilter} onFilter={(fileFilter) => patchState({ fileFilter })} onSelect={(fileId) => { selectFile(fileId); patchState({ filesVisible: false }); }} onViewed={(fileId, viewed) => void setViewed(fileId, viewed)} onClose={() => patchState({ filesVisible: false })} /></div>
        ) : (
          <>
            <div className="flex min-h-0 min-w-0 flex-1">
              {!workspaceRoot && !sessionId ? <Centered icon={<AlertTriangle size={18} />} title="Select a workspace" message="Choose a workspace in the composer before opening Review." />
                : state.loading ? <Centered icon={<Loader2 size={18} className="animate-spin" />} title="Loading Review" message="Reading the selected change set." />
                : state.error ? <Centered icon={<AlertTriangle size={18} />} title="Review unavailable" message={state.error} action={<button type="button" className="mx-auto inline-flex h-8 items-center gap-1.5 rounded-act-sm bg-action px-3 text-[12px] font-medium text-on-action" onClick={refresh}><RefreshCw size={13} />Refresh</button>} />
                : state.snapshot?.status === "empty" || !filteredFiles.length ? <Centered icon={<CheckCircle2 size={18} />} title="No changes" message={state.fileFilter ? "No files match the current filter." : "No changes were found in this Review scope."} />
                : <ReviewDiffCanvas workspaceRoot={workspaceRoot} files={displayedFiles} diffs={state.diffs} fileRequests={state.fileRequests} fileContents={state.fileContents} capabilities={state.snapshot.capabilities} expandedFileIds={state.expandedFileIds} selectedFileId={state.selectedFileId} mode={state.diffMode} wrap={state.wrap} wordDiff={state.wordDiff} richPreview={state.richPreview} loadFullFiles={state.loadFullFiles} singleFileMode={state.snapshot.loadPolicy.mode === "single-file"} onToggleFile={toggleFile} onSelectFile={selectFile} onExpandContext={expandContext} onRetryDiff={retryDiff} onVisibleFiles={(fileIds) => void loadFileContents(fileIds)} onViewed={(fileId, viewed) => void setViewed(fileId, viewed)} onMutation={(mutation) => void applyMutation(mutation).then(onReviewChanged)} />}
            </div>
            {state.filesVisible && state.snapshot ? <div className="h-full w-[clamp(220px,34%,300px)] shrink-0 overflow-hidden border-l border-line" data-review-files-layout="docked"><ReviewFileTree files={state.snapshot.files} selectedFileId={state.selectedFileId} filter={state.fileFilter} onFilter={(fileFilter) => patchState({ fileFilter })} onSelect={selectFile} onViewed={(fileId, viewed) => void setViewed(fileId, viewed)} onClose={() => patchState({ filesVisible: false })} /></div> : null}
          </>
        )}
      </div>
      {dialog === "git" ? <GitDialog workspaceRoot={workspaceRoot} onClose={() => setDialog(null)} onDone={() => { setDialog(null); refresh(); onReviewChanged?.(); }} /> : null}
      {dialog === "pr" ? <PullRequestDialog workspaceRoot={workspaceRoot} onClose={() => setDialog(null)} /> : null}
    </section>
  );
}

function Centered({ icon, title, message, action }: { icon: React.ReactNode; title: string; message: string; action?: React.ReactNode }) {
  return <div className="grid min-h-0 min-w-0 flex-1 place-items-center p-8 text-center"><div className="grid max-w-[340px] gap-2"><div className="mx-auto text-text-faint">{icon}</div><h2 className="text-[13px] font-semibold text-text-main">{title}</h2><p className="text-[12px] leading-relaxed text-text-muted">{message}</p>{action}</div></div>;
}

function DialogShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-overlay p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="w-full max-w-[460px] rounded-act-lg border border-line bg-surface-raised shadow-act-float" role="dialog" aria-modal="true" aria-label={title}><div className="border-b border-line px-4 py-3 text-[14px] font-semibold text-text-main">{title}</div>{children}</div></div>;
}

function GitDialog({ workspaceRoot, onClose, onDone }: { workspaceRoot?: string; onClose: () => void; onDone: () => void }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (push: boolean) => {
    const api = push ? window.actspace?.commitAndPushWorkspaceChanges : window.actspace?.commitWorkspaceChanges;
    if (!api || !message.trim()) return;
    setBusy(true); setError(null);
    const result = await api({ workspaceRoot, message: message.trim(), includeUnstagedChanges: true });
    setBusy(false);
    if (result.ok) onDone(); else setError(result.message ?? "Git action failed.");
  };
  return <DialogShell title="Commit or push" onClose={onClose}><div className="grid gap-3 p-4"><label className="grid gap-1 text-[12px] text-text-muted">Commit message<input autoFocus className="h-9 rounded-act-sm border border-line bg-surface px-2 text-[13px] text-text-main outline-none focus:border-focus-ring" value={message} onChange={(event) => setMessage(event.target.value)} /></label>{error ? <div className="text-[12px] text-danger">{error}</div> : null}<div className="flex justify-end gap-2"><button type="button" className="h-8 px-3 text-[12px] text-text-muted" onClick={onClose}>Cancel</button><button type="button" disabled={busy || !message.trim()} className="h-8 rounded-act-sm border border-line px-3 text-[12px] text-text-main disabled:opacity-40" onClick={() => void run(false)}>Commit</button><button type="button" disabled={busy || !message.trim()} className="inline-flex h-8 items-center gap-1.5 rounded-act-sm bg-action px-3 text-[12px] font-medium text-on-action disabled:opacity-40" onClick={() => void run(true)}>{busy ? <Loader2 size={13} className="animate-spin" /> : null}Commit and push</button></div></div></DialogShell>;
}

function PullRequestDialog({ workspaceRoot, onClose }: { workspaceRoot?: string; onClose: () => void }) {
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [baseBranch, setBaseBranch] = useState("main"); const [draft, setDraft] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { void window.actspace?.getReviewPullRequestCapability?.({ workspaceRoot }).then((result) => { if (result.ok) { if (result.capability.baseBranch) setBaseBranch(result.capability.baseBranch); if (!result.capability.enabled) setMessage(result.capability.message ?? "Create PR is unavailable."); } }); }, [workspaceRoot]);
  const create = async () => { if (!window.actspace?.createReviewPullRequest || !title.trim()) return; setBusy(true); const result = await window.actspace.createReviewPullRequest({ workspaceRoot, title: title.trim(), body, baseBranch, draft }); setBusy(false); if (result.ok === true) onClose(); else setMessage(result.message); };
  return <DialogShell title="Create pull request" onClose={onClose}><div className="grid gap-3 p-4"><label className="grid gap-1 text-[12px] text-text-muted">Title<input autoFocus className="h-9 rounded-act-sm border border-line bg-surface px-2 text-[13px] text-text-main outline-none focus:border-focus-ring" value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="grid gap-1 text-[12px] text-text-muted">Base branch<input className="h-9 rounded-act-sm border border-line bg-surface px-2 text-[13px] text-text-main outline-none focus:border-focus-ring" value={baseBranch} onChange={(event) => setBaseBranch(event.target.value)} /></label><label className="grid gap-1 text-[12px] text-text-muted">Description<textarea className="min-h-24 resize-y rounded-act-sm border border-line bg-surface p-2 text-[12px] text-text-main outline-none focus:border-focus-ring" value={body} onChange={(event) => setBody(event.target.value)} /></label><label className="flex items-center gap-2 text-[12px] text-text-main"><input type="checkbox" checked={draft} onChange={(event) => setDraft(event.target.checked)} />Create as draft</label>{message ? <div className="text-[12px] text-text-muted">{message}</div> : null}<div className="flex justify-end gap-2"><button type="button" className="h-8 px-3 text-[12px] text-text-muted" onClick={onClose}>Cancel</button><button type="button" disabled={busy || !title.trim()} className="inline-flex h-8 items-center gap-1.5 rounded-act-sm bg-action px-3 text-[12px] font-medium text-on-action disabled:opacity-40" onClick={() => void create()}>{busy ? <Loader2 size={13} className="animate-spin" /> : <GitPullRequestArrow size={13} />}Create PR</button></div></div></DialogShell>;
}
