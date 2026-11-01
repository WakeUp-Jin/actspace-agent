import type { HarnessCompareFormat, HarnessCompareRow, HarnessRevisionInfo, HarnessStatsVersions } from "@actspace/shared";
import { SettingsSelect } from "../settings/SettingsPrimitives";
import { cn } from "../ui/cn";
import { DASH, fmtDay, fmtDuration, fmtInt, fmtPct, fmtSignedPct, fmtTokens, revisionLabel } from "./harness-stats-format";
import { Card, DataTable, EmptyNote, KvList, NameCell, Notice, Grid, Stack, type Column } from "./harness-stats-ui";

function fmtCompare(value: number | null, format: HarnessCompareFormat): string {
  if (value == null) return DASH;
  switch (format) {
    case "rate": return fmtPct(value);
    case "tokens": return fmtTokens(value);
    case "ms": return fmtDuration(value);
    case "number": return Number.isInteger(value) ? fmtInt(value) : value.toFixed(1);
    default: return fmtInt(value);
  }
}

function Delta({ row }: { row: HarnessCompareRow }) {
  if (row.from == null || row.to == null || row.from === 0) return <span className="text-text-subtle">{DASH}</span>;
  const change = (row.to - row.from) / row.from;
  if (change === 0) return <span className="text-text-muted">持平</span>;
  const good = row.better === "lower" ? change < 0 : change > 0;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className={cn("size-1.5 rounded-act-pill", good ? "bg-success" : "bg-warning")} />
      {fmtSignedPct(change)}
      <span className="sr-only">{good ? "（变好）" : "（变差）"}</span>
    </span>
  );
}

export function VersionsTab({ data, onCompareChange }: { data: HarnessStatsVersions; onCompareChange: (compare: { from: string; to: string }) => void }) {
  const label = (key: string | null) => revisionLabel(key, data.revisions);
  const options = data.revisions.map((item) => ({ value: item.key, label: label(item.key) }));
  const revisionColumns: Column<HarnessRevisionInfo>[] = [
    { key: "revision", label: "版本", render: (row) => <NameCell name={label(row.key)} sub={row.harnessId ?? undefined} /> },
    { key: "time", label: "生效时间", render: (row) => <span className="text-text-muted">{fmtDay(row.firstSeenAt)} → {fmtDay(row.lastSeenAt)}</span> },
    { key: "description", label: "变化", render: (row) => row.description ?? <span className="text-text-subtle">{DASH}</span> },
    { key: "requests", label: "请求数", numeric: true, render: (row) => fmtInt(row.requests) },
  ];
  const compareColumns: Column<HarnessCompareRow>[] = [
    { key: "label", label: "指标", render: (row) => row.label },
    { key: "from", label: label(data.from), numeric: true, render: (row) => fmtCompare(row.from, row.format) },
    { key: "to", label: label(data.to), numeric: true, render: (row) => fmtCompare(row.to, row.format) },
    { key: "delta", label: "变化", numeric: true, render: (row) => <Delta row={row} /> },
  ];
  return (
    <Stack>
      <DataTable ariaLabel="版本列表" columns={revisionColumns} rows={data.revisions} rowKey={(row) => row.key} minWidth={520} empty={<EmptyNote>还没有版本记录</EmptyNote>} />
      {data.revisions.length < 2 ? <EmptyNote>至少需要两个有数据的版本才能对比。</EmptyNote> : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-act-xs text-text-muted">对比</span>
            <SettingsSelect size="sm" ariaLabel="对比的起始版本" value={data.from ?? ""} options={options} onChange={(value) => data.to && onCompareChange({ from: value, to: data.to })} />
            <span aria-hidden="true" className="text-text-faint">→</span>
            <SettingsSelect size="sm" ariaLabel="对比的目标版本" value={data.to ?? ""} options={options} onChange={(value) => data.from && onCompareChange({ from: data.from, to: value })} />
          </div>
          {data.lowSample ? <Notice tone="warn">其中一个版本的样本偏少，仅供参考。</Notice> : null}
          <DataTable ariaLabel="版本对比" columns={compareColumns} rows={data.compare} rowKey={(row) => row.id} minWidth={520} empty={<EmptyNote>这两个版本没有可对比的指标</EmptyNote>} />
        </>
      )}
      <Grid cols={2}>
        <Card title="plugin_manager 操作" hint="自进化改动 harness 的步骤">
          {data.evolutionOps.length === 0 ? <p className="m-0 text-act-sm text-text-faint">所选范围内没有自进化操作</p> : (
            <KvList rows={data.evolutionOps.map((item) => ({ label: <span className="font-mono text-act-xs">{item.action}</span>, value: `${fmtInt(item.count)} 次${item.failed ? ` · ${fmtInt(item.failed)} 失败` : ""}`, tone: item.failed ? "warn" as const : undefined }))} />
          )}
        </Card>
        <Card title="自进化生成的插件">
          {data.evolvedPlugins.length === 0 ? <p className="m-0 text-act-sm text-text-faint">还没有自进化生成的插件</p> : (
            <KvList rows={data.evolvedPlugins.map((item) => ({ label: <span className="font-mono text-act-xs">{item.pluginId}</span>, value: `${fmtInt(item.calls)} 次调用 · ${fmtInt(item.failures)} 失败 · ${fmtInt(item.sessions)} 个会话`, tone: item.failures ? "bad" as const : undefined }))} />
          )}
        </Card>
      </Grid>
    </Stack>
  );
}
