import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Virtualizer } from "@tanstack/react-virtual";
import { Check, ChevronDown, ChevronRight, ListPlus, ListTree, RotateCcw, Undo2 } from "lucide-react";
import type {
  ReviewCapabilities,
  ReviewFileContents,
  ReviewFileDiff,
  ReviewFileSummary,
  ReviewHunk,
  ReviewLine,
  ReviewMutation,
} from "@actspace/shared";
import type { ReviewDiffMode, ReviewFileRequestState } from "./review-store";

type DiffRow =
  | { key: string; kind: "file"; file: ReviewFileSummary }
  | { key: string; kind: "hunk"; file: ReviewFileSummary; hunk: ReviewHunk }
  | { key: string; kind: "line"; file: ReviewFileSummary; line: ReviewLine; side: "old" | "new" }
  | { key: string; kind: "split-line"; file: ReviewFileSummary; oldLine?: ReviewLine; newLine?: ReviewLine }
  | { key: string; kind: "state"; file: ReviewFileSummary; state: "loading" | "failed" | "empty" | "binary" | "image"; message?: string };

const UNIFIED_DIFF_GUTTER_COLUMNS = 16;
const SPLIT_DIFF_GUTTER_COLUMNS = UNIFIED_DIFF_GUTTER_COLUMNS * 2;
const MAX_STABLE_DIFF_COLUMNS = 480;

