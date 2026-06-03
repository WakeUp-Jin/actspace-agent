import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  GitBranch,
  Loader2,
  Minus,
  MoreHorizontal,
  Plus,
  RefreshCw,
} from "lucide-react";
import type { ReviewFileChange, ReviewGetWorkspaceChangesResult, ReviewWarning } from "@actspace/shared";

type ReviewRenderViewProps = {
  workspaceRoot?: string;
  refreshKey?: number;
  onReviewChanged?: () => void;
};

type ReviewViewState =
  | { status: "loading" }
  | { status: "ready"; result: ReviewGetWorkspaceChangesResult }
  | { status: "error"; message: string };

const SHELL_CLASS = "flex min-h-0 flex-1 flex-col overflow-hidden bg-surface";
const TOOLBAR_CLASS = "flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2";
const TOOLBAR_LEFT_CLASS = "flex min-w-0 items-center gap-2";
const SCOPE_BUTTON_CLASS =
  "inline-flex h-7 items-center gap-1.5 rounded-act-sm border border-line bg-surface-subtle px-2 text-[12px] font-medium text-text-main";
const TOTAL_CLASS = "shrink-0 text-[12px] tabular-nums text-text-faint";
const TOOLBAR_RIGHT_CLASS = "flex shrink-0 items-center gap-1";
const ICON_BUTTON_CLASS =
  "inline-flex h-7 w-7 items-center justify-center rounded-act-sm border-0 bg-transparent text-text-faint hover:bg-line hover:text-text-main [cursor:pointer]";
const BODY_CLASS = "min-h-0 flex-1 overflow-auto";
const STATE_CLASS = "grid min-h-full place-items-center p-5 text-center";
const STATE_INNER_CLASS = "grid max-w-[280px] gap-2";
const STATE_TITLE_CLASS = "text-[13px] font-semibold text-text-main";
const STATE_TEXT_CLASS = "text-[12px] leading-[1.6] text-text-muted";
const PRIMARY_BUTTON_CLASS =
  "mx-auto mt-1 inline-flex h-8 items-center gap-1.5 rounded-act-sm border border-brand/30 bg-brand-soft px-3 text-[12px] font-semibold text-brand-strong hover:border-brand hover:bg-brand-soft [cursor:pointer]";
const WARNING_LIST_CLASS = "grid gap-1 border-b border-line bg-surface-subtle px-3 py-2";
const WARNING_ROW_CLASS = "flex min-w-0 items-start gap-2 text-[12px] leading-[1.45] text-text-muted";
const FILE_LIST_CLASS = "grid";
const FILE_ROW_CLASS =
  "flex min-h-10 w-full items-center gap-2 border-0 border-b border-line bg-transparent px-3 text-left hover:bg-surface-subtle [cursor:pointer]";
const FILE_ICON_CLASS = "shrink-0";
const FILE_PATH_CLASS = "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12px] text-text-main";
const FILE_STATS_CLASS = "shrink-0 text-[12px] tabular-nums";
const ADD_CLASS = "font-medium text-success";
const DELETE_CLASS = "font-medium text-danger";
const DIFF_WRAP_CLASS = "border-b border-line bg-surface px-3 pb-3";
const DIFF_CONTENT_CLASS = "file-diff-content my-2 max-w-none";
const DIFF_EMPTY_CLASS = "px-3 py-2 text-[12px] text-text-faint";

const STATUS_LABEL: Record<ReviewFileChange["status"], string> = {
  added: "New",
  modified: "Modified",
  deleted: "Deleted",
  renamed: "Renamed",
};

function hasTextDiff(file: ReviewFileChange): boolean {
  return file.chunks.some((chunk) => Boolean(chunk.unifiedText?.trim()));
}

function warningText(warning: ReviewWarning): string {
  return warning.filePath ? `${warning.filePath}: ${warning.message}` : warning.message;
}

function getFirstExpandedPath(files: ReviewFileChange[]): string | null {
  return files.find(hasTextDiff)?.path ?? files[0]?.path ?? null;
}

function FileStatusIcon({ status }: { status: ReviewFileChange["status"] }) {
  if (status === "added") return <Plus className={`${FILE_ICON_CLASS} text-success`} size={15} strokeWidth={2.2} />;
  if (status === "deleted") return <Minus className={`${FILE_ICON_CLASS} text-danger`} size={15} strokeWidth={2.2} />;
  if (status === "renamed") return <GitBranch className={`${FILE_ICON_CLASS} text-brand`} size={15} strokeWidth={2.1} />;
  return <FileText className={`${FILE_ICON_CLASS} text-text-faint`} size={15} strokeWidth={2} />;
}

