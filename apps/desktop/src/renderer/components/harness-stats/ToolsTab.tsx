import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { HARNESS_FLAG_RULES, type HarnessStatsTools, type HarnessToolRow } from "@actspace/shared";
import { SettingsSelect } from "../settings/SettingsPrimitives";
import { CostScatter } from "./harness-stats-charts";
import { DASH, callRate, costPerCall, fmtApproxDuration, fmtApproxTokens, fmtDay, fmtDuration, fmtInt, fmtPct, fmtTokens, ratio } from "./harness-stats-format";
import { Card, DataTable, Dash, EmptyNote, Grid, KvList, Meter, NameCell, Stack, ToneText, type Column, type KvRow } from "./harness-stats-ui";

// 与「值得关注」用同一张阈值表，表格里的高亮和总览里的提示不会各说各话。
const TOOL_FLAG_RULES = {
  lowRate: HARNESS_FLAG_RULES.toolCostlyUnused.maxCallRate,
  minSchema: HARNESS_FLAG_RULES.toolCostlyUnused.minSchemaTokens,
  highFailure: HARNESS_FLAG_RULES.toolFailureRate.minFailureRate,
} as const;

function failureRate(row: HarnessToolRow): number | null {
  return ratio(row.failed, row.calls);
}

export function ToolsTab({ data, focusKey }: { data: HarnessStatsTools; focusKey?: string }) {
  const [query, setQuery] = useState("");
  const [plugin, setPlugin] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(focusKey ?? null);
  useEffect(() => {
    if (!focusKey) return;
    setExpanded(focusKey);
    requestAnimationFrame(() => document.querySelector(`[data-row-key="${CSS.escape(focusKey)}"]`)?.scrollIntoView?.({ block: "center" }));
  }, [focusKey]);
  const pluginOptions = useMemo(
    () => [{ value: "all", label: "全部插件" }, ...[...new Set(data.rows.map((row) => row.pluginId).filter((id): id is string => Boolean(id)))].sort().map((id) => ({ value: id, label: id }))],
    [data.rows],
  );
  const rows = useMemo(
    () => data.rows.filter((row) => (plugin === "all" || row.pluginId === plugin) && (!query.trim() || row.name.toLowerCase().includes(query.trim().toLowerCase()))),
    [data.rows, plugin, query],
  );
  const maxRate = useMemo(() => Math.max(0.01, ...data.rows.map((row) => callRate(row.calls, row.exposures) ?? 0)), [data.rows]);
  const columns: Column<HarnessToolRow>[] = [
    { key: "name", label: "工具", width: "160px", sortValue: (row) => row.name, render: (row) => <NameCell name={row.name} sub={row.pluginId ?? undefined} /> },
    { key: "calls", label: "调用", numeric: true, sortValue: (row) => row.calls, render: (row) => fmtInt(row.calls) },
    {
      key: "rate", label: "调用率", numeric: true, sortValue: (row) => callRate(row.calls, row.exposures),
      render: (row) => {
        const rate = callRate(row.calls, row.exposures);
        return rate == null ? <Dash /> : <Meter value={rate} max={maxRate} label={fmtPct(rate)} warn={rate < TOOL_FLAG_RULES.lowRate && (row.schemaTokens ?? 0) >= TOOL_FLAG_RULES.minSchema} />;
      },
    },
    { key: "schema", label: "定义 token", numeric: true, sortValue: (row) => row.schemaTokens, render: (row) => fmtInt(row.schemaTokens) },
    {
      key: "perCall", label: "每次调用摊到", numeric: true, sortValue: (row) => costPerCall(row.schemaTokens, row.exposures, row.calls),
      render: (row) => {
        const value = costPerCall(row.schemaTokens, row.exposures, row.calls);
        return value == null ? <Dash /> : <span className={value > 100_000 ? "font-medium" : undefined}>{fmtTokens(value)}</span>;
      },
    },
    {
      key: "output", label: "平均输出", numeric: true, sortValue: (row) => row.outputTokensAvg,
      render: (row) => (row.outputTokensAvg == null ? <Dash /> : fmtTokens(row.outputTokensAvg)),
    },
    {
      key: "failure", label: "失败率", numeric: true, sortValue: failureRate,
      render: (row) => {
        const rate = failureRate(row);
        return rate == null ? <Dash /> : rate > TOOL_FLAG_RULES.highFailure ? <ToneText tone="bad">{fmtPct(rate)}</ToneText> : fmtPct(rate);
      },
    },
    {
      key: "duration", label: "耗时 P50", numeric: true, sortValue: (row) => row.durationP50Ms,
      render: (row) => (row.durationP50Ms == null ? <Dash /> : fmtApproxDuration(row.durationP50Ms)),
    },
  ];
  const { approvals, bash, waste } = data;
  const bashTotal = bash.sandboxed + bash.unsandboxed + bash.unknownEnvironment;
  const approvalRows: KvRow[] = [
    { label: "发起审批", value: fmtInt(approvals.asked) },
    { label: "用户批准 / 拒绝", value: `${fmtInt(approvals.userApproved)} / ${fmtInt(approvals.userDenied)}` },
    { label: "自动审查 批准 / 拒绝", value: `${fmtInt(approvals.autoApproved)} / ${fmtInt(approvals.autoDeclined)}` },
    { label: "等待超时", value: fmtInt(approvals.timedOut) },
    { label: "会话授权被使用", value: fmtInt(approvals.sessionGrantUsed) },
    { label: "超出授权范围被拒", value: fmtInt(approvals.scopeDenied) },
    { label: "平均等待", value: approvals.avgWaitMs == null ? DASH : fmtDuration(approvals.avgWaitMs) },
  ];
  const bashRows: KvRow[] = [
    { label: "沙盒内", value: `${fmtInt(bash.sandboxed)}${bashTotal ? `（${fmtPct(bash.sandboxed / bashTotal)}）` : ""}` },
    { label: "沙盒外", value: fmtInt(bash.unsandboxed) },
    ...(bash.unknownEnvironment ? [{ label: "环境未记录", value: fmtInt(bash.unknownEnvironment) }] : []),
    { label: "申请出沙箱", value: fmtInt(bash.escalations) },
    { label: "前台 / 后台", value: `${fmtInt(bash.foreground)} / ${fmtInt(bash.background)}` },
  ];
  const wasteRows: KvRow[] = [
    { label: "同参数重复调用", value: fmtInt(waste.repeatedSameArgs), tone: waste.repeatedSameArgs > 0 ? "warn" : undefined },
    { label: "失败后立即重试", value: fmtInt(waste.retryAfterFailure) },
    { label: "输出被截断", value: fmtInt(waste.truncated) },
    { label: "压缩拿掉的工具输出", value: `${fmtInt(waste.foldedOutputs)} 次 · ${fmtTokens(waste.foldedTokens)} token` },
  ];

  return (
    <Stack>
      <Card title="成本 vs 使用"><CostScatter tools={data.rows} /></Card>
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative flex min-w-0 flex-[0_1_260px] max-[600px]:flex-[1_1_100%]">
          <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-subtle" />
          <input
            aria-label="搜索工具"
            placeholder="搜索工具"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-[30px] w-full min-w-0 rounded-act-sm border border-line bg-surface pl-8 pr-2.5 text-act-sm text-text-main outline-none placeholder:text-text-subtle hover:border-line-strong focus-visible:border-focus-ring focus-visible:ring-[3px] focus-visible:ring-focus-ring/15"
          />
        </span>
        <SettingsSelect size="sm" ariaLabel="筛选工具所属插件" value={plugin} options={pluginOptions} onChange={setPlugin} />
      </div>
      <DataTable
        ariaLabel="工具列表"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.name}
        defaultSort={{ key: "calls", dir: -1 }}
        minWidth={800}
        expandedKey={expanded}
        onToggle={(key) => setExpanded((current) => (current === key ? null : key))}
        renderExpanded={(row) => <ToolDetail row={row} />}
        empty={<EmptyNote>{data.rows.length === 0 ? "所选范围内没有工具数据" : "没有符合条件的工具"}</EmptyNote>}
      />
      <Grid cols={3}>
        <Card title="审批"><KvList rows={approvalRows} /></Card>
        <Card title="bash 执行环境"><KvList rows={bashRows} /></Card>
        <Card title="浪费信号"><KvList rows={wasteRows} /></Card>
      </Grid>
    </Stack>
  );
}

