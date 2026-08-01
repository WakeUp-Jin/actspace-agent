import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { ReviewBranch, ReviewCommit, ReviewSelection } from "@actspace/shared";

const ITEM = "flex min-h-8 w-full items-center gap-2 rounded-act-sm border-0 bg-transparent px-2.5 text-left text-[13px] text-text-main hover:bg-surface-subtle [cursor:pointer]";

export function ReviewScopeMenu({ selection, sessionId, workspaceRoot, onSelect }: {
  selection: ReviewSelection;
  sessionId?: string | null;
  workspaceRoot?: string;
  onSelect: (selection: ReviewSelection) => void;
}) {
  const [picker, setPicker] = useState<"commit" | "branch" | null>(null);
  const [commits, setCommits] = useState<ReviewCommit[]>([]);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [branches, setBranches] = useState<ReviewBranch[]>([]);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const simple: Array<{ label: string; value: ReviewSelection; disabled?: boolean }> = [
    { label: "Last Turn", value: { kind: "lastTurn", sessionId: sessionId ?? "" }, disabled: !sessionId },
    { label: "Uncommitted", value: { kind: "uncommitted" } },
    { label: "Unstaged", value: { kind: "unstaged" } },
    { label: "Staged", value: { kind: "staged" } },
  ];

  useEffect(() => {
    if (picker !== "commit") return;
    const api = window.actspace?.listReviewCommits;
    if (!api) {
      setCommitError("Commit history is unavailable.");
      return;
    }
    let active = true;
    setLoadingCommits(true);
    setCommitError(null);
    void api({ workspaceRoot, sessionId: sessionId ?? undefined }).then((result) => {
      if (!active) return;
      setLoadingCommits(false);
      if (result.ok === true) setCommits(result.commits);
      else setCommitError(result.message);
    });
    return () => { active = false; };
  }, [picker, sessionId, workspaceRoot]);

  useEffect(() => {
    if (picker !== "branch") return;
    const api = window.actspace?.listReviewBranches;
    if (!api) {
      setBranchError("Branch comparison is unavailable.");
      return;
    }
    let active = true;
    setLoadingBranches(true);
    setBranchError(null);
    void api({ workspaceRoot, sessionId: sessionId ?? undefined }).then((result) => {
      if (!active) return;
      setLoadingBranches(false);
      if (result.ok === true) setBranches(result.branches);
      else setBranchError(result.message);
    });
    return () => { active = false; };
  }, [picker, sessionId, workspaceRoot]);

  if (picker === "commit") {
    return (
      <div className="grid gap-1 p-1.5" role="menu" aria-label="Recent commits">
        <button type="button" className={`${ITEM} text-text-muted`} onClick={() => setPicker(null)}><ChevronLeft size={13} />Committed</button>
        <div className="mx-1 border-t border-line" />
        {loadingCommits ? <div className="flex min-h-12 items-center justify-center gap-2 text-[12px] text-text-faint"><Loader2 size={13} className="animate-spin" />Loading commits…</div> : null}
        {!loadingCommits && commitError ? <div className="px-2.5 py-3 text-[12px] leading-relaxed text-danger">{commitError}</div> : null}
        {!loadingCommits && !commitError && commits.length === 0 ? <div className="px-2.5 py-3 text-[12px] leading-relaxed text-text-faint">No commits in this workspace.</div> : null}
        {!loadingCommits && !commitError && commits.length > 0 ? <div className="max-h-[min(360px,calc(100vh-120px))] overflow-y-auto">
          {commits.map((commit) => (
            <button key={commit.sha} type="button" role="menuitem" className={`${ITEM} min-w-0`} onClick={() => onSelect({ kind: "commit", sha: commit.sha })} title={`${commit.sha.slice(0, 8)} · ${formatCommitTimestamp(commit.authoredAt)}`}>
              <span className="min-w-0 flex-1 truncate">{commit.subject || commit.sha.slice(0, 8)}</span>
              <time className="shrink-0 text-[11px] tabular-nums text-text-faint" dateTime={commit.authoredAt}>{formatCommitAge(commit.authoredAt)}</time>
              {selection.kind === "commit" && selection.sha === commit.sha ? <Check size={14} className="shrink-0" /> : null}
            </button>
          ))}
        </div> : null}
      </div>
    );
  }

  if (picker === "branch") {
    return (
      <div className="grid gap-1 p-1.5" role="menu" aria-label="Branches with upstream tracking">
        <button type="button" className={`${ITEM} text-text-muted`} onClick={() => setPicker(null)}><ChevronLeft size={13} />Branches</button>
        <div className="mx-1 border-t border-line" />
        {loadingBranches ? <div className="flex min-h-12 items-center justify-center gap-2 text-[12px] text-text-faint"><Loader2 size={13} className="animate-spin" />Loading branches…</div> : null}
        {!loadingBranches && branchError ? <div className="px-2.5 py-3 text-[12px] leading-relaxed text-danger">{branchError}</div> : null}
        {!loadingBranches && !branchError && branches.length === 0 ? <div className="px-2.5 py-3 text-[12px] leading-relaxed text-text-faint">No local branch has an upstream remote-tracking branch.</div> : null}
        {branches.map((branch) => (
          <button key={branch.branch} type="button" role="menuitem" className={`${ITEM} min-w-0`} onClick={() => onSelect({ kind: "branch", branch: branch.branch })}>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{branch.branch}</span>
              <span className="block truncate text-[10px] text-text-faint">→ {branch.upstream}{branch.ahead > 0 ? ` · ${branch.ahead} ahead` : ""}{branch.behind > 0 ? ` · ${branch.behind} behind` : ""}</span>
            </span>
            {selection.kind === "branch" && selection.branch === branch.branch ? <Check size={14} /> : null}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-0.5 p-1.5" role="menu" aria-label="Review scope options">
      {simple.map((item) => (
        <button key={item.label} type="button" role="menuitem" className={`${ITEM} ${item.disabled ? "cursor-not-allowed text-text-faint opacity-60" : ""}`} disabled={item.disabled} onClick={() => onSelect(item.value)}>
          <span className="min-w-0 flex-1">{item.label}</span>
          {selection.kind === item.value.kind ? <Check size={14} /> : null}
        </button>
      ))}
      <div className="mx-1 my-1 border-t border-line" />
      <button type="button" role="menuitem" className={ITEM} onClick={() => setPicker("commit")}><span className="flex-1">Committed</span><ChevronRight size={14} /></button>
      <button type="button" role="menuitem" className={ITEM} onClick={() => setPicker("branch")}><span className="flex-1">Branch</span><ChevronRight size={14} /></button>
    </div>
  );
}

function formatCommitAge(timestamp: string): string {
  const value = new Date(timestamp).getTime();
  if (!Number.isFinite(value)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - value) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function formatCommitTimestamp(timestamp: string): string {
  const value = new Date(timestamp);
  return Number.isNaN(value.getTime()) ? timestamp : value.toLocaleString();
}