export function ReviewDiffCanvas({ workspaceRoot, files, diffs, fileRequests, fileContents, capabilities, expandedFileIds, selectedFileId, mode, wrap, wordDiff, richPreview, loadFullFiles, singleFileMode, onToggleFile, onSelectFile, onExpandContext, onRetryDiff, onVisibleFiles, onViewed, onMutation }: {
  workspaceRoot?: string;
  files: ReviewFileSummary[];
  diffs: Map<string, ReviewFileDiff>;
  fileRequests: Map<string, ReviewFileRequestState>;
  fileContents: Map<string, ReviewFileContents>;
  capabilities: ReviewCapabilities;
  expandedFileIds: Set<string>;
  selectedFileId: string | null;
  mode: ReviewDiffMode;
  wrap: boolean;
  wordDiff: boolean;
  richPreview: boolean;
  loadFullFiles: boolean;
  singleFileMode: boolean;
  onToggleFile: (fileId: string) => void;
  onSelectFile: (fileId: string) => void;
  onExpandContext: (fileId: string) => void;
  onRetryDiff: (fileId: string) => void;
  onVisibleFiles: (fileIds: string[]) => void;
  onViewed: (fileId: string, viewed: boolean) => void;
  onMutation: (mutation: Omit<ReviewMutation, "snapshotId" | "expectedGeneration">) => void;
}) {
  const parentRef = useRef<HTMLElement>(null);
  const visibleSignature = useRef("");
  const rows = useMemo(() => buildRows(files, diffs, fileRequests, fileContents, expandedFileIds, mode, loadFullFiles, richPreview), [diffs, expandedFileIds, fileContents, fileRequests, files, loadFullFiles, mode, richPreview]);
  const canvasColumns = useMemo(() => estimateCanvasColumns(rows), [rows]);
  const fileIndexes = useMemo(() => {
    const indexes = new Map<string, number>();
    rows.forEach((row, index) => { if (row.kind === "file") indexes.set(row.file.id, index); });
    return indexes;
  }, [rows]);
  const getItemKey = useCallback((index: number) => rows[index]?.key ?? index, [rows]);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    getItemKey,
    estimateSize: (index) => estimateRowSize(rows[index], wrap),
    initialRect: { width: 600, height: 800 },
    observeElementRect: observeReviewElementRect,
    overscan: 18,
    useFlushSync: false,
  });

  useEffect(() => virtualizer.measure(), [mode, rows, virtualizer, wrap]);
  useEffect(() => {
    if (!selectedFileId || singleFileMode) return;
    const index = fileIndexes.get(selectedFileId);
    if (index !== undefined) virtualizer.scrollToIndex(index, { align: "start" });
  }, [fileIndexes, selectedFileId, singleFileMode, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();
  useEffect(() => {
    const ids = [...new Set(virtualItems.map((item) => rows[item.index]?.file.id).filter(Boolean))] as string[];
    const signature = `${loadFullFiles ? "full" : "patch"}\0${ids.join("\0")}`;
    if (signature === visibleSignature.current) return;
    visibleSignature.current = signature;
    onVisibleFiles(ids);
  }, [loadFullFiles, onVisibleFiles, rows, virtualItems]);

  const footerHeight = singleFileMode ? 34 : 0;
  const canvasWidth = wrap ? "100%" : `max(100%, ${canvasColumns}ch)`;
  return (
    <main ref={parentRef} className="min-h-0 min-w-0 flex-1 overflow-auto bg-surface" aria-label="Review diff canvas" data-review-horizontal-scroll="canvas">
      <div className="relative min-w-full" style={{ height: virtualizer.getTotalSize() + footerHeight, width: canvasWidth }} data-review-content-width={canvasWidth} data-review-total-row-count={rows.length} data-review-virtual-row-count={virtualItems.length}>
        {virtualItems.map((item) => {
          const row = rows[item.index];
          if (!row) return null;
          return (
            <div
              key={row.key}
              ref={virtualizer.measureElement}
              data-index={item.index}
              data-review-row={row.kind}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${item.start}px)` }}
            >
              <RowView
                row={row}
                workspaceRoot={workspaceRoot}
                capabilities={capabilities}
                selected={selectedFileId === row.file.id}
                expanded={expandedFileIds.has(row.file.id)}
                wrap={wrap}
                wordDiff={wordDiff}
                richPreview={richPreview}
                loadFullFiles={loadFullFiles}
                onToggle={() => onToggleFile(row.file.id)}
                onSelect={() => onSelectFile(row.file.id)}
                onExpandContext={() => onExpandContext(row.file.id)}
                onRetry={() => onRetryDiff(row.file.id)}
                onViewed={() => onViewed(row.file.id, !row.file.viewed)}
                onMutation={onMutation}
              />
            </div>
          );
        })}
        {singleFileMode ? (
          <div className="absolute inset-x-0 flex h-[34px] items-center gap-2 border-t border-line bg-surface px-3 text-[11px] text-text-faint" style={{ top: virtualizer.getTotalSize() }}>
            <span aria-hidden="true">ⓘ</span><span>This diff is large, showing one file at a time</span>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function observeReviewElementRect(instance: Virtualizer<HTMLElement, Element>, callback: (rect: { width: number; height: number }) => void): (() => void) | undefined {
  const element = instance.scrollElement;
  if (!element) return undefined;
  const publish = () => {
    const bounds = element.getBoundingClientRect();
    callback({
      width: Math.round(element.clientWidth || bounds.width || 600),
      height: Math.round(element.clientHeight || bounds.height || 800),
    });
  };
  publish();
  if (typeof ResizeObserver === "undefined") return undefined;
  const observer = new ResizeObserver(publish);
  observer.observe(element);
  return () => observer.disconnect();
}

function RowView({ row, workspaceRoot, capabilities, selected, expanded, wrap, wordDiff, richPreview, loadFullFiles, onToggle, onSelect, onExpandContext, onRetry, onViewed, onMutation }: {
  row: DiffRow;
  workspaceRoot?: string;
  capabilities: ReviewCapabilities;
  selected: boolean;
  expanded: boolean;
  wrap: boolean;
  wordDiff: boolean;
  richPreview: boolean;
  loadFullFiles: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onExpandContext: () => void;
  onRetry: () => void;
  onViewed: () => void;
  onMutation: (mutation: Omit<ReviewMutation, "snapshotId" | "expectedGeneration">) => void;
}) {
  if (row.kind === "file") {
    const file = row.file;
    return (
      <div className={`flex min-h-10 items-center gap-2 border-b border-line bg-surface-raised px-3 ${selected ? "ring-1 ring-inset ring-focus-ring/40" : ""}`} onFocus={onSelect}>
        <button type="button" className="inline-flex h-6 w-6 items-center justify-center rounded-act-sm text-text-faint hover:bg-surface-subtle" onClick={onToggle} aria-label={`${expanded ? "Collapse" : "Expand"} ${file.path}`}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button type="button" className="min-w-0 flex-1 truncate text-left font-mono text-[12px] font-medium text-text-main" onClick={onSelect} title={file.path}>{file.path}</button>
        {file.additions > 0 || file.deletions > 0 ? <span className="text-[11px] tabular-nums">{file.additions > 0 ? <span className="text-success">+{file.additions}</span> : null}{file.additions > 0 && file.deletions > 0 ? " " : null}{file.deletions > 0 ? <span className="text-danger">-{file.deletions}</span> : null}</span> : null}
        <button type="button" className={`inline-flex h-6 w-6 items-center justify-center rounded-act-sm hover:bg-surface-subtle ${file.viewed ? "text-success" : "text-text-faint"}`} onClick={onViewed} aria-label={`${file.viewed ? "Mark unviewed" : "Mark viewed"} ${file.path}`}><Check size={14} /></button>
        <FileActions file={file} capabilities={capabilities} canExpandContext={Boolean(!loadFullFiles && expanded && capabilities.canLoadFullFile && file.renderKind === "text")} onExpandContext={onExpandContext} onMutation={onMutation} />
      </div>
    );
  }
  if (row.kind === "hunk") return <HunkHeader file={row.file} hunk={row.hunk} capabilities={capabilities} onMutation={onMutation} />;
  if (row.kind === "line") return <DiffLine line={row.line} side={row.side} wrap={wrap} wordDiff={wordDiff} />;
  if (row.kind === "split-line") return <SplitDiffLine oldLine={row.oldLine} newLine={row.newLine} wrap={wrap} wordDiff={wordDiff} />;
  if (row.state === "image" && richPreview) return <ReviewImageDiff workspaceRoot={workspaceRoot} file={row.file} />;
  const message = row.state === "loading" ? "Loading structured diff…"
    : row.state === "binary" ? "Binary file changed. Text diff is unavailable."
      : row.state === "image" ? "Image changed. Enable rich preview to inspect the current image."
        : row.state === "empty" ? "No textual diff available."
          : row.message ?? "Diff failed to load.";
  return <div className="flex min-h-16 items-center gap-3 border-b border-line px-12 py-4 text-[12px] text-text-faint"><span className="min-w-0 flex-1">{message}</span>{row.state === "failed" ? <button type="button" className="h-7 rounded-act-sm border border-line px-2 text-[11px] text-text-main hover:bg-surface-subtle" onClick={onRetry}>Retry</button> : null}</div>;
}

function buildRows(files: ReviewFileSummary[], diffs: Map<string, ReviewFileDiff>, requests: Map<string, ReviewFileRequestState>, contents: Map<string, ReviewFileContents>, expandedIds: Set<string>, mode: ReviewDiffMode, loadFullFiles: boolean, richPreview: boolean): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const file of files) {
    rows.push({ key: `file:${file.id}`, kind: "file", file });
    if (!expandedIds.has(file.id)) continue;
    if (file.renderKind === "binary") { rows.push({ key: `state:${file.id}:binary`, kind: "state", file, state: "binary" }); continue; }
    if (file.renderKind === "image") { rows.push({ key: `state:${file.id}:image:${richPreview}`, kind: "state", file, state: "image" }); continue; }
    const request = requests.get(file.id);
    if (request?.status === "failed") { rows.push({ key: `state:${file.id}:failed`, kind: "state", file, state: "failed", message: request.error }); continue; }
    const diff = diffs.get(file.id);
    if (!diff) { rows.push({ key: `state:${file.id}:loading`, kind: "state", file, state: "loading" }); continue; }
    if (diff.hunks.length === 0) { rows.push({ key: `state:${file.id}:empty`, kind: "state", file, state: "empty" }); continue; }
    const fullContext = loadFullFiles ? contextBeforeHunks(diff, contents.get(file.id)) : new Map<number, ReviewLine[]>();
    for (let hunkIndex = 0; hunkIndex < diff.hunks.length; hunkIndex += 1) {
      const hunk = diff.hunks[hunkIndex];
      const context = fullContext.get(hunkIndex) ?? [];
      appendLineRows(rows, file, context, mode, `full:${hunkIndex}`);
      rows.push({ key: `hunk:${file.id}:${hunk.id}`, kind: "hunk", file, hunk });
      appendLineRows(rows, file, hunk.lines, mode, hunk.id);
    }
    appendLineRows(rows, file, fullContext.get(diff.hunks.length) ?? [], mode, "full:tail");
  }
  return rows;
}

function appendLineRows(rows: DiffRow[], file: ReviewFileSummary, lines: ReviewLine[], mode: ReviewDiffMode, groupKey: string): void {
  if (mode === "unified") {
    for (const line of lines) rows.push({ key: `line:${file.id}:${groupKey}:${line.id}`, kind: "line", file, line, side: line.kind === "deletion" ? "old" : "new" });
    return;
  }
  const oldLines = lines.filter((line) => line.kind !== "addition");
  const newLines = lines.filter((line) => line.kind !== "deletion");
  for (let index = 0; index < Math.max(oldLines.length, newLines.length); index += 1) {
    rows.push({ key: `split:${file.id}:${groupKey}:${index}:${oldLines[index]?.id ?? ""}:${newLines[index]?.id ?? ""}`, kind: "split-line", file, oldLine: oldLines[index], newLine: newLines[index] });
  }
}

function contextBeforeHunks(diff: ReviewFileDiff, contents?: ReviewFileContents): Map<number, ReviewLine[]> {
  const result = new Map<number, ReviewLine[]>();
  if (!contents?.target.available || contents.target.text === undefined) return result;
  const targetLines = contents.target.text.split(/\r?\n/);
  if (targetLines.at(-1) === "") targetLines.pop();
  let oldCursor = 1;
  let newCursor = 1;
  for (let index = 0; index < diff.hunks.length; index += 1) {
    const hunk = diff.hunks[index];
    const count = Math.max(0, Math.min(hunk.oldStart - oldCursor, hunk.newStart - newCursor));
    result.set(index, Array.from({ length: count }, (_, offset) => ({
      id: `full-${oldCursor + offset}-${newCursor + offset}`,
      kind: "context" as const,
      oldLine: oldCursor + offset,
      newLine: newCursor + offset,
      text: targetLines[newCursor + offset - 1] ?? "",
    })));
    oldCursor = hunk.oldStart + hunk.oldLines;
    newCursor = hunk.newStart + hunk.newLines;
  }
  const tailCount = Math.max(0, targetLines.length - newCursor + 1);
  result.set(diff.hunks.length, Array.from({ length: tailCount }, (_, offset) => ({
    id: `full-tail-${oldCursor + offset}-${newCursor + offset}`,
    kind: "context" as const,
    oldLine: oldCursor + offset,
    newLine: newCursor + offset,
    text: targetLines[newCursor + offset - 1] ?? "",
  })));
  return result;
}

function estimateRowSize(row: DiffRow | undefined, wrap: boolean): number {
  if (!row) return 24;
  if (row.kind === "file") return 40;
  if (row.kind === "hunk") return 32;
  if (row.kind === "state") return row.state === "image" ? 240 : 64;
  return wrap ? 42 : 22;
}

function estimateCanvasColumns(rows: DiffRow[]): number {
  let columns = 0;
  for (const row of rows) {
    if (row.kind === "line") {
      columns = Math.max(columns, textColumns(row.line.text) + UNIFIED_DIFF_GUTTER_COLUMNS);
      continue;
    }
    if (row.kind === "split-line") {
      const sideColumns = Math.max(textColumns(row.oldLine?.text ?? ""), textColumns(row.newLine?.text ?? ""));
      columns = Math.max(columns, sideColumns * 2 + SPLIT_DIFF_GUTTER_COLUMNS);
    }
  }
  return Math.min(columns, MAX_STABLE_DIFF_COLUMNS);
}

function textColumns(text: string): number {
  let columns = 0;
  for (const character of text) {
    if (character === "\t") {
      columns += 4 - (columns % 4);
      continue;
    }
    columns += character.codePointAt(0)! > 0xff ? 2 : 1;
  }
  return columns;
}

function ReviewImageDiff({ workspaceRoot, file }: { workspaceRoot?: string; file: ReviewFileSummary }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (file.status === "deleted" || !window.actspace?.readWorkspaceFile) return;
    void window.actspace.readWorkspaceFile({ workspaceRoot, relativePath: file.path }).then((result) => {
      if (!active) return;
      if (result.error || !result.dataUrl) setError("Current image preview is unavailable.");
      else setSrc(result.dataUrl);
    });
    return () => { active = false; };
  }, [file.path, file.status, workspaceRoot]);
  if (file.status === "deleted") return <div className="px-12 py-5 text-[12px] text-text-muted">Image was deleted. The previous revision is not loaded into the renderer.</div>;
  if (error) return <div className="px-12 py-5 text-[12px] text-text-muted">{error}</div>;
  if (!src) return <div className="px-12 py-5 text-[12px] text-text-faint">Loading image preview…</div>;
  return <div className="grid min-h-40 place-items-center bg-surface-subtle p-4"><img src={src} alt={`Current ${file.path}`} className="max-h-[520px] max-w-full rounded-act-sm border border-line bg-surface object-contain" /></div>;
}

function FileActions({ file, capabilities, canExpandContext, onExpandContext, onMutation }: { file: ReviewFileSummary; capabilities: ReviewCapabilities; canExpandContext: boolean; onExpandContext: () => void; onMutation: (mutation: Omit<ReviewMutation, "snapshotId" | "expectedGeneration">) => void }) {
  const source = file.source === "index" ? "index" : "workingTree";
  return <div className="flex items-center gap-0.5">
    {canExpandContext ? <button type="button" title="Load more context" aria-label={`Load more context for ${file.path}`} className="inline-flex h-6 w-6 items-center justify-center rounded-act-sm text-text-faint hover:bg-surface-subtle hover:text-text-main" onClick={onExpandContext}><ListTree size={13} /></button> : null}
    {capabilities.canStageFile ? <button type="button" title="Stage file" aria-label={`Stage ${file.path}`} className="inline-flex h-6 w-6 items-center justify-center rounded-act-sm text-text-faint hover:bg-surface-subtle hover:text-text-main" onClick={() => onMutation({ action: "stage", scope: "file", source, path: file.path })}><ListPlus size={13} /></button> : null}
    {capabilities.canUnstageFile ? <button type="button" title="Unstage file" aria-label={`Unstage ${file.path}`} className="inline-flex h-6 w-6 items-center justify-center rounded-act-sm text-text-faint hover:bg-surface-subtle hover:text-text-main" onClick={() => onMutation({ action: "unstage", scope: "file", source, path: file.path })}><Undo2 size={13} /></button> : null}
    {capabilities.canRevertFile ? <button type="button" title="Revert file" aria-label={`Revert ${file.path}`} className="inline-flex h-6 w-6 items-center justify-center rounded-act-sm text-text-faint hover:bg-danger-soft hover:text-danger" onClick={() => { if (window.confirm(`Revert ${file.path}? Untracked files are moved to Trash.`)) onMutation({ action: "revert", scope: "file", source, path: file.path }); }}><RotateCcw size={13} /></button> : null}
  </div>;
}

function HunkHeader({ file, hunk, capabilities, onMutation }: { file: ReviewFileSummary; hunk: ReviewHunk; capabilities: ReviewCapabilities; onMutation: (mutation: Omit<ReviewMutation, "snapshotId" | "expectedGeneration">) => void }) {
  const source = file.source === "index" ? "index" : "workingTree";
  return <div className="flex min-h-8 items-center gap-2 border-b border-line bg-info-soft px-3 font-mono text-[11px] text-info"><span className="min-w-0 flex-1 truncate">{hunk.header}</span>{capabilities.canStageHunk ? <button type="button" className="rounded-act-sm px-2 py-1 font-sans text-[11px] text-text-muted hover:bg-surface hover:text-text-main" onClick={() => onMutation({ action: "stage", scope: "hunk", source, path: file.path, hunkId: hunk.id, patchFingerprint: hunk.patchFingerprint })}>Stage hunk</button> : null}{capabilities.canUnstageHunk ? <button type="button" className="rounded-act-sm px-2 py-1 font-sans text-[11px] text-text-muted hover:bg-surface hover:text-text-main" onClick={() => onMutation({ action: "unstage", scope: "hunk", source, path: file.path, hunkId: hunk.id, patchFingerprint: hunk.patchFingerprint })}>Unstage hunk</button> : null}</div>;
}

function SplitDiffLine({ oldLine, newLine, wrap, wordDiff }: { oldLine?: ReviewLine; newLine?: ReviewLine; wrap: boolean; wordDiff: boolean }) {
  return <div className="grid grid-cols-2 divide-x divide-line border-b border-line/60"><DiffLine line={oldLine} side="old" wrap={wrap} wordDiff={wordDiff} /><DiffLine line={newLine} side="new" wrap={wrap} wordDiff={wordDiff} /></div>;
}

function DiffLine({ line, side, wrap, wordDiff }: { line?: ReviewLine; side: "old" | "new"; wrap: boolean; wordDiff: boolean }) {
  const number = side === "old" ? line?.oldLine : line?.newLine;
  const tone = line?.kind === "addition" ? "bg-success-soft" : line?.kind === "deletion" ? "bg-danger-soft" : "bg-surface";
  return <div className={`${tone} min-w-0`}><div className="grid min-h-[22px] grid-cols-[42px_22px_minmax(0,1fr)] font-mono text-[11px] leading-[22px]"><span className="select-none border-r border-line/70 pr-2 text-right tabular-nums text-text-faint">{number ?? ""}</span><span className="select-none text-center text-text-faint">{line?.kind === "addition" ? "+" : line?.kind === "deletion" ? "−" : ""}</span><code className={`${wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"} block min-w-0 pr-8 text-text-main`}>{line && wordDiff && line.wordDiffs?.length ? line.wordDiffs.map((part, index) => <span key={index} className={part.kind === "addition" ? "rounded-[2px] bg-success/20" : part.kind === "deletion" ? "rounded-[2px] bg-danger/20" : ""}>{part.text}</span>) : line?.text || " "}</code></div></div>;
}
