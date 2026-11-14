import { memo, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, Copy } from "lucide-react";
import {
  RESOURCE_HISTORY_LENGTH,
  type ResourceGroup,
  type ResourceHistoryPoint,
  type ResourceSample,
} from "@actspace/shared";
import { resourceMonitorApi } from "../../../api/resource-monitor";
import { Button } from "../../ui/Button";
import { PlainButton } from "../../ui/PlainButton";
import { cn } from "../../ui/cn";
import { SettingGroup, SettingRow, Toggle, useSettingsSaveNotice } from "../SettingsPrimitives";
import type { SectionProps } from "../sections/shared";
import {
  cpuChartMax,
  delayTone,
  formatCpuPercent,
  formatDelayMs,
  formatMemoryKiB,
  mainCpuTone,
  RESOURCE_GROUP_NAMES,
  RESOURCE_GROUP_NOTES,
  sparkPaths,
  type ResourceTone,
} from "./resource-format";
import { useResourceWatch } from "./use-resource-watch";

const TONE_CLASS: Record<Exclude<ResourceTone, null>, string> = {
  warning: "text-on-warning",
  danger: "text-on-danger",
};
const toneClass = (tone: ResourceTone) => (tone ? TONE_CLASS[tone] : "");

/** 设置 › 系统 ›「资源占用」：悬浮窗开关、三张指标卡、分组进程表、复制快照（front-资源监控规范 §3）。 */
export function ResourceUsageSection({ settingsV4, onUpdateNamespace }: SectionProps) {
  const watch = useResourceWatch();
  return (
    <>
      <FloatToggle
        enabled={settingsV4?.settings.general.performanceMonitoring === true}
        disabled={!settingsV4}
        onUpdateNamespace={onUpdateNamespace}
      />
      <SettingGroup title="当前占用" action={<CopySnapshotButton disabled={!watch.latest} />}>
        {watch.error ? (
          <p role="alert" className="px-4 py-3 text-act-sm text-on-danger">
            {watch.error}
          </p>
        ) : null}
        <MetricTiles history={watch.history} latest={watch.latest} />
        <div className="px-4 pb-2 pt-1">
          {watch.latest ? (
            <ProcessTable sample={watch.latest} />
          ) : (
            <p className="py-3 text-act-sm text-text-faint">正在读取…</p>
          )}
        </div>
      </SettingGroup>
    </>
  );
}

