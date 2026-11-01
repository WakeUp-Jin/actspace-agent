import { AlertTriangle, ChevronRight, Info, XCircle } from "lucide-react";
import type { HarnessFlag, HarnessFlagLevel, HarnessStatsOverview, HarnessStatsTab } from "@actspace/shared";
import { PlainButton } from "../ui/PlainButton";
import { cn } from "../ui/cn";
import { StackBar, TrendChart } from "./harness-stats-charts";
import { bucketSegments, fmtBytes, fmtDateTime, fmtDay, fmtInt, fmtTokens, revisionLabel } from "./harness-stats-format";
import { Card, EmptyNote, Grid, KvList, SecHead, Stack, type KvRow } from "./harness-stats-ui";

const LEVEL_LABEL: Record<HarnessFlagLevel, string> = { warn: "关注", error: "异常", info: "提示" };

function LevelIcon({ level }: { level: HarnessFlagLevel }) {
  const className = cn("mt-0.5 shrink-0", level === "error" ? "text-danger" : level === "warn" ? "text-warning" : "text-info");
  const Icon = level === "error" ? XCircle : level === "warn" ? AlertTriangle : Info;
  return <Icon size={15} strokeWidth={1.9} aria-hidden="true" className={className} />;
}

function FlagRow({ flag, onOpen }: { flag: HarnessFlag; onOpen: (target: HarnessFlag["target"]) => void }) {
  return (
    <PlainButton
      onClick={() => onOpen(flag.target)}
      className="grid w-full grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-2.5 px-3.5 py-2.5 hover:bg-hover-overlay"
    >
      <LevelIcon level={flag.level} />
      <span className="min-w-0">
        <span className="block text-act-sm font-medium text-text-main">
          <span
            className={cn(
              "mr-1.5 inline-flex h-[18px] items-center rounded-act-xs px-1.5 align-[1px] text-act-xxs font-medium",
              flag.level === "error" && "bg-danger-soft text-on-danger",
              flag.level === "warn" && "bg-warning-soft text-warning",
              flag.level === "info" && "bg-info-soft text-info",
            )}
          >
            {LEVEL_LABEL[flag.level]}
          </span>
          {flag.title}
        </span>
        <span className="mt-0.5 block text-act-xs text-text-muted">{flag.detail}</span>
      </span>
      <span className="mt-0.5 inline-flex items-center gap-0.5 whitespace-nowrap text-act-xxs text-text-faint">
        {flag.category}
        <ChevronRight size={13} strokeWidth={1.9} aria-hidden="true" />
      </span>
    </PlainButton>
  );
}

export function OverviewTab({ data, onOpenFlag }: { data: HarnessStatsOverview; onOpenFlag: (target: { tab: HarnessStatsTab; key?: string }) => void }) {
  const toolCalls = data.dailyToolCalls.reduce((sum, item) => sum + item.value, 0);
  const harness = data.harness;
  const rows: KvRow[] = [
    { label: "当前版本", value: harness.currentRevision ? `${revisionLabel(harness.currentRevision)} · ${fmtDay(harness.currentSince)} 起` : "—" },
    { label: "加载的插件", value: `${fmtInt(harness.plugins)}（工具类 ${fmtInt(harness.toolPlugins)}）` },
    { label: "可用工具", value: fmtInt(harness.tools) },
    { label: "统计文件", value: `${fmtBytes(harness.statsFileBytes)} · 上次重建 ${fmtDateTime(harness.lastRebuildAt)}` },
  ];
  if (harness.statsWriteFailures > 0) rows.push({ label: "统计写入失败", value: `${fmtInt(harness.statsWriteFailures)} 次`, tone: "warn" });
  return (
    <Stack>
      <SecHead title="值得关注" hint="按固定规则从统计里挑出来，不经过模型" />
      {data.flags.length === 0 ? (
        <EmptyNote>所选范围内没有触发任何规则，当前 harness 没有明显问题。</EmptyNote>
      ) : (
        <div className="flex flex-col divide-y divide-line/60 overflow-hidden rounded-act-group border border-line bg-surface">
          {data.flags.map((flag, index) => <FlagRow key={`${flag.rule}-${index}`} flag={flag} onOpen={onOpenFlag} />)}
        </div>
      )}
      <SecHead title="每天的工具调用" aside={`合计 ${fmtInt(toolCalls)} 次`} />
      <Card><TrendChart data={data.dailyToolCalls} unit="次" label="每天的工具调用次数折线图" /></Card>
      <Grid cols={2}>
        <Card title="平均每次请求的上下文" hint={data.avgEstimatedTokens != null ? `估算 ${fmtTokens(data.avgEstimatedTokens)} token` : undefined}>
          <StackBar segments={bucketSegments(data.buckets)} label="平均每次请求的上下文构成" />
        </Card>
        <Card title="本期 harness"><KvList rows={rows} /></Card>
      </Grid>
    </Stack>
  );
}
