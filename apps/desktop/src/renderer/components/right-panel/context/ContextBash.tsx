import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ContextPanelBashStats } from "@actspace/shared";
import { cn } from "../../ui/cn";
import { bashNotableRows, bashProgramCount, bashProgramRows, formatBashDuration, type BashCountRow, type BashNotableRow, type BashNotableTone, type BashProgramRow } from "./context-bash-model";
import { CARD_CLASS, CARD_HEAD_CLASS, CARD_META_CLASS, CARD_TITLE_CLASS, ROW_FOCUS_CLASS, ROW_LIMIT_STEP, ShowMoreButton, TRACK_CLASS, colorOf } from "./ContextPanelParts";

/** 程序分布首屏行数；之后每次「再显示」`ROW_LIMIT_STEP` 行。 */
const INITIAL_PROGRAM_ROWS = 8;
const BAR_COLOR = "--act-context-tools";

// 左内边距与表头「程序」一致（px-1.5），程序名左对齐；展开箭头放在程序名后面，不占名字前的位置。
const ROW_CLASS = "flex w-full items-center gap-2 rounded-act-sm px-1.5 py-1 text-left";
const NAME_CLASS = "flex w-[92px] shrink-0 items-center gap-1 font-mono text-act-xs";
const COUNT_CLASS = "w-[34px] shrink-0 text-right text-act-xs tabular-nums text-text-main";
const PERCENT_CLASS = "w-[34px] shrink-0 text-right text-act-xxs tabular-nums text-text-faint";
const FAILED_CLASS = "w-11 shrink-0 text-right text-act-xxs tabular-nums";

/** ⑥ Bash 命令：本会话 Bash 调用的次数、失败、耗时与程序分布。看具体某条命令去轨迹。 */
export function ContextBash({ stats }: { stats: ContextPanelBashStats }) {
  const rows = useMemo(() => bashProgramRows(stats), [stats]);
  const notable = useMemo(() => bashNotableRows(stats), [stats]);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [limit, setLimit] = useState(INITIAL_PROGRAM_ROWS);
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
          <div className="mx-3 mt-2 grid grid-cols-3 gap-px overflow-hidden rounded-act-md border border-line bg-line">
            <StatCell stat="calls" label="调用" value={String(stats.calls)} unit="次" />
            <StatCell stat="failed" label="失败" value={String(stats.failed)} unit="次" danger={stats.failed > 0} />
            <StatCell stat="duration" label="合计耗时" value={formatBashDuration(stats.durationMs)} />
          </div>
          {notable.length ? <NotableBlock rows={notable} /> : null}
          {rows.length ? (
            <div className="px-1.5 pb-2.5">
              <div className="flex items-center px-1.5 pb-0.5 pt-2.5 text-act-xxs text-text-faint">
                <span>程序</span>
                <span className="ml-auto">次数</span>
              </div>
              {rows.slice(0, limit).map((row) => (
                <ProgramRow key={row.key} row={row} open={open.has(row.key)} onToggle={() => toggle(row.key)} />
              ))}
              <ShowMoreButton hidden={rows.length - limit} total={rows.length} onClick={() => setLimit(limit + ROW_LIMIT_STEP)} />
            </div>
          ) : (
            <div className="pb-2.5" />
          )}
        </>
      )}
    </section>
  );
}

const NOTABLE_TONE_CLASS: Record<BashNotableTone, { dot: string; value: string }> = {
  slowest: { dot: "bg-warning", value: "text-warning" },
  failed: { dot: "bg-danger", value: "text-danger" },
  repeated: { dot: "bg-chart-series-3", value: "text-chart-series-3" },
  background: { dot: "bg-success", value: "text-success" },
};

