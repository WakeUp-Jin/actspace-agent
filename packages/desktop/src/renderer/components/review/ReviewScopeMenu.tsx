import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { ReviewBranch, ReviewSelection } from "@actspace/shared";

const ITEM = "flex min-h-8 w-full items-center gap-2 rounded-act-sm border-0 bg-transparent px-2.5 text-left text-[13px] text-text-main hover:bg-surface-subtle [cursor:pointer]";

export function ReviewScopeMenu({ selection, sessionId, workspaceRoot, onSelect }: {
  selection: ReviewSelection;
  sessionId?: string | null;
  workspaceRoot?: string;
  onSelect: (selection: ReviewSelection) => void;
}) {
  const [picker, setPicker] = useState<"commit" | "branch" | null>(null);
  const [value, setValue] = useState("");
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
      <form className="grid gap-2 p-2" onSubmit={(event) => {
        event.preventDefault();
        const trimmed = value.trim();
        if (trimmed) onSelect({ kind: "commit", sha: trimmed });
      }}>
        <label className="text-[11px] font-medium text-text-muted">Commit SHA or ref</label>
        <input autoFocus className="h-8 rounded-act-sm border border-line bg-surface px-2 text-[12px] text-text-main outline-none focus:border-focus-ring" value={value} onChange={(event) => setValue(event.target.value)} placeholder="HEAD~1" />
        <div className="flex justify-between gap-2">
          <button type="button" className="inline-flex h-7 items-center gap-1 rounded-act-sm px-2 text-[12px] text-text-muted hover:bg-surface-subtle" onClick={() => setPicker(null)}><ChevronLeft size={13} />Back</button>
          <button type="submit" className="h-7 rounded-act-sm bg-action px-2.5 text-[12px] font-medium text-on-action">Review</button>
        </div>
      </form>
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
      <button type="button" role="menuitem" className={ITEM} onClick={() => { setPicker("commit"); setValue(selection.kind === "commit" ? selection.sha : ""); }}><span className="flex-1">Committed</span><ChevronRight size={14} /></button>
      <button type="button" role="menuitem" className={ITEM} onClick={() => setPicker("branch")}><span className="flex-1">Branch</span><ChevronRight size={14} /></button>
    </div>
  );
}
