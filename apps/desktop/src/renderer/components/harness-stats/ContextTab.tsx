import { HARNESS_FLAG_RULES, type HarnessSkillRow, type HarnessSourceRow, type HarnessStatsContext } from "@actspace/shared";
import { StackBar } from "./harness-stats-charts";
import { DASH, bucketSegments, fmtDay, fmtInt, fmtPct, fmtSignedPct, fmtTokens } from "./harness-stats-format";
import { Card, DataTable, Dash, EmptyNote, Grid, KvList, Meter, NameCell, Notice, SecHead, Stack, ToneText, TruncateValue, type Column } from "./harness-stats-ui";

const SOURCE_KIND_LABEL: Record<HarnessSourceRow["kind"], string> = {
  tools: "工具定义",
  skills: "Skills 列表",
  section: "提示词段落",
  supplement: "补充上下文",
  "model-facts": "模型信息",
  other: "其他",
};

const sourceColumns: Column<HarnessSourceRow>[] = [
  { key: "source", label: "来源", sortValue: (row) => row.id, render: (row) => <NameCell name={row.id} sub={`${SOURCE_KIND_LABEL[row.kind]}${row.owner ? ` · ${row.owner}` : ""}`} /> },
  { key: "appearances", label: "出现次数", numeric: true, sortValue: (row) => row.appearances, render: (row) => fmtInt(row.appearances) },
  { key: "avg", label: "平均 token", numeric: true, sortValue: (row) => row.avgTokens, render: (row) => fmtInt(row.avgTokens) },
  { key: "max", label: "最大 token", numeric: true, sortValue: (row) => row.maxTokens, render: (row) => fmtInt(row.maxTokens) },
  {
    key: "change", label: "内容变化频率", numeric: true,
    sortValue: (row) => row.changeRate,
    render: (row) => (row.changeRate == null ? <Dash /> : <Meter value={row.changeRate} max={1} label={fmtPct(row.changeRate)} warn={row.changeRate > HARNESS_FLAG_RULES.contextChurn.minChangeRate && row.appearances >= HARNESS_FLAG_RULES.contextChurn.minAppearances} />),
  },
];

const skillColumns: Column<HarnessSkillRow>[] = [
  { key: "skill", label: "Skill", sortValue: (row) => row.id, render: (row) => <NameCell name={row.id} sub={row.source ?? undefined} /> },
  { key: "listed", label: "列出次数", numeric: true, sortValue: (row) => row.listed, render: (row) => fmtInt(row.listed) },
  { key: "selected", label: "被选用", numeric: true, sortValue: (row) => row.selected, render: (row) => fmtInt(row.selected) },
  { key: "reads", label: "读取 SKILL.md", numeric: true, sortValue: (row) => row.skillReads, render: (row) => (row.skillReads ? fmtInt(row.skillReads) : <ToneText tone="warn">0</ToneText>) },
  { key: "assets", label: "读附属文件", numeric: true, sortValue: (row) => row.assetReads, render: (row) => fmtInt(row.assetReads) },
  { key: "last", label: "最后使用", numeric: true, render: (row) => <span className="text-text-muted">{fmtDay(row.lastReadAt)}</span> },
];

export function ContextTab({ data }: { data: HarnessStatsContext }) {
  const runtimeChurn = data.requests > 0 && data.cache.runtimeChanges / data.requests > HARNESS_FLAG_RULES.contextChurn.minChangeRate;
  return (
    <Stack>
      {data.incompleteRequests > 0 ? <Notice tone="info">共 {fmtInt(data.requests)} 次请求，其中 {fmtInt(data.incompleteRequests)} 次缺少完整的上下文记录，未计入下面的平均值。</Notice> : null}
      <Card title="平均每次请求的上下文" hint="6 类 · 估算 token">
        <StackBar segments={bucketSegments(data.buckets)} label="平均每次请求的上下文构成" />
      </Card>
      <Grid cols={3}>
        <Card title="窗口占用">
          <KvList rows={[
            { label: "中位数", value: fmtPct(data.window.p50, 0) },
            { label: "P95", value: fmtPct(data.window.p95, 0) },
            { label: "超过阈值（触发压缩）", value: `${fmtInt(data.window.overThreshold)} 次` },
          ]} />
        </Card>
        <Card title="估算准确度" hint={data.estimate.samples ? `${fmtInt(data.estimate.samples)} 个样本` : undefined}>
          <KvList rows={[
            { label: "估算 vs 实际", value: fmtSignedPct(data.estimate.deltaRate) },
            { label: "偏差最大的模型", value: data.estimate.worstModel ? <TruncateValue text={data.estimate.worstModel} suffix={`（${fmtSignedPct(data.estimate.worstDeltaRate)}）`} /> : DASH },
          ]} />
        </Card>
        <Card title="缓存命中率">
          <KvList rows={[
            { label: "整体", value: fmtPct(data.cache.hitRate) },
            { label: "系统提示词变化", value: `${fmtInt(data.cache.systemChanges)} 次` },
            { label: "运行环境变化", value: `${fmtInt(data.cache.runtimeChanges)} 次`, tone: runtimeChurn ? "warn" : undefined },
          ]} />
        </Card>
      </Grid>
      <SecHead title="上下文来源" />
      <DataTable ariaLabel="上下文来源" columns={sourceColumns} rows={data.sources} rowKey={(row) => row.key} defaultSort={{ key: "avg", dir: -1 }} minWidth={640} empty={<EmptyNote>所选范围内没有上下文来源记录</EmptyNote>} />
      <SecHead title="Skills" hint={`列表本身每次请求占 ${data.skillsCatalogTokens == null ? DASH : fmtTokens(data.skillsCatalogTokens)} token · ${data.skills.length} 个 skill`} />
      <DataTable ariaLabel="Skills" columns={skillColumns} rows={data.skills} rowKey={(row) => row.id} defaultSort={{ key: "reads", dir: -1 }} minWidth={600} empty={<EmptyNote>没有 skill 记录</EmptyNote>} />
    </Stack>
  );
}
