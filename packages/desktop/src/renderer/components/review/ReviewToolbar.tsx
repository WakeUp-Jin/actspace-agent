import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ArrowRightFromLine, Check, ChevronDown, Clipboard, Columns2, Eye, File, FileDiff, Folder, GitPullRequestArrow, Image, ListCollapse, ListTree, MoreHorizontal, RefreshCw, Search } from "lucide-react";
import type { ReviewFileSummary, ReviewSelection, ReviewSnapshot } from "@actspace/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";
import type { ReviewDiffMode } from "./review-store";
import { ReviewScopeMenu } from "./ReviewScopeMenu";

const ICON = "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-act-sm border-0 bg-transparent text-text-muted hover:bg-surface-subtle hover:text-text-main disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 [cursor:pointer]";
const POPOVER = "z-[120] rounded-act-md border border-line bg-surface-raised shadow-act-popover [-webkit-app-region:no-drag]";
const MENU_ITEM = "flex min-h-8 w-full items-center gap-2 rounded-act-sm px-2 text-left text-[12px] text-text-main hover:bg-surface-subtle";

export function ReviewToolbar({ snapshot, selection, workspaceRoot, sessionId, files, filesVisible, diffMode, splitAvailable, singleFileMode, wrap, ignoreWhitespaceChanges, wordDiff, loadFullFiles, richPreview, allExpanded, onSelectScope, onRefresh, onToggleAll, onJump, onDiffMode, onToggleFiles, onWrap, onWhitespace, onWordDiff, onLoadFullFiles, onRichPreview, onCopyApply, onCommitOrPush, onCreatePr }: {
  snapshot: ReviewSnapshot | null;
  selection: ReviewSelection;
  workspaceRoot?: string;
  sessionId?: string | null;
  files: ReviewFileSummary[];
  filesVisible: boolean;
  diffMode: ReviewDiffMode;
  splitAvailable: boolean;
  singleFileMode: boolean;
  wrap: boolean;
  ignoreWhitespaceChanges: boolean;
  wordDiff: boolean;
  loadFullFiles: boolean;
  richPreview: boolean;
  allExpanded: boolean;
  onSelectScope: (selection: ReviewSelection) => void;
  onRefresh: () => void;
  onToggleAll: (expanded: boolean) => void;
  onJump: (fileId: string) => void;
  onDiffMode: (mode: ReviewDiffMode) => void;
  onToggleFiles: () => void;
  onWrap: () => void;
  onWhitespace: () => void;
  onWordDiff: () => void;
  onLoadFullFiles: () => void;
  onRichPreview: () => void;
  onCopyApply: () => void;
  onCommitOrPush: () => void;
  onCreatePr: () => void;
}) {
  const [menu, setMenu] = useState<"scope" | "options" | "jump" | "git" | null>(null);
  const [jumpQuery, setJumpQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<HTMLButtonElement>(null);
  const optionsRef = useRef<HTMLButtonElement>(null);
  const jumpRef = useRef<HTMLButtonElement>(null);
  const gitRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) setMenu(null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenu(null); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [menu]);
  const scopeLabel = selection.kind === "lastTurn" ? "Last Turn" : selection.kind === "uncommitted" ? "Uncommitted" : selection.kind === "unstaged" ? "Unstaged" : selection.kind === "staged" ? "Staged" : selection.kind === "commit" ? "Committed" : "Branch";
  const jumpFiles = files.filter((file) => file.path.toLocaleLowerCase().includes(jumpQuery.toLocaleLowerCase())).slice(0, 12);
  const hasFiles = files.length > 0;
  const fileActionHint = hasFiles ? null : "No changed files in this Review scope";
  const splitHint = !hasFiles ? fileActionHint : !splitAvailable ? "Widen Review to use split diff" : diffMode === "split" ? "Switch to unified diff" : "Switch to split diff";
  return (
    <div ref={rootRef} className="relative z-20 shrink-0 border-b border-line bg-surface-raised [pointer-events:auto] [-webkit-app-region:no-drag]" aria-label="Review toolbar">
      <div className="flex min-h-11 min-w-0 items-center gap-1 overflow-x-auto px-2.5 scrollbar-none" data-review-toolbar-scroll>
        <div className="min-w-0 shrink">
          <button ref={scopeRef} type="button" className="inline-flex h-8 max-w-[140px] items-center gap-1 rounded-act-sm px-1.5 text-[13px] font-medium text-text-main hover:bg-surface-subtle" aria-label="Review scope" aria-haspopup="menu" aria-expanded={menu === "scope"} onClick={() => setMenu(menu === "scope" ? null : "scope")}>
            <span className="truncate">{scopeLabel}</span><ChevronDown size={13} />
          </button>
          {menu === "scope" ? <AnchoredPopover anchorRef={scopeRef} popoverRef={popoverRef} align="start" className="w-[250px]"><ReviewScopeMenu selection={selection} sessionId={sessionId} workspaceRoot={workspaceRoot} onSelect={(next) => { onSelectScope(next); setMenu(null); }} /></AnchoredPopover> : null}
        </div>
        {snapshot && (snapshot.totals.additions > 0 || snapshot.totals.deletions > 0) ? <div className="flex shrink-0 gap-1 text-[12px] tabular-nums">{snapshot.totals.additions > 0 ? <span className="text-success">+{snapshot.totals.additions}</span> : null}{snapshot.totals.deletions > 0 ? <span className="text-danger">-{snapshot.totals.deletions}</span> : null}</div> : null}
        <div className="min-w-2 flex-1" />
        <div className="shrink-0">
          <Tooltip><TooltipTrigger asChild><button ref={optionsRef} type="button" className={ICON} aria-label="Review options" onClick={() => setMenu(menu === "options" ? null : "options")}><MoreHorizontal size={15} /></button></TooltipTrigger><TooltipContent>Review options</TooltipContent></Tooltip>
          {menu === "options" ? <AnchoredPopover anchorRef={optionsRef} popoverRef={popoverRef} className="w-[220px] p-1.5">
            <button type="button" className={MENU_ITEM} onClick={() => { onRefresh(); setMenu(null); }}><RefreshCw size={13} />Refresh</button>
            <Option checked={wrap} label="Enable word wrap" icon={<ArrowRightFromLine size={13} />} onClick={onWrap} />
            <button type="button" className={MENU_ITEM} onClick={onLoadFullFiles}><File size={13} />{loadFullFiles ? "Don't load full files" : "Load full files"}</button>
            <Option checked={richPreview} label="Enable rich preview" icon={<Image size={13} />} onClick={onRichPreview} />
            <Option checked={wordDiff} label="Enable word diffs" icon={<FileDiff size={13} />} onClick={onWordDiff} />
            <Option checked={!ignoreWhitespaceChanges} label={ignoreWhitespaceChanges ? "Show white space" : "Hide white space"} icon={<Eye size={13} />} onClick={onWhitespace} />
            <div className="mx-1 my-1 border-t border-line" />
            <button type="button" disabled={!snapshot} className={`${MENU_ITEM} disabled:opacity-40`} onClick={() => { onCopyApply(); setMenu(null); }}><Clipboard size={13} />Copy git apply command</button>
          </AnchoredPopover> : null}
        </div>
        <Tooltip><TooltipTrigger asChild><button type="button" className={ICON} aria-label={allExpanded ? (singleFileMode ? "Collapse current diff" : "Collapse all diffs") : (singleFileMode ? "Expand current diff" : "Expand all diffs")} aria-disabled={!hasFiles} onClick={() => { if (hasFiles) onToggleAll(!allExpanded); }}>{allExpanded ? <ListCollapse size={15} /> : <ListTree size={15} />}</button></TooltipTrigger><TooltipContent>{fileActionHint ?? (allExpanded ? (singleFileMode ? "Collapse current diff" : "Collapse all diffs") : (singleFileMode ? "Expand current diff" : "Expand all diffs"))}</TooltipContent></Tooltip>
        <div className="shrink-0">
          <Tooltip><TooltipTrigger asChild><button ref={jumpRef} type="button" className={ICON} aria-label="Jump to file" aria-disabled={!hasFiles} onClick={() => { if (hasFiles) setMenu(menu === "jump" ? null : "jump"); }}><Search size={15} /></button></TooltipTrigger><TooltipContent>{fileActionHint ?? "Jump to file"}</TooltipContent></Tooltip>
          {menu === "jump" ? <AnchoredPopover anchorRef={jumpRef} popoverRef={popoverRef} className="w-[min(320px,calc(100vw-32px))] p-2">
            <input autoFocus className="h-8 w-full rounded-act-sm border border-line bg-surface px-2 text-[12px] text-text-main outline-none focus:border-focus-ring" value={jumpQuery} onChange={(event) => setJumpQuery(event.target.value)} placeholder="Jump to file…" />
            <div className="mt-1 max-h-[280px] overflow-auto">{jumpFiles.map((file) => <button key={file.id} type="button" className="flex min-h-8 w-full items-center rounded-act-sm px-2 text-left font-mono text-[11px] text-text-main hover:bg-surface-subtle" onClick={() => { onJump(file.id); setMenu(null); }}>{file.path}</button>)}</div>
          </AnchoredPopover> : null}
        </div>
        <Tooltip><TooltipTrigger asChild><button type="button" className={`${ICON} ${diffMode === "split" ? "bg-selected text-text-main" : ""}`} aria-label={diffMode === "split" ? "Switch to unified diff" : "Switch to split diff"} aria-pressed={diffMode === "split"} aria-disabled={!hasFiles || !splitAvailable} onClick={() => { if (hasFiles && splitAvailable) onDiffMode(diffMode === "split" ? "unified" : "split"); }}><Columns2 size={15} /></button></TooltipTrigger><TooltipContent>{splitHint}</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><button type="button" className={`${ICON} ${filesVisible ? "bg-selected text-text-main" : ""}`} aria-label={filesVisible ? "Hide files" : "Show files"} aria-pressed={filesVisible} aria-disabled={!hasFiles} onClick={() => { if (hasFiles) onToggleFiles(); }}><Folder size={15} /></button></TooltipTrigger><TooltipContent>{fileActionHint ?? (filesVisible ? "Hide files" : "Show files")}</TooltipContent></Tooltip>
        <div className="shrink-0">
          <button ref={gitRef} type="button" className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-act-sm border border-line bg-surface px-2 text-[12px] font-medium text-text-main hover:bg-surface-subtle" onClick={() => setMenu(menu === "git" ? null : "git")}><GitPullRequestArrow size={14} />Commit or push<ChevronDown size={12} /></button>
          {menu === "git" ? <AnchoredPopover anchorRef={gitRef} popoverRef={popoverRef} className="w-[190px] p-1.5"><button type="button" className={MENU_ITEM} onClick={() => { onCommitOrPush(); setMenu(null); }}>Commit or push</button><button type="button" className={MENU_ITEM} onClick={() => { onCreatePr(); setMenu(null); }}>Create PR</button></AnchoredPopover> : null}
        </div>
      </div>
      {snapshot?.comparison ? <div className="flex min-h-7 items-center gap-2 border-t border-line/70 px-3 text-[11px] text-text-faint"><span className="truncate">{snapshot.comparison.from}</span><span>→</span><span className="truncate">{snapshot.comparison.to}</span></div> : null}
    </div>
  );
}