function FloatToggle({
  enabled,
  disabled,
  onUpdateNamespace,
}: {
  enabled: boolean;
  disabled: boolean;
  onUpdateNamespace: SectionProps["onUpdateNamespace"];
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = async (next: boolean) => {
    setSaving(true);
    setError(null);
    try {
      await onUpdateNamespace({ namespace: "general", patch: { performanceMonitoring: next } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法保存悬浮窗设置");
    } finally {
      setSaving(false);
    }
  };
  return (
    <SettingGroup>
      <SettingRow
        title="显示悬浮窗"
        control={
          <Toggle
            checked={enabled}
            disabled={disabled || saving}
            onChange={(next) => void change(next)}
            ariaLabel="显示悬浮窗"
          />
        }
      />
      {error ? (
        <p role="alert" className="px-4 py-3 text-act-xs text-on-danger">
          {error}
        </p>
      ) : null}
    </SettingGroup>
  );
}

function CopySnapshotButton({ disabled }: { disabled: boolean }) {
  const notify = useSettingsSaveNotice();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = async () => {
    setBusy(true);
    setError(null);
    try {
      const text = await resourceMonitorApi.copySnapshot();
      await navigator.clipboard.writeText(text);
      notify("已复制快照");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "复制失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="flex items-center gap-2">
      {error ? (
        <span role="alert" className="text-act-xs text-on-danger">
          {error}
        </span>
      ) : null}
      <Button variant="secondary" size="xs" disabled={disabled || busy} onClick={() => void copy()}>
        <Copy size={12} aria-hidden="true" />
        {busy ? "读取中…" : "复制快照"}
      </Button>
    </span>
  );
}

const SPARK_WIDTH = 300;
const SPARK_HEIGHT = 40;

const Sparkline = memo(function Sparkline({
  values,
  max,
  colorClass,
}: {
  values: readonly number[];
  max: number;
  colorClass: string;
}) {
  const { line, area } = sparkPaths(values, max, RESOURCE_HISTORY_LENGTH, SPARK_WIDTH, SPARK_HEIGHT);
  return (
    <svg
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn("mt-1.5 block h-10 w-full", colorClass)}
    >
      <line
        x1="0"
        x2={SPARK_WIDTH}
        y1={SPARK_HEIGHT - 0.5}
        y2={SPARK_HEIGHT - 0.5}
        className="stroke-line"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <path d={area} fill="currentColor" opacity="0.12" />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
});

function Tile({
  label,
  value,
  tone,
  axisLeft,
  axisRight,
  children,
}: {
  label: string;
  value: string;
  tone: ResourceTone;
  axisLeft: string;
  axisRight: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 px-4 pb-2.5 pt-3">
      <div className="truncate text-act-xs text-text-faint">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-act-xl font-semibold leading-tight tracking-tight tabular-nums text-text-main",
          toneClass(tone),
        )}
      >
        {value}
      </div>
      {children}
      <div className="flex justify-between text-act-xxs text-text-subtle">
        <span>{axisLeft}</span>
        <span>{axisRight}</span>
      </div>
    </div>
  );
}

function MetricTiles({ history, latest }: { history: readonly ResourceHistoryPoint[]; latest: ResourceSample | null }) {
  const series = useMemo(
    () => ({
      cpu: history.map((point) => point.cpuPercent),
      rss: history.map((point) => point.rssKiB),
      delay: history.map((point) => point.mainThreadDelayMs),
    }),
    [history],
  );
  const cpuMax = cpuChartMax(series.cpu);
  const rssMax = Math.max(1, ...series.rss);
  const delayMax = Math.max(200, ...series.delay);
  const delay = latest?.mainThreadDelayMs ?? null;
  return (
    <div className="grid grid-cols-3 divide-x divide-line/60 max-[720px]:grid-cols-1 max-[720px]:divide-x-0 max-[720px]:divide-y">
      <Tile
        label="CPU（100% = 1 核）"
        value={latest ? formatCpuPercent(latest.cpuPercent) : "—"}
        tone={null}
        axisLeft="5 分钟前"
        axisRight={`上限 ${cpuMax}%`}
      >
        <Sparkline values={series.cpu} max={cpuMax} colorClass="text-chart-series-1" />
      </Tile>
      <Tile
        label="内存（含共享页）"
        value={latest ? formatMemoryKiB(latest.rssKiB) : "—"}
        tone={null}
        axisLeft="5 分钟前"
        axisRight={formatMemoryKiB(rssMax)}
      >
        <Sparkline values={series.rss} max={rssMax * 1.15} colorClass="text-chart-series-3" />
      </Tile>
      <Tile
        label="主线程延迟"
        value={delay === null ? "—" : formatDelayMs(delay)}
        tone={delay === null ? null : delayTone(delay)}
        axisLeft="5 分钟前"
        axisRight={formatDelayMs(delayMax)}
      >
        <Sparkline values={series.delay} max={delayMax} colorClass="text-text-subtle" />
      </Tile>
    </div>
  );
}

const CELL = "py-1.5 text-right tabular-nums whitespace-nowrap";

function ProcessTable({ sample }: { sample: ResourceSample }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(["agent"]));
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <table className="w-full table-fixed border-collapse text-act-sm" aria-label="进程占用">
      <colgroup>
        <col />
        <col className="w-24" />
        <col className="w-28" />
      </colgroup>
      <thead>
        <tr className="text-act-xs text-text-faint">
          <th className="py-1.5 text-left font-normal">进程</th>
          <th className="py-1.5 text-right font-normal">CPU</th>
          <th className="py-1.5 text-right font-normal">内存</th>
        </tr>
      </thead>
      <tbody>
        {sample.groups.map((group) => (
          <GroupRows
            key={group.id}
            group={group}
            expanded={open.has(group.id)}
            onToggle={() => toggle(group.id)}
            agentAvailable={sample.agentProcessesAvailable}
          />
        ))}
        <tr className="border-t border-line font-medium text-text-main">
          <td className="py-1.5">合计</td>
          <td className={CELL}>{formatCpuPercent(sample.cpuPercent)}</td>
          <td className={CELL}>{formatMemoryKiB(sample.rssKiB)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function GroupRows({
  group,
  expanded,
  onToggle,
  agentAvailable,
}: {
  group: ResourceGroup;
  expanded: boolean;
  onToggle: () => void;
  agentAvailable: boolean;
}) {
  const isAgent = group.id === "agent";
  const isSelf = group.id === "monitor";
  const unavailable = isAgent && !agentAvailable;
  const expandable = group.processes.length > 1 || (isAgent && group.processes.length > 0);
  const count = isAgent ? group.processes.reduce((total, row) => total + row.count, 0) : 0;
  const note = RESOURCE_GROUP_NOTES[group.id];
  const name = (
    <span className="flex min-w-0 items-center gap-1">
      <ChevronRight
        size={12}
        aria-hidden="true"
        className={cn("shrink-0 text-text-subtle", !expandable && "invisible", expanded && "rotate-90")}
      />
      <span className="truncate">{RESOURCE_GROUP_NAMES[group.id]}</span>
      {isAgent && !unavailable ? <span className="shrink-0 text-act-xs text-text-faint">{count} 个</span> : null}
      {note ? <span className="shrink-0 text-act-xs text-text-faint">{note}</span> : null}
    </span>
  );
  return (
    <>
      <tr className={cn("border-t border-line/60", isSelf ? "text-text-faint" : "text-text-main")}>
        <td className="min-w-0 py-1.5">
          {expandable ? (
            <PlainButton className="w-full min-w-0" aria-expanded={expanded} onClick={onToggle}>
              {name}
            </PlainButton>
          ) : (
            name
          )}
        </td>
        <td className={cn(CELL, group.id === "main" && toneClass(mainCpuTone(group.cpuPercent)))}>
          {unavailable ? "—" : formatCpuPercent(group.cpuPercent)}
        </td>
        <td className={CELL}>{unavailable || group.rssKiB === 0 ? "—" : formatMemoryKiB(group.rssKiB)}</td>
      </tr>
      {expandable && expanded
        ? group.processes.map((row) => {
            const label = row.count > 1 ? `${row.label} ×${row.count}` : row.label;
            return (
              <tr key={`${row.pid}:${row.label}`} className="text-act-xs text-text-muted">
                <td className="min-w-0 py-1 pl-4">
                  <span className="flex min-w-0 items-center gap-1.5" title={label}>
                    <span className="truncate font-mono">{label}</span>
                    {row.pid > 0 && row.count === 1 ? (
                      <span className="shrink-0 text-text-faint">{row.pid}</span>
                    ) : null}
                  </span>
                </td>
                <td className={cn(CELL, "py-1")}>{formatCpuPercent(row.cpuPercent)}</td>
                <td className={cn(CELL, "py-1")}>{row.rssKiB === 0 ? "—" : formatMemoryKiB(row.rssKiB)}</td>
              </tr>
            );
          })
        : null}
    </>
  );
}
