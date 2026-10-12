import { ContextEntryText } from "./ContextEntryText";
import { useState } from "react";
import { Check, ChevronRight, Copy, Search } from "lucide-react";
import { formatApproxTokens, formatShare, formatSignedTokens } from "../../../context-format";
import { contextBucketLabel } from "../../../context-labels";
import { cn } from "../../ui/cn";
import { IconButton } from "../../ui/IconButton";
import { Select } from "../../ui/Select";
import type { CategoryEntry, ContextCategory, RemovedEntry } from "./context-panel-model";
import {
  DeltaBadge, FILTER_CHIP_CLASS, Gauge, INITIAL_ROW_LIMIT, ITEM_TITLE_CLASS, ITEM_TOKENS_CLASS, KIND_CHIP_CLASS, ROW_FOCUS_CLASS, ROW_LIMIT_STEP, ShowMoreButton,
} from "./ContextPanelParts";

type SortKey = "size" | "name";
const SORT_OPTIONS = [{ value: "size", label: "按大小" }, { value: "name", label: "按名称" }];
/** 超过这么多项才出现搜索和排序。 */
const FILTER_THRESHOLD = 3;

const ITEM_ROW_CLASS =
  "flex w-full items-center gap-[7px] rounded-act-sm border-0 bg-transparent px-1.5 py-[5px] text-left [cursor:pointer] hover:bg-hover-overlay";

/**
 * 非会话分类展开后的条目清单：超过 3 项时有搜索和排序，「工具」另有来源 chip。
 * 点条目展开预览（占比 + 预览原文 + 复制）；对比模式下已移除的条目以删除线排在末尾。
 */