function AnchoredPopover({ anchorRef, popoverRef, align = "end", className, children }: {
  anchorRef: RefObject<HTMLElement>;
  popoverRef: RefObject<HTMLDivElement>;
  align?: "start" | "end";
  className: string;
  children: React.ReactNode;
}) {
  const [position, setPosition] = useState({ left: 8, top: 8, ready: false });

  useLayoutEffect(() => {
    const update = () => {
      const anchor = anchorRef.current;
      const popover = popoverRef.current;
      if (!anchor || !popover) return;
      const anchorRect = anchor.getBoundingClientRect();
      const width = popover.offsetWidth;
      const height = popover.offsetHeight;
      const margin = 8;
      const gap = 6;
      const preferredLeft = align === "start" ? anchorRect.left : anchorRect.right - width;
      const left = Math.max(margin, Math.min(preferredLeft, window.innerWidth - width - margin));
      const below = anchorRect.bottom + gap;
      const above = anchorRect.top - height - gap;
      const top = below + height <= window.innerHeight - margin || above < margin ? below : above;
      setPosition({ left, top: Math.max(margin, top), ready: true });
    };
    const frame = window.requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [align, anchorRef, popoverRef]);

  return createPortal(
    <div
      ref={popoverRef}
      className={`${POPOVER} ${className}`}
      style={{ position: "fixed", left: position.left, top: position.top, visibility: position.ready ? "visible" : "hidden", maxWidth: "calc(100vw - 16px)" }}
    >
      {children}
    </div>,
    document.body,
  );
}

function Option({ checked, label, icon, onClick }: { checked: boolean; label: string; icon: React.ReactNode; onClick: () => void }) {
  return <button type="button" className={MENU_ITEM} role="menuitemcheckbox" aria-checked={checked} onClick={onClick}><span className="inline-flex h-4 w-4 items-center justify-center">{icon}</span><span className="flex-1">{label}</span>{checked ? <Check size={13} /> : null}</button>;
}