function diffLineClass(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) return "diff-line is-add";
  if (line.startsWith("-") && !line.startsWith("---")) return "diff-line is-remove";
  if (line.startsWith("@@")) return "diff-line text-brand";
  return "diff-line";
}

function renderDiffLine(line: string, key: string) {
  return (
    <span className={diffLineClass(line)} key={key}>
      {line || " "}
    </span>
  );
}

function ReviewState({
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
    <div className={STATE_CLASS}>
      <div className={STATE_INNER_CLASS}>
        <div className="mx-auto text-text-faint">{icon}</div>
        <h2 className={STATE_TITLE_CLASS}>{title}</h2>
        <p className={STATE_TEXT_CLASS}>{message}</p>
        {action}
      </div>
    </div>
  );
}

function ReviewWarnings({ warnings }: { warnings?: ReviewWarning[] }) {
  if (!warnings?.length) return null;
  return (
    <div className={WARNING_LIST_CLASS} aria-label="Review warnings">
      {warnings.map((warning, index) => (
        <div className={WARNING_ROW_CLASS} key={`${warning.kind}-${warning.filePath ?? index}`}>
          <AlertTriangle size={14} className="mt-[2px] shrink-0 text-on-warm" aria-hidden="true" />
          <span className="min-w-0">{warningText(warning)}</span>
        </div>
      ))}
    </div>
  );
}

function ReviewFileRow({
  file,
  expanded,
  onToggle,
}: {
  file: ReviewFileChange;
  expanded: boolean;
  onToggle: () => void;
}) {
  const label = `${STATUS_LABEL[file.status]} ${file.previousPath ? `${file.previousPath} to ` : ""}${file.path} +${file.additions} -${file.deletions}`;
  return (
    <>
      <button type="button" className={FILE_ROW_CLASS} aria-expanded={expanded} aria-label={label} onClick={onToggle}>
        {expanded ? (
          <ChevronDown size={14} className="shrink-0 text-text-faint" aria-hidden="true" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-text-faint" aria-hidden="true" />
        )}
        <FileStatusIcon status={file.status} />
        <span className={FILE_PATH_CLASS} title={file.previousPath ? `${file.previousPath} -> ${file.path}` : file.path}>
          {file.path}
        </span>
        <span className={FILE_STATS_CLASS}>
          <span className={ADD_CLASS}>+{file.additions}</span>{" "}
          <span className={DELETE_CLASS}>-{file.deletions}</span>
        </span>
      </button>
      {expanded ? (
        <div className={DIFF_WRAP_CLASS}>
          {hasTextDiff(file) ? (
            <pre className={DIFF_CONTENT_CLASS}>
              {file.chunks.flatMap((chunk, chunkIndex) =>
                (chunk.unifiedText ?? "").split("\n").map((line, lineIndex) =>
                  renderDiffLine(line, `${file.path}-${chunkIndex}-${lineIndex}`),
                ),
              )}
            </pre>
          ) : (
            <div className={DIFF_EMPTY_CLASS}>No textual diff available.</div>
          )}
        </div>
      ) : null}
    </>
  );
}