export function ContextEntryList({ category, grandTotal }: { category: ContextCategory; grandTotal: number }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("size");
  const [source, setSource] = useState<string | null>(null);
  const [limit, setLimit] = useState(INITIAL_ROW_LIMIT);
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(() => new Set());
  const label = contextBucketLabel(category.key);
  const needle = query.trim().toLowerCase();
  const sources = category.key === "tools" ? countSources(category.entries) : [];

  const matched = category.entries
    .filter((entry) => (source === null || entry.source === source) && (!needle || `${entry.title} ${entry.source ?? ""}`.toLowerCase().includes(needle)))
    .sort(sort === "size" ? (a, b) => b.estimatedTokens - a.estimatedTokens : (a, b) => a.title.localeCompare(b.title));
  const removed = category.removed.filter((entry) => source === null && (!needle || removedTitle(entry).toLowerCase().includes(needle)));
  const rows: (CategoryEntry | RemovedEntry)[] = [...matched, ...removed];
  const shown = rows.slice(0, limit);

  const toggle = (key: string) => setOpenKeys((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  return (
    <div className="pb-1.5">
      {category.entries.length > FILTER_THRESHOLD ? (
        <div className="flex flex-wrap items-center gap-1.5 pb-1.5 pl-[31px] pr-3 pt-0.5">
          <label className="flex h-[30px] min-w-[120px] flex-1 items-center gap-1.5 rounded-act-sm border border-line bg-surface px-2 text-text-faint focus-within:border-focus-ring">
            <Search size={12} strokeWidth={2.4} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`筛选${label}`} aria-label={`筛选${label}`}
              className="min-w-0 flex-1 border-0 bg-transparent text-act-xs text-text-main outline-none placeholder:text-text-subtle" />
          </label>
          <Select value={sort} onValueChange={(value) => setSort(value as SortKey)} options={SORT_OPTIONS} ariaLabel={`${label}排序`} className="w-[92px]" />
          {sources.length > 1 ? (
            <div className="flex w-full flex-wrap gap-1">
              {sources.map(([name, count]) => (
                <button key={name} type="button" aria-pressed={source === name} className={cn(FILTER_CHIP_CLASS, ROW_FOCUS_CLASS)}
                  onClick={() => setSource(source === name ? null : name)}>
                  {name}<b className="ml-1 font-semibold opacity-70">{count}</b>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {shown.length === 0 ? <p className="py-1.5 pl-[31px] pr-3 text-act-xs text-text-faint">没有匹配的条目</p> : null}
      {shown.map((entry) => entry.removed === true
        ? <RemovedRow key={`removed:${entry.key}`} entry={entry} />
        : <EntryRow key={entry.key} entry={entry} category={category} grandTotal={grandTotal} open={openKeys.has(entry.key)} onToggle={() => toggle(entry.key)} />)}
      <ShowMoreButton hidden={rows.length - shown.length} total={rows.length} onClick={() => setLimit((value) => value + ROW_LIMIT_STEP)} />
    </div>
  );
}

function EntryRow({ entry, category, grandTotal, open, onToggle }: {
  entry: CategoryEntry;
  category: ContextCategory;
  grandTotal: number;
  open: boolean;
  onToggle: () => void;
}) {
  const share = category.totalTokens > 0 ? entry.estimatedTokens / category.totalTokens : 0;
  return (
    <div className={cn("ml-[23px] mr-2 rounded-act-sm", open && "bg-surface-subtle")}>
      <button type="button" aria-expanded={open} onClick={onToggle} className={cn(ITEM_ROW_CLASS, ROW_FOCUS_CLASS)}>
        <ChevronRight size={10} strokeWidth={2.5} aria-hidden="true"
          className={cn("shrink-0 text-text-faint transition-transform duration-(--motion-fast)", open && "rotate-90")} />
        {entry.source ? <span className={cn(KIND_CHIP_CLASS, "font-mono")}>{entry.source}</span> : null}
        <span className={ITEM_TITLE_CLASS} title={entry.title}>{entry.title}</span>
        {entry.isNew
          ? <DeltaBadge tone="new">新增</DeltaBadge>
          : entry.tokenDelta !== 0 ? <DeltaBadge tone={entry.tokenDelta > 0 ? "up" : "down"}>{formatSignedTokens(entry.tokenDelta)}</DeltaBadge> : null}
        <Gauge share={share} colorVar={category.colorVar} label={`占本类 ${formatShare(entry.estimatedTokens, category.totalTokens)}`} />
        <span className={ITEM_TOKENS_CLASS}>{formatApproxTokens(entry.estimatedTokens)}</span>
      </button>
      {open ? (
        <div className="pb-2 pl-[23px] pr-2">
          <div className="flex items-center gap-2 pb-1.5 text-act-xxs tabular-nums text-text-faint">
            <span className="min-w-0 flex-1 truncate">
              ≈{entry.estimatedTokens.toLocaleString("zh-CN")} tokens · 占本类 {formatShare(entry.estimatedTokens, category.totalTokens)} · 占全部 {formatShare(entry.estimatedTokens, grandTotal)}
            </span>
            {entry.preview ? <CopyButton text={entry.preview} /> : null}
          </div>
          {entry.fullTextAvailable ? <ContextEntryText key={entry.key} entryKey={entry.key} /> : null}
          {entry.preview ? (
            <pre className="m-0 max-h-[220px] overflow-auto whitespace-pre-wrap break-words rounded-act-sm border border-line bg-surface px-2.5 py-2 font-mono text-act-xxs leading-[1.55] text-text-main">
              {entry.preview}
            </pre>
          ) : (
            <p className="m-0 text-act-xs text-text-faint">这一条没有可预览的内容。</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function RemovedRow({ entry }: { entry: RemovedEntry }) {
  return (
    <div className="ml-[23px] mr-2 flex items-center gap-[7px] px-1.5 py-[5px] opacity-55">
      <span aria-hidden="true" className="w-2.5 shrink-0" />
      <span className={cn(ITEM_TITLE_CLASS, "line-through")} title={removedTitle(entry)}>{removedTitle(entry)}</span>
      <DeltaBadge tone="removed">已移除</DeltaBadge>
      <span className={ITEM_TOKENS_CLASS}>{formatApproxTokens(entry.estimatedTokens)}</span>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };
  return (
    <IconButton label={copied ? "已复制" : "复制预览"} size="xs" onClick={() => void copy()}>
      {copied ? <Check size={12} strokeWidth={2.2} /> : <Copy size={12} strokeWidth={2} />}
    </IconButton>
  );
}

/** 上次请求的清单不带标题，用 key 去掉类别前缀后的部分（如 `tool:notebook_edit` → `notebook_edit`）。 */
function removedTitle(entry: RemovedEntry): string {
  const index = entry.key.indexOf(":");
  return index >= 0 ? entry.key.slice(index + 1) : entry.key;
}

function countSources(entries: readonly CategoryEntry[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const entry of entries) if (entry.source) counts.set(entry.source, (counts.get(entry.source) ?? 0) + 1);
  return [...counts];
}
