import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ContextPanelBashStats } from "@actspace/shared";
import { cn } from "../../ui/cn";
import { bashNotableRows, bashProgramCount, bashProgramRows, formatBashDuration, type BashCountRow, type BashNotableRow, type BashNotableTone, type BashProgramRow } from "./context-bash-model";
import { CARD_CLASS, CARD_HEAD_CLASS, CARD_META_CLASS, CARD_TITLE_CLASS, FILTER_CHIP_CLASS, ROW_FOCUS_CLASS, ROW_LIMIT_STEP, ShowMoreButton, TRACK_CLASS, colorOf } from "./ContextPanelParts";

/** 程序分布首屏行数；之后每次「再显示」`ROW_LIMIT_STEP` 行。 */
const INITIAL_PROGRAM_ROWS = 8;
const BAR_COLOR = "--act-context-tools";

const SECTION_CLASS = "px-3 pb-1 pt-3 text-act-xxs text-text-faint";
const PROGRAM_ROW_CLASS = "mx-1.5 flex w-[calc(100%-12px)] items-center gap-2 rounded-act-sm px-1.5 py-1 text-left text-act-xs";
const COUNT_CLASS = "w-7 shrink-0 text-right tabular-nums text-text-main";
const FAILED_CLASS = "shrink-0 text-act-xxs tabular-nums text-danger";

/**
 * ⑥ Bash 命令（规范 §5.1）：一行总览、值得注意、按程序。
 * 可展开的程序只展开到子命令；看具体某条命令去轨迹。
 */
export function ContextBash({ stats }: { stats: ContextPanelBashStats }) {
  const rows = useMemo(() => bashProgramRows(stats), [stats]);
  const notable = useMemo(() => bashNotableRows(stats), [stats]);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [limit, setLimit] = useState(INITIAL_PROGRAM_ROWS);
  const [failedOnly, setFailedOnly] = useState(false);
  const hasFailed = rows.some((row) => row.failed > 0);
  const shownRows = failedOnly && hasFailed ? rows.filter((row) => row.failed > 0) : rows;
  const toggle = (key: string) => setOpen((current) => {
    const next = new Set(current);
    if (!next.delete(key)) next.add(key);
    return next;
  });

  const empty = stats.calls === 0;
  return (
    <section className={CARD_CLASS} aria-label="Bash 命令" data-context-bash="">
      <div className={CARD_HEAD_CLASS}>
        <span className={CARD_TITLE_CLASS}>Bash 命令</span>
        {empty ? null : <span className={cn(CARD_META_CLASS, "tabular-nums")}>{bashProgramCount(stats)} 个程序</span>}
      </div>
      {empty ? (
        <p className="m-0 px-3 pb-3.5 pt-2 text-act-xs text-text-faint">本会话还没有调用过 Bash。</p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 px-3 pt-1.5 text-act-xs text-text-muted" data-bash-summary="">
            <SummaryValue stat="calls" value={String(stats.calls)} unit="次调用" />
            <SummaryValue stat="failed" value={String(stats.failed)} unit="次失败" danger={stats.failed > 0} />
            <SummaryValue stat="duration" value={formatBashDuration(stats.durationMs)} unit="合计" />
          </div>
          {notable.length ? <NotableBlock rows={notable} /> : null}
          {rows.length ? (
            <div className="pb-2.5">
              <div className="flex items-center gap-1.5 px-3 pb-1 pt-3">
                <span className="text-act-xxs text-text-faint">按程序</span>
                {hasFailed ? (
                  <button type="button" aria-pressed={failedOnly} onClick={() => setFailedOnly(!failedOnly)} className={cn(FILTER_CHIP_CLASS, ROW_FOCUS_CLASS, "ml-auto")}>
                    只看失败
                  </button>
                ) : null}
              </div>
              {shownRows.slice(0, limit).map((row) => (
                <ProgramRow key={row.key} row={row} open={open.has(row.key)} onToggle={() => toggle(row.key)} />
              ))}
              <ShowMoreButton hidden={shownRows.length - limit} total={shownRows.length} onClick={() => setLimit(limit + ROW_LIMIT_STEP)} />
            </div>
          ) : (
            <div className="pb-2.5" />
          )}
        </>
      )}
    </section>
  );
}

