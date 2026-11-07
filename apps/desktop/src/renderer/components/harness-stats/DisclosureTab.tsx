import { HARNESS_ACTIVE_PATH_LIMIT, type HarnessStatsDisclosure } from "@actspace/shared";
import { Histogram } from "./harness-stats-charts";
import { ACTIVE_HISTOGRAM_LABELS, DASH, SLEEP_HISTOGRAM_LABELS, STEPS_BETWEEN_LABELS, fmtDuration, fmtInt, fmtPct, fmtTokens } from "./harness-stats-format";
import { Card, EmptyNote, Grid, KvList, Metric, MetricGrid, SecHead, Stack } from "./harness-stats-ui";

export function DisclosureTab({ data }: { data: HarnessStatsDisclosure }) {
  const c = data.compaction;
  const ratio = c.avgBeforeTokens && c.avgAfterTokens != null ? 1 - c.avgAfterTokens / c.avgBeforeTokens : null;
  const failureText = c.failureReasons.length ? [...c.failureReasons].sort((a, b) => b.count - a.count).map((item) => `${item.code} ${item.count}`).join(" · ") : "无";
  const lastActive = data.activeHistogram.length - 1;
  return (
    <Stack>
      <SecHead title="活跃 / 睡眠路径" hint={`${fmtInt(data.cycles)} 个周期`} />
      <MetricGrid label="披露指标">
        <Metric label="活跃命中率" value={fmtPct(data.activeHitRate)} />
        <Metric label="睡眠唤醒" value={`${fmtInt(data.sleepingReads)} 次`} detail={`占睡眠路径 ${fmtPct(data.wakeShare)} · 平均睡 ${data.avgSleepCycles == null ? DASH : data.avgSleepCycles.toFixed(1)} 个周期`} />
        <Metric label="误睡" value={fmtPct(data.misSleepRate)} />
        <Metric
          label="索引占用"
          value={data.indexTokensAvg == null ? DASH : `${fmtInt(data.indexTokensAvg)} token`}
          detail={`查索引 ${fmtInt(data.indexReads)} 次 · 之后读了索引里的文件 ${fmtInt(data.indexConversions)} 次`}
        />
      </MetricGrid>
      <Grid cols={2}>
        <Card title="每个周期的活跃路径数" hint={`上限 ${HARNESS_ACTIVE_PATH_LIMIT} · 碰到 ${fmtInt(data.capHits)} 次`}>
          <Histogram
            label="每个周期的活跃路径数直方图"
            values={data.activeHistogram}
            labels={ACTIVE_HISTOGRAM_LABELS}
            warnIndexes={data.capHits > 0 ? [lastActive] : []}
            tooltip={(index, value) => `${index === lastActive ? `${HARNESS_ACTIVE_PATH_LIMIT} 条（碰到上限）` : `${ACTIVE_HISTOGRAM_LABELS[index]} 条`}活跃路径\n${fmtInt(value)} 个周期`}
          />
        </Card>
        <Card title="唤醒前睡了几个周期">
          <Histogram
            label="唤醒前睡眠周期数直方图"
            values={data.sleepHistogram}
            labels={SLEEP_HISTOGRAM_LABELS}
            warnIndexes={[0]}
            tooltip={(index, value) => `睡 ${SLEEP_HISTOGRAM_LABELS[index]} 个周期后唤醒\n${fmtInt(value)} 次${index === 0 ? "（误睡）" : ""}`}
          />
        </Card>
      </Grid>
      {data.topPaths.length > 0 ? (
        <Card title="读取最多的睡眠路径" hint={`前 ${data.topPaths.length} 个`}>
          <KvList rows={data.topPaths.map((item) => ({ label: <span className="break-all font-mono text-act-xs">{item.path}</span>, value: `${fmtInt(item.reads)} 次` }))} />
        </Card>
      ) : null}
      <SecHead title="压缩" />
      {c.count === 0 ? <EmptyNote>所选范围内没有发生压缩。</EmptyNote> : null}
      <MetricGrid label="压缩指标">
        <Metric label="压缩次数" value={fmtInt(c.count)} detail={`自动 ${fmtInt(c.auto)} · 手动 ${fmtInt(c.manual)} · 失败 ${fmtInt(c.failed)}`} />
        <Metric label="压缩比" value={fmtPct(ratio)} detail={c.avgBeforeTokens != null && c.avgAfterTokens != null ? `平均 ${fmtTokens(c.avgBeforeTokens)} → ${fmtTokens(c.avgAfterTokens)} token` : undefined} />
        <Metric label="平均耗时" value={c.avgDurationMs == null ? DASH : fmtDuration(c.avgDurationMs)} detail={c.avgAfterTokens != null ? `压缩后平均 ${fmtTokens(c.avgAfterTokens)} token` : undefined} />
        <Metric label="压缩后重读" value={fmtPct(c.rereadRate)} />
      </MetricGrid>
      <Grid cols={2}>
        <Card title="两次压缩之间隔了几步">
          <Histogram
            label="两次压缩间隔步数直方图"
            values={c.stepsBetweenHistogram}
            labels={STEPS_BETWEEN_LABELS}
            tooltip={(index, value) => `${STEPS_BETWEEN_LABELS[index]} 步\n${fmtInt(value)} 次`}
          />
        </Card>
        <Card title="压缩拿掉与失败">
          <KvList rows={[
            { label: "触发时窗口占用（中位数）", value: fmtPct(c.triggerWindowP50, 0) },
            { label: "压缩拿掉的工具输出", value: `${fmtInt(c.foldedOutputs)} 次 · ${fmtTokens(c.foldedTokens)} token` },
            { label: "失败原因", value: failureText },
          ]} />
        </Card>
      </Grid>
    </Stack>
  );
}