export function ReviewRenderView({ workspaceRoot, refreshKey, onReviewChanged }: ReviewRenderViewProps) {
  const [state, setState] = useState<ReviewViewState>({ status: "loading" });
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const [initializing, setInitializing] = useState(false);

  const loadReview = useCallback(async () => {
    const api = typeof window !== "undefined" ? window.actspace?.getWorkspaceReview : undefined;
    if (!api) {
      setState({ status: "error", message: "Review bridge is not available." });
      return;
    }
    setState({ status: "loading" });
    try {
      const result = await api({ workspaceRoot, scope: "uncommitted" });
      setState({ status: "ready", result });
      const firstPath = getFirstExpandedPath(result.changeSet?.files ?? []);
      setExpandedPaths(firstPath ? new Set([firstPath]) : new Set());
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to load Review.",
      });
    }
  }, [workspaceRoot]);

  useEffect(() => {
    void loadReview();
  }, [loadReview, refreshKey]);

  const initializeGit = useCallback(async () => {
    const api = typeof window !== "undefined" ? window.actspace?.initGitRepository : undefined;
    if (!api || initializing) return;
    setInitializing(true);
    try {
      const result = await api({ workspaceRoot });
      if (!result.ok) {
        setState({
          status: "ready",
          result: {
            provider: "git",
            status: "failed",
            reason: result.error === "git_not_found" ? "git_not_found" : "command_failed",
            message: result.message ?? "Git initialization failed.",
          },
        });
        return;
      }
      await loadReview();
      onReviewChanged?.();
    } finally {
      setInitializing(false);
    }
  }, [initializing, loadReview, onReviewChanged, workspaceRoot]);

  const toggleFile = useCallback((path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const result = state.status === "ready" ? state.result : null;
  const changeSet = result?.changeSet;
  const fileCount = changeSet?.files.length ?? 0;
  const totalLabel = changeSet ? `+${changeSet.totalAdditions} -${changeSet.totalDeletions}` : "";
  const toolbarLabel = useMemo(() => {
    if (!changeSet) return "Review uncommitted changes";
    return `${fileCount} Uncommitted Changes, +${changeSet.totalAdditions} -${changeSet.totalDeletions}`;
  }, [changeSet, fileCount]);

  let body: React.ReactNode;
  if (state.status === "loading") {
    body = (
      <ReviewState
        icon={<Loader2 size={18} className="animate-spin" />}
        title="Loading Review"
        message="Reading Git changes for this workspace."
      />
    );
  } else if (state.status === "error") {
    body = (
      <ReviewState
        icon={<AlertTriangle size={18} />}
        title="Review Unavailable"
        message={state.message}
        action={
          <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={() => void loadReview()}>
            <RefreshCw size={14} aria-hidden="true" />
            Refresh
          </button>
        }
      />
    );
  } else if (result?.status === "notAvailable" && result.reason === "not_a_repository") {
    body = (
      <ReviewState
        icon={<GitBranch size={18} />}
        title="No Git Repository"
        message="Initialize Git to review workspace changes from a stable baseline."
        action={
          <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={() => void initializeGit()}>
            {initializing ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <GitBranch size={14} aria-hidden="true" />}
            Initialize Git
          </button>
        }
      />
    );
  } else if (result?.status === "failed") {
    body = (
      <ReviewState
        icon={<AlertTriangle size={18} />}
        title="Review Failed"
        message={result.message ?? "Git review failed."}
        action={
          <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={() => void loadReview()}>
            <RefreshCw size={14} aria-hidden="true" />
            Refresh
          </button>
        }
      />
    );
  } else if (!changeSet || fileCount === 0) {
    body = (
      <>
        <ReviewWarnings warnings={changeSet?.warnings} />
        <ReviewState
          icon={<CheckCircle2 size={18} />}
          title="No Changes"
          message="Git found no uncommitted changes in this workspace."
        />
      </>
    );
  } else {
    body = (
      <>
        <ReviewWarnings warnings={changeSet.warnings} />
        <div className={FILE_LIST_CLASS} aria-label="Review changed files">
          {changeSet.files.map((file) => (
            <ReviewFileRow
              key={file.path}
              file={file}
              expanded={expandedPaths.has(file.path)}
              onToggle={() => toggleFile(file.path)}
            />
          ))}
        </div>
      </>
    );
  }

  return (
    <section className={SHELL_CLASS} aria-label="Review">
      <div className={TOOLBAR_CLASS} aria-label={toolbarLabel}>
        <div className={TOOLBAR_LEFT_CLASS}>
          <button type="button" className={SCOPE_BUTTON_CLASS} aria-label="Review scope" disabled>
            <span>Uncommitted</span>
            <ChevronDown size={13} aria-hidden="true" />
          </button>
          {totalLabel ? <span className={TOTAL_CLASS}>{totalLabel}</span> : null}
        </div>
        <div className={TOOLBAR_RIGHT_CLASS}>
          <button type="button" className={ICON_BUTTON_CLASS} aria-label="Refresh Review" onClick={() => void loadReview()}>
            <RefreshCw size={14} aria-hidden="true" />
          </button>
          <button type="button" className={ICON_BUTTON_CLASS} aria-label="More Review actions">
            <MoreHorizontal size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className={BODY_CLASS}>{body}</div>
    </section>
  );
}
