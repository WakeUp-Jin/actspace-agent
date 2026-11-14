import type {
  HarnessCompactionRecord,
  HarnessPluginRow,
  HarnessSkillRow,
  HarnessSourceRow,
  HarnessToolRow,
} from "@actspace/shared";
import { DataTable, DetailSection, EmptyState, type TableColumn, type TableSort } from "../stats/stats-ui";
import { DASH, fmtDateTime, fmtDuration, fmtInt, fmtPct, fmtTokens, ratio } from "../stats/stats-format";
import { UnderlineTabs } from "../ui/UnderlineTabs";
import { cn } from "../ui/cn";
import { SOURCE_LABEL, bucketLabel, isChurning, triggerLabel } from "./harness-stats-format";
import type { HarnessStatsController } from "./use-harness-stats";

/* 底部明细：5 个下划线 tab + 可排序表格（front-统计页规范.md §3.5）。排序由页面持有，指标卡 / 值得关注跳过来时会指定排序。 */

export type DetailTab = "tools" | "plugins" | "sources" | "skills" | "compactions";

export const DETAIL_DEFAULT_SORT: Record<DetailTab, TableSort> = {
  tools: { key: "calls", dir: "desc" },
  plugins: { key: "contextTokens", dir: "desc" },
  sources: { key: "avgTokens", dir: "desc" },
  skills: { key: "skillReads", dir: "desc" },
  compactions: { key: "time", dir: "desc" },
};

const DETAIL_LABEL: Record<DetailTab, string> = {
  tools: "工具",
  plugins: "插件",
  sources: "上下文来源",
  skills: "Skills",
  compactions: "压缩记录",
};
const PAGE_SIZE = 20;

const num = (value: number | null) => value;
const danger = (value: string, on: boolean) => <span className={cn(on && "text-on-danger")}>{value}</span>;

const TOOL_COLUMNS: readonly TableColumn<HarnessToolRow>[] = [
  { key: "name", label: "工具", mono: true, render: (row) => row.name, sortValue: (row) => row.name },
  { key: "plugin", label: "插件", mono: true, render: (row) => row.pluginId ?? DASH, sortValue: (row) => row.pluginId },
  { key: "calls", label: "调用", align: "right", render: (row) => fmtInt(row.calls), sortValue: (row) => row.calls },
  {
    key: "callRate",
    label: "调用率",
    align: "right",
    render: (row) => fmtPct(ratio(row.calls, row.exposures), 2),
    sortValue: (row) => num(ratio(row.calls, row.exposures)),
  },
  {
    key: "schemaTokens",
    label: "定义（token）",
    align: "right",
    render: (row) => fmtInt(row.schemaTokens),
    sortValue: (row) => row.schemaTokens,
  },
  {
    key: "failureRate",
    label: "失败率",
    align: "right",
    render: (row) => danger(fmtPct(ratio(row.failed, row.calls)), (ratio(row.failed, row.calls) ?? 0) >= 0.05),
    sortValue: (row) => ratio(row.failed, row.calls),
  },
  {
    key: "truncated",
    label: "输出截断",
    align: "right",
    render: (row) => fmtInt(row.truncated),
    sortValue: (row) => row.truncated,
  },
  {
    key: "repeated",
    label: "同参数重复",
    align: "right",
    render: (row) => fmtInt(row.repeated),
    sortValue: (row) => row.repeated,
  },
];

const PLUGIN_COLUMNS: readonly TableColumn<HarnessPluginRow>[] = [
  { key: "pluginId", label: "插件", mono: true, render: (row) => row.pluginId, sortValue: (row) => row.pluginId },
  {
    key: "source",
    label: "来源",
    render: (row) => SOURCE_LABEL[row.source],
    sortValue: (row) => SOURCE_LABEL[row.source],
  },
  { key: "tools", label: "工具数", align: "right", render: (row) => fmtInt(row.tools), sortValue: (row) => row.tools },
  {
    key: "toolCalls",
    label: "工具调用",
    align: "right",
    render: (row) => fmtInt(row.toolCalls),
    sortValue: (row) => row.toolCalls,
  },
  {
    key: "contextTokens",
    label: "占上下文",
    align: "right",
    render: (row) => fmtInt(row.contextTokens),
    sortValue: (row) => row.contextTokens,
  },
  { key: "loads", label: "加载", align: "right", render: (row) => fmtInt(row.loads), sortValue: (row) => row.loads },
  {
    key: "loadFailures",
    label: "加载失败",
    align: "right",
    render: (row) => danger(fmtInt(row.loadFailures), row.loadFailures > 0),
    sortValue: (row) => row.loadFailures,
  },
];

const SOURCE_COLUMNS: readonly TableColumn<HarnessSourceRow>[] = [
  { key: "id", label: "来源", mono: true, render: (row) => row.id, sortValue: (row) => row.id },
  {
    key: "bucket",
    label: "类别",
    render: (row) => bucketLabel(row.bucket),
    sortValue: (row) => bucketLabel(row.bucket),
  },
  {
    key: "avgTokens",
    label: "平均大小",
    align: "right",
    render: (row) => `≈${fmtTokens(row.avgTokens)}`,
    sortValue: (row) => row.avgTokens,
  },
  {
    key: "changeRate",
    label: "变化率",
    align: "right",
    render: (row) => (
      <span className={cn(isChurning(row.bucket, row.changeRate) && "text-on-warning")}>
        {fmtPct(row.changeRate, 0)}
      </span>
    ),
    sortValue: (row) => row.changeRate,
  },
];