function ToolDetail({ row }: { row: HarnessToolRow }) {
  const outcomes: KvRow[] = [
    { label: "完成", value: fmtInt(row.completed) },
    { label: "失败", value: fmtInt(row.failed), tone: row.failed > 0 && (failureRate(row) ?? 0) > TOOL_FLAG_RULES.highFailure ? "bad" : undefined },
    { label: "被拒绝", value: fmtInt(row.denied) },
    { label: "中止", value: fmtInt(row.aborted) },
    ...(row.unknownOutcome ? [{ label: "结果未记录", value: fmtInt(row.unknownOutcome) }] : []),
    { label: "输出 P95", value: fmtApproxTokens(row.outputTokensP95) },
    { label: "耗时 P50 / P95", value: row.durationP50Ms == null ? DASH : `${fmtApproxDuration(row.durationP50Ms)} / ${fmtApproxDuration(row.durationP95Ms)}` },
    { label: "最后使用", value: fmtDay(row.lastUsedAt) },
  ];
  const waste: KvRow[] = [
    { label: "同参数重复调用", value: fmtInt(row.repeatedSameArgs) },
    { label: "失败后立即重试", value: fmtInt(row.retryAfterFailure) },
    { label: "输出被截断", value: fmtInt(row.truncated) },
    { label: "压缩拿掉的输出", value: `${fmtInt(row.foldedOutputs)} 次 · ${fmtTokens(row.foldedTokens)} token` },
  ];
  return (
    <div className="mt-2 grid grid-cols-3 gap-3 max-[800px]:grid-cols-1">
      <Card title="结果"><KvList rows={outcomes} /></Card>
      <Card title="失败原因">
        {row.failureCodes.length === 0 ? <p className="m-0 text-act-xs text-text-faint">没有失败记录</p> : (
          <KvList rows={[...row.failureCodes].sort((a, b) => b.count - a.count).map((item) => ({ label: <span className="font-mono text-act-xs">{item.code}</span>, value: `${fmtInt(item.count)} 次` }))} />
        )}
      </Card>
      <Card title="浪费信号"><KvList rows={waste} /></Card>
    </div>
  );
}