function SummaryValue({ stat, value, unit, danger }: { stat: string; value: string; unit: string; danger?: boolean }) {
  return (
    <span>
      <b className={cn("mr-[3px] text-act-lg font-semibold tabular-nums", danger ? "text-danger" : "text-text-main")} data-bash-stat={stat}>{value}</b>
      {unit}
    </span>
  );
}

const NOTABLE_VALUE_CLASS: Record<BashNotableTone, string> = {
  slowest: "text-warning",
  failed: "text-danger",
  repeated: "text-chart-series-3",
  background: "text-success",
};

/** 值得注意：最慢 / 失败最多 / 重复最多 / 后台任务，没有数据的行不显示；不加底色和圆点。 */
function NotableBlock({ rows }: { rows: BashNotableRow[] }) {
  return (
    <div data-bash-notable="">
      <div className={SECTION_CLASS}>值得注意</div>
      {rows.map((row) => (
        <div key={row.tone} data-bash-notable-row={row.tone} className="flex items-baseline gap-2.5 px-3 py-[3px] text-act-xs">
          <span className="w-[4.2em] shrink-0 text-text-faint">{row.label}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-text-main" title={row.text || undefined}>{row.text}</span>
          <span className={cn("shrink-0 tabular-nums", NOTABLE_VALUE_CLASS[row.tone])}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function ProgramRow({ row, open, onToggle }: { row: BashProgramRow; open: boolean; onToggle: () => void }) {
  const expandable = row.subcommands.length > 0;
  const cells = (
    <>
      <span className="flex w-2.5 shrink-0 justify-center text-text-faint" aria-hidden="true">
        {expandable ? <ChevronRight size={11} className={cn("transition-transform duration-(--motion-fast) motion-reduce:transition-none", open && "rotate-90")} /> : null}
      </span>
      <span className={cn("min-w-16 max-w-[45%] shrink-0 truncate font-mono", row.other ? "text-text-muted" : "text-text-main")} title={row.label}>{row.label}</span>
      <span className="min-w-0 flex-1 truncate text-act-xxs text-text-faint" title={open ? undefined : row.summary || undefined}>{open ? "" : row.summary}</span>
      {row.failed > 0 ? <span className={FAILED_CLASS}>{row.failed} 失败</span> : null}
      <span className={COUNT_CLASS}>{row.count}</span>
    </>
  );
  if (!expandable) return <div className={PROGRAM_ROW_CLASS} data-bash-program={row.label}>{cells}</div>;
  return (
    <div data-bash-program={row.label}>
      <button type="button" aria-expanded={open} onClick={onToggle}
        className={cn(PROGRAM_ROW_CLASS, "border-0 [cursor:pointer]", ROW_FOCUS_CLASS, open ? "rounded-b-none bg-surface-subtle" : "bg-transparent hover:bg-hover-overlay")}>
        {cells}
      </button>
      {open ? (
        <div className="mx-1.5 mb-1 rounded-b-act-sm bg-surface-subtle pb-1.5 pt-0.5">
          {row.subcommands.map((sub) => <SubcommandRow key={sub.key} row={sub} />)}
        </div>
      ) : null}
    </div>
  );
}

/** 子命令：名字、细条形（占所属程序的比例）、失败、次数；左侧一条竖线表示从属。 */
function SubcommandRow({ row }: { row: BashCountRow }) {
  return (
    <div className="relative flex items-center gap-2 py-[3px] pl-6 pr-1.5 text-act-xs before:absolute before:inset-y-0 before:left-3.5 before:border-l before:border-line" data-bash-subcommand={row.label}>
      <span className="min-w-[52px] max-w-[40%] shrink-0 truncate font-mono text-text-muted" title={row.label}>{row.label}</span>
      <span className={cn("h-[3px] min-w-0 flex-1 overflow-hidden rounded-full", TRACK_CLASS)} aria-hidden="true">
        <i className="block h-full rounded-full opacity-70" style={{ width: `${Math.max(4, Math.min(100, row.share * 100))}%`, background: colorOf(BAR_COLOR) }} />
      </span>
      {row.failed > 0 ? <span className={FAILED_CLASS}>{row.failed} 失败</span> : null}
      <span className="w-6 shrink-0 text-right tabular-nums text-text-main">{row.count}</span>
    </div>
  );
}
