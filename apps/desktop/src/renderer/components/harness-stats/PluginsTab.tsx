import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { HarnessPluginRow, HarnessPluginSource, HarnessStatsPlugins } from "@actspace/shared";
import { SettingsSelect } from "../settings/SettingsPrimitives";
import { DASH, SOURCE_LABEL, fmtApproxDuration, fmtDuration, fmtInt } from "./harness-stats-format";
import { Card, DataTable, Dash, EmptyNote, Grid, KvList, NameCell, Notice, SecHead, Stack, Tag, ToneText, type Column } from "./harness-stats-ui";

const SOURCE_OPTIONS = [
  { value: "all", label: "全部来源" },
  { value: "builtin", label: SOURCE_LABEL.builtin },
  { value: "user", label: SOURCE_LABEL.user },
  { value: "evolved", label: SOURCE_LABEL.evolved },
  { value: "unknown", label: SOURCE_LABEL.unknown },
];

function sourceTag(source: HarnessPluginSource) {
  if (source === "builtin") return null;
  return <Tag tone={source === "evolved" ? "info" : source === "user" ? "warn" : "neutral"}>{SOURCE_LABEL[source]}</Tag>;
}

export function PluginsTab({ data, focusKey }: { data: HarnessStatsPlugins; focusKey?: string }) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(focusKey ?? null);
  useEffect(() => {
    if (!focusKey) return;
    setExpanded(focusKey);
    // 从「值得关注」跳进来：把目标行滚到可见位置。
    requestAnimationFrame(() => document.querySelector(`[data-row-key="${CSS.escape(focusKey)}"]`)?.scrollIntoView?.({ block: "center" }));
  }, [focusKey]);
  const rows = useMemo(
    () => data.rows.filter((row) => (source === "all" || row.source === source) && (!query.trim() || row.pluginId.toLowerCase().includes(query.trim().toLowerCase()))),
    [data.rows, query, source],
  );
  const columns: Column<HarnessPluginRow>[] = [
    { key: "plugin", label: "插件", width: "230px", sortValue: (row) => row.pluginId, render: (row) => <NameCell name={row.pluginId} tags={sourceTag(row.source)} sub={row.lastLoadError ? <span className="text-on-danger">加载失败：{row.lastLoadError}</span> : undefined} /> },
    { key: "tools", label: "工具", numeric: true, sortValue: (row) => row.tools, render: (row) => (row.tools ? fmtInt(row.tools) : <Dash />) },
    { key: "calls", label: "工具调用", numeric: true, sortValue: (row) => row.toolCalls, render: (row) => (row.tools ? fmtInt(row.toolCalls) : <Dash />) },
    { key: "context", label: "上下文 / 请求", numeric: true, sortValue: (row) => row.contextTokens, render: (row) => (row.contextTokens ? fmtInt(row.contextTokens) : <Dash />) },
    { key: "services", label: "服务调用", numeric: true, sortValue: (row) => row.serviceCalls, render: (row) => (row.services ? fmtInt(row.serviceCalls) : <Dash />) },
    {
      key: "listeners", label: "监听", numeric: true, sortValue: (row) => row.listeners,
      render: (row) => (row.listeners ? <>{fmtInt(row.listeners)}{row.listenerErrors ? <span className="ml-1"><ToneText tone="bad">{fmtInt(row.listenerErrors)} 报错</ToneText></span> : null}</> : <Dash />),
    },
    { key: "events", label: "写入事件", numeric: true, sortValue: (row) => row.journalEvents, render: (row) => (row.journalEvents ? fmtInt(row.journalEvents) : <Dash />) },
    {
      key: "load", label: "加载", numeric: true, sortValue: (row) => row.loadP50Ms,
      render: (row) => (row.loads === 0 ? <Dash /> : <span>{fmtApproxDuration(row.loadP50Ms)}{row.loadFailures ? <span className="ml-1"><ToneText tone="bad">{row.loadFailures} 次失败</ToneText></span> : null}</span>),
    },
  ];
  const showRuntime = !data.runtimeEmpty;

  return (
    <Stack>
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative flex min-w-0 flex-[0_1_260px] max-[600px]:flex-[1_1_100%]">
          <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-subtle" />
          <input
            aria-label="搜索插件"
            placeholder="搜索插件"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-[30px] w-full min-w-0 rounded-act-sm border border-line bg-surface pl-8 pr-2.5 text-act-sm text-text-main outline-none placeholder:text-text-subtle hover:border-line-strong focus-visible:border-focus-ring focus-visible:ring-[3px] focus-visible:ring-focus-ring/15"
          />
        </span>
        <SettingsSelect size="sm" ariaLabel="筛选插件来源" value={source} options={SOURCE_OPTIONS} onChange={setSource} />
      </div>
      {data.runtimeFilterLimited ? <Notice tone="info">服务、监听、加载只支持按时间和版本筛选，其余筛选条件对这几列不生效。</Notice> : null}
      <DataTable
        ariaLabel="插件列表"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.pluginId}
        defaultSort={{ key: "calls", dir: -1 }}
        minWidth={820}
        expandedKey={expanded}
        onToggle={(key) => setExpanded((current) => (current === key ? null : key))}
        renderExpanded={(row) => <PluginDetail row={row} data={data} runtimeEmpty={data.runtimeEmpty} />}
        empty={<EmptyNote>没有符合条件的插件</EmptyNote>}
      />
      <SecHead title="服务调用" />
      {data.runtimeEmpty ? <EmptyNote>还没有运行时统计。</EmptyNote> : (
        <DataTable
          ariaLabel="服务调用"
          columns={serviceColumns}
          rows={data.services}
          rowKey={(row) => `${row.providerPluginId ?? ""}|${row.service}|${row.method}`}
          defaultSort={{ key: "calls", dir: -1 }}
          minWidth={560}
          empty={<EmptyNote>所选范围内没有服务调用</EmptyNote>}
        />
      )}
      {showRuntime ? (
        <Grid cols={2}>
          <Card title="依赖关系">
            {data.dependencies.length === 0 ? <p className="m-0 text-act-sm text-text-faint">没有插件之间的服务调用</p> : (
              <div className="flex flex-col gap-1.5">
                {[...data.dependencies].sort((a, b) => b.calls - a.calls).map((dep) => (
                  <div key={`${dep.caller}>${dep.callee}>${dep.service}`} className="grid grid-cols-[1fr_16px_1fr_auto] items-center gap-2 text-act-xs">
                    <span className="truncate text-right font-mono" title={dep.caller}>{dep.caller}</span>
                    <span aria-hidden="true" className="text-center text-text-subtle">→</span>
                    <span className="truncate font-mono" title={`${dep.callee} · ${dep.service}`}>{dep.callee}</span>
                    <span className="tabular-nums text-text-muted">{fmtInt(dep.calls)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="监听与拦截" hint="触发 / 报错 / 平均耗时">
            {data.listeners.length === 0 ? <p className="m-0 text-act-sm text-text-faint">没有监听记录</p> : (
              <div className="flex flex-col gap-1.5">
                {[...data.listeners].sort((a, b) => b.calls - a.calls).map((item) => (
                  <div key={`${item.pluginId}|${item.event}`} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 text-act-xs">
                    <span className="truncate font-mono" title={`${item.pluginId} · ${item.event}`}>{item.pluginId} · {item.event}</span>
                    <span className="tabular-nums text-text-muted">{fmtInt(item.calls)}</span>
                    <span className="tabular-nums text-text-muted">{item.errors ? <ToneText tone="bad">{fmtInt(item.errors)}</ToneText> : "0"}</span>
                    <span className="tabular-nums text-text-muted">{item.avgMs == null ? DASH : fmtDuration(item.avgMs)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Grid>
      ) : null}
    </Stack>
  );
}

const serviceColumns: Column<HarnessStatsPlugins["services"][number]>[] = [
  { key: "service", label: "服务", sortValue: (row) => row.service, render: (row) => <NameCell name={row.method ? `${row.service}.${row.method}` : row.service} sub={row.providerPluginId ?? undefined} /> },
  { key: "calls", label: "调用", numeric: true, sortValue: (row) => row.calls, render: (row) => (row.calls ? fmtInt(row.calls) : <ToneText tone="warn">0</ToneText>) },
  { key: "avg", label: "平均耗时", numeric: true, sortValue: (row) => row.avgMs, render: (row) => (row.calls && row.avgMs != null ? fmtDuration(row.avgMs) : <Dash />) },
  { key: "p95", label: "P95", numeric: true, sortValue: (row) => row.p95Ms, render: (row) => (row.calls && row.p95Ms != null ? fmtApproxDuration(row.p95Ms) : <Dash />) },
  { key: "errors", label: "报错", numeric: true, sortValue: (row) => row.errors, render: (row) => (row.errors ? <ToneText tone="bad">{fmtInt(row.errors)}</ToneText> : "0") },
];

function PluginDetail({ row, data, runtimeEmpty }: { row: HarnessPluginRow; data: HarnessStatsPlugins; runtimeEmpty: boolean }) {
  const services = data.services.filter((item) => item.providerPluginId === row.pluginId);
  const listeners = data.listeners.filter((item) => item.pluginId === row.pluginId);
  const calledBy = data.dependencies.filter((item) => item.callee === row.pluginId);
  const calls = data.dependencies.filter((item) => item.caller === row.pluginId);
  if (runtimeEmpty) return <p className="m-0 mt-2 text-act-sm text-text-faint">还没有运行时统计。</p>;
  return (
    <div className="mt-2 grid grid-cols-3 gap-3 max-[800px]:grid-cols-1">
      <Card title="服务" hint={`${services.length} 个`}>
        {services.length === 0 ? <p className="m-0 text-act-xs text-text-faint">没有提供服务</p> : (
          <KvList rows={services.map((item) => ({ label: <span className="font-mono text-act-xs">{item.method ? `${item.service}.${item.method}` : item.service}</span>, value: `${fmtInt(item.calls)} 次${item.errors ? ` · ${item.errors} 报错` : ""}`, tone: item.calls === 0 ? "warn" as const : undefined }))} />
        )}
      </Card>
      <Card title="监听" hint={`${listeners.length} 个`}>
        {listeners.length === 0 ? <p className="m-0 text-act-xs text-text-faint">没有监听事件</p> : (
          <KvList rows={listeners.map((item) => ({ label: <span className="font-mono text-act-xs">{item.event}</span>, value: `${fmtInt(item.calls)} 次${item.errors ? ` · ${item.errors} 报错` : ""}`, tone: item.errors ? "bad" as const : undefined }))} />
        )}
      </Card>
      <Card title="依赖">
        {calledBy.length + calls.length === 0 ? <p className="m-0 text-act-xs text-text-faint">没有与其他插件的服务调用</p> : (
          <KvList rows={[
            ...calledBy.map((item) => ({ label: <span className="font-mono text-act-xs">{item.caller} →（本插件）</span>, value: `${fmtInt(item.calls)} 次` })),
            ...calls.map((item) => ({ label: <span className="font-mono text-act-xs">（本插件）→ {item.callee}</span>, value: `${fmtInt(item.calls)} 次` })),
          ]} />
        )}
      </Card>
    </div>
  );
}
