import { useMemo, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { PlainButton } from "../ui/PlainButton";
import { cn } from "../ui/cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";
import { DASH } from "./harness-stats-format";

/* 页面里反复用到的小块：指标卡、卡片、键值列表、小节标题、计量条、标签、可排序表格。 */

export function Metric({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-act-group border border-line bg-surface px-3.5 py-3">
      <div className="text-act-xs text-text-muted">{label}</div>
      <div className="mb-0.5 mt-1 break-words text-act-xl font-semibold leading-tight tracking-tight tabular-nums text-text-main">{value}</div>
      {detail ? <div className="text-act-xxs leading-relaxed text-text-faint">{detail}</div> : null}
    </div>
  );
}

export function MetricGrid({ children, label }: { children: ReactNode; label: string }) {
  return <section aria-label={label} className="grid grid-cols-4 gap-2.5 max-[800px]:grid-cols-2 max-[400px]:grid-cols-1">{children}</section>;
}

export function Card({ title, hint, children, className }: { title?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 rounded-act-group border border-line bg-surface px-4 py-3.5", className)}>
      {title ? (
        <h4 className="m-0 mb-2.5 text-act-sm font-semibold text-text-main">
          {title}
          {hint ? <span className="ml-1.5 text-act-xs font-normal text-text-faint">{hint}</span> : null}
        </h4>
      ) : null}
      {children}
    </div>
  );
}

export function Grid({ cols, children }: { cols: 2 | 3; children: ReactNode }) {
  return <div className={cn("grid gap-2.5", cols === 2 ? "grid-cols-2 max-[800px]:grid-cols-1" : "grid-cols-3 max-[800px]:grid-cols-1")}>{children}</div>;
}

export type KvRow = { label: ReactNode; value: ReactNode; tone?: "warn" | "bad" };

export function KvList({ rows }: { rows: readonly KvRow[] }) {
  return (
    <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-act-sm">
      {rows.map((row, index) => (
        <div key={index} className="contents">
          <dt className="min-w-0 text-text-muted">{row.label}</dt>
          <dd className={cn("m-0 text-right tabular-nums text-text-main", row.tone && "font-medium")}>
            {row.tone ? <ToneText tone={row.tone}>{row.value}</ToneText> : row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** 需要提醒的数值：加粗并带「关注 / 异常」的底色小点，不单靠颜色区分。 */
export function ToneText({ tone, children }: { tone: "warn" | "bad"; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={cn("size-1.5 rounded-act-pill", tone === "bad" ? "bg-danger" : "bg-warning")} />
      {children}
    </span>
  );
}

export function SecHead({ title, hint, aside }: { title: ReactNode; hint?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mt-1.5 flex items-baseline gap-2">
      <h3 className="m-0 text-act-md font-semibold text-text-main">{title}</h3>
      {hint ? <span className="text-act-xs text-text-faint">{hint}</span> : null}
      {aside ? <span className="ml-auto text-act-xs text-text-faint">{aside}</span> : null}
    </div>
  );
}

export function Stack({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-3">{children}</div>;
}

export function Tag({ tone = "neutral", children }: { tone?: "neutral" | "info" | "warn"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] items-center whitespace-nowrap rounded-act-pill px-1.5 text-act-xxs font-medium",
        tone === "info" && "bg-info-soft text-info",
        tone === "warn" && "bg-warning-soft text-warning",
        tone === "neutral" && "border border-line/60 bg-surface-subtle text-text-muted",
      )}
    >
      {children}
    </span>
  );
}

/** 数值 + 迷你计量条，数值用文字色，条本身用中性色（warn 时用警示色）。 */
export function Meter({ value, max, label, warn = false }: { value: number; max: number; label: ReactNode; warn?: boolean }) {
  const width = Math.max(2, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  return (
    <span className="inline-flex w-full items-center justify-end gap-2">
      <span>{label}</span>
      <span aria-hidden="true" className="relative h-1 w-16 shrink-0 rounded-act-xs bg-line">
        <span className={cn("absolute inset-y-0 left-0 rounded-act-xs", warn ? "bg-warning" : "bg-text-main/70")} style={{ width: `${width}%` }} />
      </span>
    </span>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="m-0 rounded-act-md bg-surface-subtle px-4 py-6 text-center text-act-sm text-text-faint">{children}</p>;
}

export function Notice({ tone, children, role = "status" }: { tone: "info" | "warn" | "error"; children: ReactNode; role?: "status" | "alert" }) {
  return (
    <div role={role} className={cn("rounded-act-md px-3 py-2 text-act-xs", tone === "error" ? "bg-danger-soft text-on-danger" : tone === "warn" ? "bg-warning-soft text-text-main" : "bg-surface-subtle text-text-muted")}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ 表格 */

export type Column<T> = {
  readonly key: string;
  readonly label: ReactNode;
  readonly numeric?: boolean;
  readonly width?: string;
  /** 排序用的值；不给就不可排序。null 永远排在最后。 */
  readonly sortValue?: (row: T) => number | string | null;
  /** 表头悬停说明。 */
  readonly tip?: string;
  readonly render: (row: T) => ReactNode;
};

export type TableSort = { key: string; dir: 1 | -1 };

const CELL = "h-[38px] px-3 py-1.5 align-middle";

export function DataTable<T>({
  ariaLabel,
  columns,
  rows,
  rowKey,
  defaultSort,
  minWidth = 640,
  expandedKey,
  onToggle,
  renderExpanded,
  empty,
  limit,
}: {
  ariaLabel: string;
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  defaultSort?: TableSort;
  minWidth?: number;
  /** 给了 onToggle 的行才可点开；展开内容由 renderExpanded 渲染。 */
  expandedKey?: string | null;
  onToggle?: (key: string) => void;
  renderExpanded?: (row: T) => ReactNode;
  empty?: ReactNode;
  /** 先显示前 N 行，其余由「查看全部」展开。 */
  limit?: number;
}) {
  const [sort, setSort] = useState<TableSort | null>(defaultSort ?? null);
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => {
    const column = sort ? columns.find((item) => item.key === sort.key) : undefined;
    if (!sort || !column?.sortValue) return [...rows];
    const get = column.sortValue;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "string" || typeof y === "string" ? String(x).localeCompare(String(y), "zh-CN") : x - y) * sort.dir;
    });
  }, [rows, columns, sort]);
  const visible = limit && !all ? sorted.slice(0, limit) : sorted;
  const expandable = Boolean(onToggle);

  return (
    <div className="min-w-0 overflow-x-auto rounded-act-group border border-line bg-surface">
      <table aria-label={ariaLabel} style={{ minWidth }} className="w-full text-act-sm leading-5">
        <thead className="border-b border-line bg-surface-subtle text-left text-act-xs font-medium text-text-muted">
          <tr>
            {columns.map((column) => {
              const sortable = Boolean(column.sortValue);
              const active = sort?.key === column.key;
              const head = (
                <>
                  {column.label}
                  {active ? <span aria-hidden="true" className="ml-1 text-act-3xs text-text-subtle">{sort.dir < 0 ? "▼" : "▲"}</span> : null}
                </>
              );
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={active ? (sort.dir < 0 ? "descending" : "ascending") : undefined}
                  style={column.width ? { width: column.width } : undefined}
                  className={cn("h-[34px] whitespace-nowrap px-3 font-medium", column.numeric && "text-right")}
                >
                  {sortable ? (
                    <PlainButton
                      onClick={() => setSort(active ? { key: column.key, dir: sort.dir === 1 ? -1 : 1 } : { key: column.key, dir: column.numeric ? -1 : 1 })}
                      className="rounded-act-xs text-act-xs font-medium text-text-muted hover:text-text-main"
                    >
                      {column.tip ? <HeadTip tip={column.tip}>{head}</HeadTip> : head}
                    </PlainButton>
                  ) : column.tip ? <HeadTip tip={column.tip}>{head}</HeadTip> : head}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-line/60">
          {visible.map((row) => {
            const key = rowKey(row);
            const open = expandable && expandedKey === key;
            return (
              <RowGroup key={key} rowKey={key} columns={columns.length} open={open} expanded={open && renderExpanded ? renderExpanded(row) : null}>
                {columns.map((column, index) => {
                  const content = column.render(row);
                  return (
                    <td key={column.key} className={cn(CELL, column.numeric && "whitespace-nowrap text-right tabular-nums")}>
                      {expandable && index === 0 ? (
                        <PlainButton aria-expanded={open} onClick={() => onToggle?.(key)} className="flex w-full min-w-0 items-center gap-1.5 rounded-act-xs">
                          <ChevronRight size={13} strokeWidth={2} aria-hidden="true" className={cn("shrink-0 text-text-subtle transition-transform duration-(--motion-fast)", open && "rotate-90")} />
                          <span className="min-w-0 flex-1">{content}</span>
                        </PlainButton>
                      ) : content}
                    </td>
                  );
                })}
              </RowGroup>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && empty ? <div className="border-t border-line/60">{empty}</div> : null}
      {limit && rows.length > limit ? (
        <PlainButton onClick={() => setAll((value) => !value)} className="flex w-full justify-center border-t border-line/60 p-2 text-act-xs text-text-muted hover:bg-hover-overlay hover:text-text-main">
          {all ? "收起" : `查看全部 ${rows.length} 项`}
        </PlainButton>
      ) : null}
    </div>
  );
}

function HeadTip({ tip, children }: { tip: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild><span>{children}</span></TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

function RowGroup({ children, rowKey, columns, open, expanded }: { children: ReactNode; rowKey: string; columns: number; open: boolean; expanded: ReactNode }) {
  return (
    <>
      <tr data-row-key={rowKey} className={cn("hover:bg-hover-overlay", open && "bg-surface-subtle")}>{children}</tr>
      {open ? (
        <tr className="bg-surface-subtle">
          <td colSpan={columns} className="px-4 pb-4 pt-1">{expanded}</td>
        </tr>
      ) : null}
    </>
  );
}

/** 表格里的主名称 + 副标题。 */
export function NameCell({ name, sub, mono = true, tags }: { name: ReactNode; sub?: ReactNode; mono?: boolean; tags?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={cn("truncate font-medium text-text-main", mono && "font-mono text-act-xs")} title={typeof name === "string" ? name : undefined}>{name}</span>
        {tags}
      </div>
      {sub ? <div className="truncate text-act-xs text-text-faint">{sub}</div> : null}
    </div>
  );
}

export function Dash() {
  return <span className="text-text-subtle">{DASH}</span>;
}