const SKILL_COLUMNS: readonly TableColumn<HarnessSkillRow>[] = [
  { key: "id", label: "Skill", mono: true, render: (row) => row.id, sortValue: (row) => row.id },
  {
    key: "catalogTokens",
    label: "目录里占用",
    align: "right",
    render: (row) => fmtInt(row.catalogTokens),
    sortValue: (row) => row.catalogTokens,
  },
  {
    key: "listed",
    label: "出现在请求里",
    align: "right",
    render: (row) => fmtInt(row.listed),
    sortValue: (row) => row.listed,
  },
  {
    key: "skillReads",
    label: "读 SKILL.md",
    align: "right",
    render: (row) => danger(fmtInt(row.skillReads), row.skillReads === 0),
    sortValue: (row) => row.skillReads,
  },
  {
    key: "assetReads",
    label: "读附属文件",
    align: "right",
    render: (row) => fmtInt(row.assetReads),
    sortValue: (row) => row.assetReads,
  },
];

const COMPACTION_COLUMNS: readonly TableColumn<HarnessCompactionRecord>[] = [
  { key: "time", label: "时间", render: (row) => fmtDateTime(row.time), sortValue: (row) => row.time },
  {
    key: "trigger",
    label: "触发",
    render: (row) => `${triggerLabel(row.trigger)}${row.ok ? "" : " · 失败"}`,
    sortValue: (row) => row.trigger,
  },
  {
    key: "beforeTokens",
    label: "压缩前",
    align: "right",
    render: (row) => fmtTokens(row.beforeTokens),
    sortValue: (row) => row.beforeTokens,
  },
  {
    key: "afterTokens",
    label: "压缩后",
    align: "right",
    render: (row) => fmtTokens(row.afterTokens),
    sortValue: (row) => row.afterTokens,
  },
  {
    key: "durationMs",
    label: "耗时",
    align: "right",
    render: (row) => fmtDuration(row.durationMs),
    sortValue: (row) => row.durationMs,
  },
  {
    key: "rereads",
    label: "之后重读",
    align: "right",
    render: (row) => <span className={cn(row.rereads > 0 && "text-on-warning")}>{fmtInt(row.rereads)}</span>,
    sortValue: (row) => row.rereads,
  },
];

export function HarnessDetail({
  stats,
  tab,
  onTabChange,
  sort,
  onSortChange,
  flash,
}: {
  stats: HarnessStatsController;
  tab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  sort: TableSort;
  onSortChange: (sort: TableSort) => void;
  flash: boolean;
}) {
  const tools = stats.usageVs.data?.tools;
  const plugins = stats.plugins.data?.rows;
  const sources = stats.context.data?.sources;
  const skills = stats.usageVs.data?.skills;
  const compactions = stats.disclosure.data?.records;
  const counts: Record<DetailTab, number | undefined> = {
    tools: tools?.length,
    plugins: plugins?.length,
    sources: sources?.length,
    skills: skills?.length,
    compactions: compactions?.length,
  };
  const table = (() => {
    const common = { sort, onSortChange, pageSize: PAGE_SIZE };
    switch (tab) {
      case "tools":
        return tools ? (
          <DataTable ariaLabel="工具明细" columns={TOOL_COLUMNS} rows={tools} rowKey={(row) => row.name} {...common} />
        ) : null;
      case "plugins":
        return plugins ? (
          <DataTable
            ariaLabel="插件明细"
            columns={PLUGIN_COLUMNS}
            rows={plugins}
            rowKey={(row) => row.pluginId}
            {...common}
          />
        ) : null;
      case "sources":
        return sources ? (
          <DataTable
            ariaLabel="上下文来源明细"
            columns={SOURCE_COLUMNS}
            rows={sources}
            rowKey={(row) => row.key}
            {...common}
          />
        ) : null;
      case "skills":
        return skills ? (
          <DataTable
            ariaLabel="Skills 明细"
            columns={SKILL_COLUMNS}
            rows={skills}
            rowKey={(row) => row.id}
            {...common}
          />
        ) : null;
      case "compactions":
        return compactions ? (
          <DataTable
            ariaLabel="压缩记录"
            columns={COMPACTION_COLUMNS}
            rows={compactions}
            rowKey={(row) => row.id}
            empty="这段时间没有压缩"
            {...common}
          />
        ) : null;
    }
  })();
  const tabs = (Object.keys(DETAIL_LABEL) as DetailTab[]).map((value) => ({
    value,
    label: DETAIL_LABEL[value],
    count: counts[value],
  }));
  return (
    <DetailSection id="detail" flash={flash}>
      <UnderlineTabs<DetailTab>
        ariaLabel="Harness 明细"
        idPrefix="harness-detail"
        value={tab}
        tabs={tabs}
        onChange={onTabChange}
      />
      <div role="tabpanel" aria-labelledby={`harness-detail-tab-${tab}`} className="flex min-w-0 flex-col gap-2.5">
        {table ?? <EmptyState>正在读取…</EmptyState>}
      </div>
    </DetailSection>
  );
}
