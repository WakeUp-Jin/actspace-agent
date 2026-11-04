import { subagentKindLabel, type HarnessStatsRuntime } from "@actspace/shared";
import { Histogram } from "./harness-stats-charts";
import { DASH, TURN_STEPS_LABELS, fmtDuration, fmtInt, fmtPct, fmtTokens, ratio } from "./harness-stats-format";
import { Card, EmptyNote, Grid, KvList, Metric, MetricGrid, SecHead, Stack, type KvRow } from "./harness-stats-ui";

/** `actspace.subagent.<preset|kind>`（新会话）或老会话的 `explore` / `agent`，转成和界面其他地方一致的种类词。 */
function presetLabel(presetId: string): string {
  const key = presetId.replace(/^actspace\.subagent\./, "").replace(/^actspace\./, "");
  switch (key) {
    case "general": return subagentKindLabel({ subagentKind: "local", preset: "general" });
    case "explore": return subagentKindLabel({ subagentKind: "local", preset: "explore" });
    case "fork": case "codex": case "claude-code": return subagentKindLabel({ subagentKind: key });
    case "agent": return subagentKindLabel({ agentKind: "agent" });
    default: return key;
  }
}

function joinTop(items: readonly { readonly label: string; readonly count: number }[], limit = 3): string | undefined {
  const sorted = [...items].filter((item) => item.count > 0).sort((a, b) => b.count - a.count).slice(0, limit);
  return sorted.length ? sorted.map((item) => `${item.label} ${fmtInt(item.count)}`).join(" · ") : undefined;
}

export function RuntimeTab({ data }: { data: HarnessStatsRuntime }) {
  const ends = data.endReasons;
  const endTotal = ends.completed + ends.aborted + ends.failed + ends.stepLimit + ends.other;
  const interventionTotal = data.interventions.aborted + data.interventions.steering + data.interventions.queued;
  const lastSteps = data.stepsHistogram.length - 1;
  const delegations = data.delegations;
  const background = data.background;
  const delegationTotal = delegations.byPreset.reduce((sum, item) => sum + item.count, 0);
  const auxiliaryCalls = data.auxiliary.reduce((sum, item) => sum + item.calls, 0);
  const endRows: KvRow[] = [
    { label: "正常完成", value: fmtPct(ratio(ends.completed, endTotal)) },
    { label: "用户中止", value: fmtPct(ratio(ends.aborted, endTotal)) },
    { label: "出错", value: fmtPct(ratio(ends.failed, endTotal)) },
    { label: "碰到步数上限", value: fmtPct(ratio(ends.stepLimit, endTotal)), tone: ends.stepLimit > 0 ? "warn" : undefined },
    ...(ends.other ? [{ label: "其他", value: fmtPct(ratio(ends.other, endTotal)) }] : []),
  ];
  if (data.turns === 0) return <EmptyNote>所选范围内没有运行记录。</EmptyNote>;
  return (
    <Stack>
      <SecHead title="Agent 循环" />
      <MetricGrid label="运行指标">
        <Metric label="轮数" value={fmtInt(data.turns)} detail={`平均 ${data.avgSteps == null ? DASH : data.avgSteps.toFixed(1)} 步 / 轮`} />
        <Metric label="碰到步数上限" value={fmtInt(data.stepLimitHits)} detail={`占 ${fmtPct(ratio(data.stepLimitHits, data.turns))} 的轮`} />
        <Metric label="模型重试" value={fmtInt(data.retries.total)} detail={joinTop(data.retries.byCode.map((item) => ({ label: item.code, count: item.count })))} />
        <Metric label="用户介入" value={fmtInt(interventionTotal)} detail={`中止 ${fmtInt(data.interventions.aborted)} · 插入引导 ${fmtInt(data.interventions.steering)} · 排队 ${fmtInt(data.interventions.queued)}`} />
      </MetricGrid>
      <Grid cols={2}>
        <Card title="每轮步数">
          <Histogram
            label="每轮步数直方图"
            values={data.stepsHistogram}
            labels={TURN_STEPS_LABELS}
            warnIndexes={data.stepLimitHits > 0 ? [lastSteps] : []}
            tooltip={(index, value) => `${TURN_STEPS_LABELS[index]} 步\n${fmtInt(value)} 轮`}
          />
        </Card>
        <Card title="一轮因为什么结束"><KvList rows={endRows} /></Card>
      </Grid>
      <Grid cols={3}>
        <Card title="子 Agent">
          <KvList rows={[
            ...(delegations.byPreset.length
              ? delegations.byPreset.map((item) => ({ label: presetLabel(item.presetId), value: `${fmtInt(item.count)} 次 · 平均 ${fmtDuration(item.avgDurationMs)}` }))
              : [{ label: "委派次数", value: fmtInt(delegationTotal) }]),
            { label: "失败", value: fmtInt(delegations.failed) },
            { label: "平均步数", value: delegations.avgSteps == null ? DASH : delegations.avgSteps.toFixed(1) },
            { label: "平均耗时", value: fmtDuration(delegations.avgDurationMs) },
            { label: "交回主会话", value: delegations.avgReturnTokens == null ? DASH : `平均 ${fmtTokens(delegations.avgReturnTokens)} token` },
          ]} />
        </Card>
        <Card title="后台任务">
          <KvList rows={[
            { label: background.byKind.length ? background.byKind.map((item) => item.kind).join(" / ") : "启动次数", value: background.byKind.length ? background.byKind.map((item) => fmtInt(item.count)).join(" / ") : "0" },
            { label: "完成 / 失败 / 停止", value: `${fmtInt(background.completed)} / ${fmtInt(background.failed)} / ${fmtInt(background.stopped)}` },
            { label: "平均耗时", value: fmtDuration(background.avgDurationMs) },
            { label: "没人读输出", value: fmtInt(background.unread), tone: background.unread > 0 ? "warn" : undefined },
          ]} />
        </Card>
        <Card title="侧边对话 · 模式">
          <KvList rows={[
            { label: "侧边对话", value: `${fmtInt(data.sideChats.sessions)} 个${data.sideChats.avgTurns == null ? "" : ` · 平均 ${data.sideChats.avgTurns.toFixed(1)} 条`}` },
            { label: "模式切换", value: `${fmtInt(data.modeSwitches)} 次` },
            { label: data.modeShare.length ? data.modeShare.map((item) => item.mode).join(" / ") : "模式占比", value: modeShareText(data) },
            { label: "辅助模型调用", value: fmtInt(auxiliaryCalls) },
          ]} />
        </Card>
      </Grid>
      {data.auxiliary.length > 0 ? (
        <Card title="辅助模型调用" hint="标题生成、压缩摘要等不属于主循环的调用">
          <KvList rows={[...data.auxiliary].sort((a, b) => b.calls - a.calls).map((item) => ({
            label: <span className="font-mono text-act-xs">{item.purpose}</span>,
            value: `${fmtInt(item.calls)} 次${item.failed ? ` · ${fmtInt(item.failed)} 失败` : ""} · 平均 ${fmtDuration(item.avgMs)}`,
            tone: item.failed > 0 ? "warn" as const : undefined,
          }))} />
        </Card>
      ) : null}
    </Stack>
  );
}

function modeShareText(data: HarnessStatsRuntime): string {
  const total = data.modeShare.reduce((sum, item) => sum + item.requests, 0);
  return total ? data.modeShare.map((item) => fmtPct(item.requests / total, 0)).join(" / ") : DASH;
}
