import { Check, FileCode2, Search, X } from "lucide-react";
import type { ReviewFileSummary } from "@actspace/shared";

const STATUS_COLOR: Record<ReviewFileSummary["status"], string> = {
  added: "text-success",
  modified: "text-warning",
  deleted: "text-danger",
  renamed: "text-info",
  copied: "text-info",
  typeChanged: "text-warning",
};

export function ReviewFileTree({ files, selectedFileId, filter, onFilter, onSelect, onViewed, onClose }: {
  files: ReviewFileSummary[];
  selectedFileId: string | null;
  filter: string;
  onFilter: (filter: string) => void;
  onSelect: (fileId: string) => void;
  onViewed: (fileId: string, viewed: boolean) => void;
  onClose?: () => void;
}) {
  const filtered = files.filter((file) => file.path.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-surface-raised" aria-label="Changed files">
      <div className="flex items-center gap-1 border-b border-line p-2">
        <div className="relative min-w-0 flex-1">
        <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-faint" />
        <input className="h-8 w-full rounded-act-sm border border-line bg-surface pl-7 pr-2 text-[12px] text-text-main outline-none placeholder:text-text-faint focus:border-focus-ring" value={filter} onChange={(event) => onFilter(event.target.value)} placeholder="Filter files…" aria-label="Filter Review files" />
        </div>
        {onClose ? <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-act-sm text-text-faint hover:bg-surface-subtle hover:text-text-main" aria-label="Hide files" onClick={onClose}><X size={15} /></button> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1 pb-2" role="tree">
        {filtered.map((file) => (
          <div key={file.id} className={`group flex min-h-8 items-center gap-2 rounded-act-sm px-2 ${selectedFileId === file.id ? "bg-selected" : "hover:bg-surface-subtle"}`} role="treeitem" aria-selected={selectedFileId === file.id}>
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onSelect(file.id)} title={file.path}>
              <FileCode2 size={14} className={STATUS_COLOR[file.status]} />
              <span className={`min-w-0 flex-1 truncate font-mono text-[11px] ${file.viewed ? "text-text-faint" : "text-text-main"}`}>{file.path}</span>
              {file.additions > 0 || file.deletions > 0 ? <span className="shrink-0 text-[10px] tabular-nums">{file.additions > 0 ? <span className="text-success">+{file.additions}</span> : null}{file.additions > 0 && file.deletions > 0 ? " " : null}{file.deletions > 0 ? <span className="text-danger">-{file.deletions}</span> : null}</span> : null}
            </button>
            <button type="button" className={`inline-flex h-5 w-5 items-center justify-center rounded-act-sm ${file.viewed ? "text-success" : "text-text-faint opacity-0 group-hover:opacity-100 focus:opacity-100"}`} aria-label={`${file.viewed ? "Mark unviewed" : "Mark viewed"} ${file.path}`} onClick={() => onViewed(file.id, !file.viewed)}>
              <Check size={13} />
            </button>
          </div>
        ))}
        {filtered.length === 0 ? <div className="px-3 py-6 text-center text-[12px] text-text-faint">No matching files.</div> : null}
      </div>
    </aside>
  );
}