/** 值得注意：最慢 / 失败最多 / 重复最多 / 后台任务，没有数据的行不显示。 */
function NotableBlock({ rows }: { rows: BashNotableRow[] }) {
  return (
    <div className="px-3 pt-2.5" data-bash-notable="">
      <div className="flex items-center gap-2 pb-1.5 text-act-xxs text-text-faint">
        <span>值得注意</span>
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((row) => {
          const tone = NOTABLE_TONE_CLASS[row.tone];
          return (
            <div key={row.tone} data-bash-notable-row={row.tone} className="flex items-center gap-2 rounded-act-sm bg-surface-subtle px-2 py-1 text-act-xs">
              <span className={cn("size-1.5 shrink-0 rounded-full", tone.dot)} aria-hidden="true" />
              <span className="w-[4em] shrink-0 text-text-muted">{row.label}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-text-main" title={row.text || undefined}>{row.text}</span>
              <span className={cn("shrink-0 tabular-nums", tone.value)}>{row.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCell({ stat, label, value, unit, danger }: { stat: string; label: string; value: string; unit?: string; danger?: boolean }) {
  return (
    <div className="bg-surface px-2.5 py-2">
      <div className="text-act-xxs text-text-faint">{label}</div>
      <div className={cn("mt-px text-act-md font-semibold tabular-nums", danger ? "text-danger" : "text-text-main")} data-bash-stat={stat}>
        {value}
        {unit ? <small className="ml-0.5 text-act-xxs font-normal text-text-faint">{unit}</small> : null}
      </div>
    </div>
  );
}

function ProgramRow({ row, open, onToggle }: { row: BashProgramRow; open: boolean; onToggle: () => void }) {
  const expandable = row.subcommands.length > 0;
  const cells = (
    <>
      <CountCells row={row} nameClass={row.other ? "text-text-muted" : "text-text-main"} chevron={expandable ? open : undefined} />
      <span className={PERCENT_CLASS}>{row.percent}%</span>
      <FailedCell failed={row.failed} />
    </>
  );
  if (!expandable) return <div className={ROW_CLASS} data-bash-program={row.label}>{cells}</div>;
  return (
    <div data-bash-program={row.label}>
      <button type="button" aria-expanded={open} onClick={onToggle}
        className={cn(ROW_CLASS, "border-0 [cursor:pointer]", ROW_FOCUS_CLASS, open ? "rounded-b-none bg-surface-subtle" : "bg-transparent hover:bg-hover-overlay")}>
        {cells}
      </button>
      {open ? (
        <div className="rounded-b-act-sm bg-surface-subtle pb-1.5 pl-5 pr-1.5 pt-0.5">
          {row.subcommands.map((sub) => (
            <div key={sub.key} className="flex items-center gap-2 py-0.5" data-bash-subcommand={sub.label}>
              <CountCells row={sub} nameClass="w-[72px] text-text-muted" faded />
              <span className={PERCENT_CLASS} />
              <FailedCell failed={sub.failed} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** `chevron` 不为 undefined 表示可展开，值是当前是否展开。 */
function CountCells({ row, nameClass, faded, chevron }: { row: BashCountRow; nameClass: string; faded?: boolean; chevron?: boolean }) {
  return (
    <>
      <span className={cn(NAME_CLASS, nameClass)} title={row.label}>
        <span className="min-w-0 truncate">{row.label}</span>
        {chevron === undefined ? null : (
          <ChevronRight size={12} strokeWidth={2} aria-hidden="true"
            className={cn("shrink-0 text-text-faint transition-transform motion-reduce:transition-none", chevron && "rotate-90")} />
        )}
      </span>
      <span className={cn("h-1 min-w-0 flex-1 overflow-hidden rounded-full", TRACK_CLASS)} aria-hidden="true">
        <i className={cn("block h-full rounded-full", faded && "opacity-60")} style={{ width: `${Math.max(4, Math.min(100, row.share * 100))}%`, background: colorOf(BAR_COLOR) }} />
      </span>
      <span className={COUNT_CLASS}>×{row.count}</span>
    </>
  );
}

function FailedCell({ failed }: { failed: number }) {
  return <span className={cn(FAILED_CLASS, failed > 0 ? "text-danger" : "text-text-faint")}>{failed > 0 ? `${failed} 失败` : ""}</span>;
}
