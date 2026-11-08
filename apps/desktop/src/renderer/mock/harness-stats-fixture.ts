import type {
  HarnessCompactionRecord,
  HarnessFlag,
  HarnessPluginRow,
  HarnessPluginSource,
  HarnessRevisionInfo,
  HarnessRevisionMetrics,
  HarnessSkillRow,
  HarnessSourceRow,
  HarnessStatsContext,
  HarnessStatsData,
  HarnessStatsDisclosure,
  HarnessStatsFilter,
  HarnessStatsOptions,
  HarnessStatsOverview,
  HarnessStatsPlugins,
  HarnessStatsQueryInput,
  HarnessStatsQueryResult,
  HarnessStatsSyncStatus,
  HarnessStatsUsageVs,
  HarnessStatsVersions,
  HarnessToolRow,
  HarnessUsagePluginRow,
} from "@actspace/shared";

/**
 * 浏览器 mock 下「Harness 统计」页的数据，取自已确认的 demo 第 4 版
 * （docs/design-docs/frontend/stats-redesign-demo.html：30 天、主会话、版本 @12、3,842 次请求）。
 * 时间范围和会话类型按比例缩放计数；版本筛选决定指标卡看哪个版本；其余筛选不影响数据。
 * `?mock=harness-stats` 直接打开到这个页面（见 components/harness-stats/dev-start.ts）。
 */
export const MOCK_HARNESS_STATS_SYNC: HarnessStatsSyncStatus = { phase: "idle", completedSessions: 0, totalSessions: 0, eventsRead: 0, dataVersion: 1, failedSessions: 0 };

const HARNESS_ID = "default";
const REQUESTS = 3842;
const WINDOW = 200_000;
const HOUR_MS = 3_600_000;
const hoursAgoIso = (hours: number) => new Date(Date.now() - hours * HOUR_MS).toISOString();

function scaleOf(filter: HarnessStatsFilter): number {
  const range = { day: 1 / 30, week: 7 / 30, month: 1, total: 2.6 }[filter.range];
  const session = { main: 1, child: 0.22, side: 0.06, all: 1.3 }[filter.sessionKind];
  return range * session;
}
/** 插件运行时只按时间和版本统计。 */
const rangeScale = (filter: HarnessStatsFilter) => ({ day: 1 / 30, week: 7 / 30, month: 1, total: 2.6 }[filter.range]);

/* ------------------------------------------------------------ 版本 */

type VersionSeed = { requests: number; ctx: number; over: number; fail: number; dup: number; trunc: number; brk: number; reread: number; discHit: number; plugins: number };
const VERSION_SEED: ReadonlyArray<readonly [number, VersionSeed]> = [
  [10, { requests: 1904, ctx: 53.9, over: 22.6, fail: 0.052, dup: 0.047, trunc: 0.081, brk: 0.142, reread: 0.21, discHit: 0.64, plugins: 16 }],
  [11, { requests: 2638, ctx: 51.3, over: 20.9, fail: 0.048, dup: 0.041, trunc: 0.074, brk: 0.131, reread: 0.18, discHit: 0.67, plugins: 17 }],
  [12, { requests: 1204, ctx: 48.2, over: 18.4, fail: 0.041, dup: 0.032, trunc: 0.066, brk: 0.098, reread: 0.12, discHit: 0.71, plugins: 18 }],
];
const keyOf = (revision: number) => `${HARNESS_ID}@${revision}`;
const CURRENT_REVISION = keyOf(12);
const DESCRIPTIONS: Record<number, string> = { 10: "工具描述精简前", 11: "规则拆分、environment 每轮注入", 12: "工具描述精简，按需加载 notebook" };

/** 新版本在前，与主进程一致。 */
function revisions(scale: number): HarnessRevisionInfo[] {
  return VERSION_SEED.map(([revision, seed], index) => ({
    key: keyOf(revision),
    harnessId: HARNESS_ID,
    revision,
    description: DESCRIPTIONS[revision] ?? null,
    firstSeenAt: hoursAgoIso((3 - index) * 24 * 9),
    lastSeenAt: hoursAgoIso((2 - index) * 24 * 9 + 1),
    requests: Math.round(seed.requests * scale),
  })).reverse();
}

function metricsFor(key: string, scale: number): HarnessRevisionMetrics | null {
  const seed = VERSION_SEED.find(([revision]) => keyOf(revision) === key)?.[1];
  if (!seed) return null;
  const share = seed.requests / VERSION_SEED[2]![1].requests;
  const sc = (value: number) => Math.round(value * scale * share);
  return {
    requests: Math.round(seed.requests * scale),
    avgContextTokens: seed.ctx * 1000,
    fixedOverheadTokens: seed.over * 1000,
    avgContextWindow: WINDOW,
    cacheBrokenRate: seed.brk,
    cacheHitBroken: 0.41,
    cacheHitOther: 0.89,
    toolCalls: sc(4216),
    toolFailureRate: seed.fail,
    topFailedTool: { name: "bash", failed: sc(171) },
    repeatRate: seed.dup,
    truncateRate: seed.trunc,
    compactions: sc(14),
    rereadRate: seed.reread,
    foldedTokens: sc(3.1e6),
    activeHitRate: seed.discHit,
    plugins: seed.plugins,
  };
}

/* ------------------------------------------------------------ 工具、插件、Skills */

// [工具, 插件, 调用, 定义 token, 失败率, 输出截断, 同参数重复]
const TOOL_SEED: ReadonlyArray<readonly [string, string, number, number, number, number, number]> = [
  ["bash", "shell", 3214, 1100, 0.053, 212, 96],
  ["read_file", "filesystem-read", 463, 420, 0.013, 38, 11],
  ["edit_file", "filesystem-write", 235, 610, 0.038, 0, 3],
  ["write_file", "filesystem-write", 67, 380, 0, 0, 0],
  ["read_image", "filesystem-read", 56, 240, 0, 0, 0],
  ["spawn_agent", "subagent", 42, 890, 0.048, 0, 1],
  ["list_agents", "subagent", 34, 220, 0, 0, 6],
  ["todo_write", "todo", 33, 770, 0, 0, 0],
  ["grep", "filesystem-read", 28, 450, 0.036, 4, 2],
  ["task_output", "background", 18, 260, 0, 0, 4],
  ["web_fetch", "web", 12, 520, 0.25, 3, 0],
  ["glob", "filesystem-read", 9, 300, 0, 0, 0],
  ["web_search", "web", 4, 480, 0, 0, 0],
  ["plugin_manager", "plugin-manager", 2, 1350, 0.5, 0, 0],
  ["notebook_edit", "notebook", 0, 650, 0, 0, 0],
];
const FAILURE_CODES: Record<string, ReadonlyArray<readonly [string, number]>> = {
  bash: [["exit-nonzero", 0.83], ["timeout", 0.12], ["denied", 0.05]],
  edit_file: [["no-match", 0.7], ["not-found", 0.3]],
  web_fetch: [["http-4xx", 0.67], ["timeout", 0.33]],
};
const PLUGIN_SOURCE: Record<string, HarnessPluginSource> = { notebook: "user", "review-helper": "evolved" };
const sourceOf = (pluginId: string): HarnessPluginSource => PLUGIN_SOURCE[pluginId] ?? "builtin";

function toolRows(scale: number): HarnessToolRow[] {
  const requests = Math.round(REQUESTS * scale);
  return TOOL_SEED.map(([name, pluginId, calls, tokens, failureRate, truncated, repeated]) => {
    const scaled = Math.round(calls * scale);
    const failed = Math.round(scaled * failureRate);
    return {
      name,
      pluginId,
      exposures: requests,
      calls: scaled,
      failed,
      failureCodes: (FAILURE_CODES[name] ?? []).map(([code, share]) => ({ code, count: Math.round(failed * share) })).filter((item) => item.count > 0),
      schemaTokens: tokens,
      truncated: Math.round(truncated * scale),
      repeated: Math.round(repeated * scale),
    };
  });
}

function usagePlugins(tools: readonly HarnessToolRow[], scale: number): HarnessUsagePluginRow[] {
  const map = new Map<string, { -readonly [K in keyof HarnessUsagePluginRow]: HarnessUsagePluginRow[K] }>();
  for (const tool of tools) {
    const id = tool.pluginId ?? "unknown";
    const row = map.get(id) ?? { pluginId: id, source: sourceOf(id), tools: [], calls: 0, failed: 0, schemaTokens: 0, exposures: 0 };
    row.tools = [...row.tools, tool.name];
    row.calls += tool.calls;
    row.failed += tool.failed;
    row.schemaTokens = (row.schemaTokens ?? 0) + (tool.schemaTokens ?? 0);
    row.exposures = Math.max(row.exposures, tool.exposures);
    map.set(id, row);
  }
  map.set("review-helper", { pluginId: "review-helper", source: "evolved", tools: ["review_diff"], calls: Math.round(12 * scale), failed: 0, schemaTokens: 380, exposures: Math.round(REQUESTS * scale) });
  return [...map.values()];
}

// [Skill, 目录里占用, 读 SKILL.md, 读附属文件]
const SKILL_SEED: ReadonlyArray<readonly [string, number, number, number]> = [
  ["baoyu-design", 320, 3, 7],
  ["meeting-task-agent", 280, 1, 2],
  ["office-pptx", 310, 1, 4],
  ["office-docx", 300, 1, 0],
  ["office-xlsx", 300, 1, 0],
  ["pdf-reader", 290, 0, 0],
];

function skillRows(scale: number): HarnessSkillRow[] {
  return SKILL_SEED.map(([id, tokens, reads, assets], index) => ({
    id,
    source: "用户",
    listed: Math.round(REQUESTS * scale),
    catalogTokens: tokens,
    skillReads: Math.round(reads * scale) || (reads ? 1 : 0),
    assetReads: Math.round(assets * scale),
    lastReadAt: reads ? hoursAgoIso(6 + index * 20) : null,
  }));
}

function usageVs(scale: number): HarnessStatsUsageVs {
  const tools = toolRows(scale);
  return { requests: Math.round(REQUESTS * scale), tools, plugins: usagePlugins(tools, scale), skills: skillRows(scale) };
}

/* ------------------------------------------------------------ 上下文 */

// [类别, 平均 k token, 来源：[id, k token, 变化率 %]]
const CONTEXT_SEED: ReadonlyArray<readonly [string, number, ReadonlyArray<readonly [string, number, number, HarnessSourceRow["kind"]]>]> = [
  ["systemPrompt", 4.1, [["core/system-prompt", 3.6, 0, "section"], ["core/model-facts", 0.5, 4, "model-facts"]]],
  ["tools", 9.8, [["tools · shell", 1.4, 0, "tools"], ["tools · filesystem-write", 1.6, 0, "tools"], ["tools · plugin-manager", 1.4, 0, "tools"], ["tools · subagent", 1.4, 2, "tools"], ["tools · filesystem-read", 1.2, 0, "tools"], ["tools · 其他 6 个插件", 2.8, 1, "tools"]]],
  ["rules", 2.6, [["AGENTS.md", 1.8, 1, "supplement"], ["environment", 0.3, 61, "supplement"], ["context/active-paths", 0.5, 34, "supplement"]]],
  ["skills", 1.9, [["core/skills-catalog", 1.9, 3, "skills"]]],
  ["summarizedConversation", 3.2, [["compaction/summary", 3.2, 9, "other"]]],
  ["conversation", 26.6, [["用户消息", 2.1, 100, "other"], ["模型回复", 6.4, 100, "other"], ["工具结果", 18.1, 100, "other"]]],
];
export const MOCK_CHURN_SOURCE_KEY = "rules:environment";

function context(scale: number): HarnessStatsContext {
  const requests = Math.round(REQUESTS * scale);
  return {
    requests,
    buckets: CONTEXT_SEED.map(([bucket, avg]) => ({ bucket, avgTokens: avg * 1000 })),
    avgEstimatedTokens: CONTEXT_SEED.reduce((sum, [, avg]) => sum + avg, 0) * 1000,
    sources: CONTEXT_SEED.flatMap(([bucket, , sources]) => sources.map(([id, avg, change, kind]) => ({
      key: `${bucket}:${id}`,
      kind,
      bucket,
      owner: kind === "tools" ? id.replace("tools · ", "") : null,
      id,
      appearances: requests,
      avgTokens: avg * 1000,
      // 对话每次都变，不算变化率。
      changeRate: bucket === "conversation" ? null : change / 100,
    }))),
  };
}

/* ------------------------------------------------------------ 披露与压缩 */

const TOP_PATHS: ReadonlyArray<readonly [string, number]> = [
  ["packages/util/shared/src/harness-stats.ts", 84],
  ["apps/desktop/src/renderer/components/harness-stats/HarnessStatsPage.tsx", 61],
  ["docs/design-docs/自进化的方案设计/11-Harness统计设计.md", 47],
  ["AGENTS.md", 32],
  ["apps/desktop/src/main/runtime-v2/harness-stats-query.ts", 29],
  ["docs/design-docs/frontend/front-统计页规范.md", 24],
  ["apps/desktop/src/renderer/components/stats/stats-ui.tsx", 21],
  ["packages/agent-core/src/context/engine.ts", 17],
  ["apps/desktop/src/renderer/styles/stats.css", 12],
  ["package.json", 9],
  ["README.md", 4],
];

function compactionRecords(count: number): HarnessCompactionRecord[] {
  return Array.from({ length: count }, (_, index) => {
    const before = (170 + ((index * 13) % 40)) * 1000;
    return {
      id: `compaction-${index + 1}`,
      time: hoursAgoIso(2 + index * 7),
      trigger: index % 6 === 5 ? "manual" : "auto",
      ok: true,
      failureCode: null,
      beforeTokens: before,
      afterTokens: (28 + ((index * 7) % 9)) * 1000,
      durationMs: (30 + ((index * 11) % 20)) * 1000,
      rereads: index === 1 ? 3 : (index * 3) % 4 === 3 ? 1 : 0,
    };
  });
}

function disclosure(scale: number): HarnessStatsDisclosure {
  const sc = (value: number) => Math.round(value * scale);
  const count = sc(14);
  return {
    cycles: sc(203),
    activeHitRate: 0.71,
    misSleepRate: 0.041,
    indexConversionRate: 0.62,
    capHits: Math.min(3, sc(3)),
    activeHistogram: [4, 9, 18, 31, 44, 39, 27, 15, 8, 5, 3].map(sc),
    sleepHistogram: [41, 22, 14, 8, 5, 11].map(sc),
    topPaths: TOP_PATHS.map(([path, reads]) => ({ path, reads: sc(reads) })).filter((item) => item.reads > 0),
    compaction: {
      count,
      auto: count - Math.min(count, sc(2)),
      manual: Math.min(count, sc(2)),
      failed: 0,
      avgBeforeTokens: count ? 182_000 : null,
      avgAfterTokens: count ? 31_000 : null,
      avgDurationMs: count ? 38_000 : null,
      rereadRate: count ? 0.12 : null,
      triggerWindowP50: count ? 0.78 : null,
      avgStepsBetween: count > 1 ? 31 : null,
      foldedOutputs: sc(1204),
      foldedTokens: sc(3.1e6),
    },
    records: compactionRecords(count),
  };
}

/* ------------------------------------------------------------ 插件运行时 */

// [插件, 工具数, 工具调用, 占上下文]
const PLUGIN_SEED: ReadonlyArray<readonly [string, number, number, number]> = [
  ["shell", 3, 3249, 1400],
  ["filesystem-read", 4, 556, 1410],
  ["filesystem-write", 2, 302, 990],
  ["subagent", 2, 76, 1110],
  ["todo", 1, 33, 770],
  ["background", 1, 18, 260],
  ["web", 2, 16, 1000],
  ["plugin-manager", 1, 2, 1350],
  ["notebook", 1, 0, 650],
  ["review-helper", 1, 12, 380],
];
const LOAD_ERROR = "缺少服务 actspace.review";

function plugins(filter: HarnessStatsFilter): HarnessStatsPlugins {
  const sessionScale = scaleOf(filter);
  const sc = (value: number) => Math.round(value * rangeScale(filter));
  const rows: HarnessPluginRow[] = PLUGIN_SEED.map(([pluginId, tools, calls, tokens]) => ({
    pluginId,
    source: sourceOf(pluginId),
    tools,
    toolCalls: Math.round(calls * sessionScale),
    contextTokens: tokens,
    loads: Math.max(1, sc(14)),
    loadFailures: pluginId === "review-helper" ? 1 : 0,
    lastLoadError: pluginId === "review-helper" ? LOAD_ERROR : null,
  }));
  return {
    rows,
    services: [
      { providerPluginId: "core", service: "session", method: "append", calls: sc(41_200), errors: 0, p95Ms: 2 },
      { providerPluginId: "core", service: "tools.runtime", method: "execute", calls: sc(4400), errors: sc(12), p95Ms: 8100 },
      { providerPluginId: "context-engine", service: "context", method: "estimate", calls: sc(3800), errors: 0, p95Ms: 16 },
      { providerPluginId: "sandbox", service: "sandbox", method: "exec", calls: sc(3200), errors: sc(4), p95Ms: 7600 },
      { providerPluginId: "notebook", service: "notebook.kernel", method: "", calls: 0, errors: 0, p95Ms: null },
      { providerPluginId: "web", service: "web.cache", method: "", calls: 0, errors: 0, p95Ms: null },
      { providerPluginId: "plugin-manager", service: "plugins.registry", method: "", calls: 0, errors: 0, p95Ms: null },
    ],
    listeners: [
      { pluginId: "harness-stats", event: "*", calls: sc(52_000), errors: 0 },
      { pluginId: "auto-review", event: "tool/call", calls: sc(4400), errors: 0 },
      { pluginId: "context-engine", event: "request/before", calls: sc(3842), errors: 0 },
    ],
    loadP50Ms: 32,
    runtimeEmpty: false,
  };
}

/* ------------------------------------------------------------ 值得关注、总览、版本 */

function flags(scale: number): HarnessFlag[] {
  const calls = Math.round(3214 * scale);
  const failed = Math.round(calls * 0.053);
  return [
    { rule: "tool-costly-unused", level: "warn", title: "notebook_edit 占用高、使用少", detail: `定义约 650 token，出现在 ${Math.round(REQUESTS * scale).toLocaleString("zh-CN")} 次请求里，只调用 0 次（0.0%）`, category: "占用 vs 使用", target: { card: "usage-vs", tab: "tools", key: "notebook_edit" } },
    { rule: "plugin-load-failure", level: "error", title: "插件加载失败：review-helper", detail: `自进化插件，最近一次失败：${LOAD_ERROR}。`, category: "插件运行时", target: { card: "runtime", tab: "load", key: "review-helper" } },
    { rule: "tool-failure-rate", level: "error", title: "工具失败率高：bash 5.3%", detail: `${calls.toLocaleString("zh-CN")} 次调用里失败 ${failed} 次，大多是退出码非 0。`, category: "工具明细", target: { card: "detail", tab: "tools", key: "bash" } },
    { rule: "context-churn", level: "info", title: "上下文来源变化频繁：environment", detail: "61% 的请求里内容和上一次不同，会让缓存失效。", category: "上下文来源", target: { card: "sources", tab: "rules", key: MOCK_CHURN_SOURCE_KEY } },
  ];
}

function overview(filter: HarnessStatsFilter, scale: number): HarnessStatsOverview {
  const list = revisions(scale);
  const current = filter.revision ?? list[0]!.key;
  const index = list.findIndex((item) => item.key === current);
  const previous = index >= 0 ? list[index + 1]?.key ?? null : null;
  return { flags: flags(scale), current, previous, metrics: metricsFor(current, scale), previousMetrics: previous ? metricsFor(previous, scale) : null };
}

function versions(input: HarnessStatsQueryInput, scale: number): HarnessStatsVersions {
  const to = input.compare?.to ?? keyOf(12);
  const from = input.compare?.from ?? keyOf(11);
  return { revisions: revisions(scale), from, to, fromMetrics: metricsFor(from, scale), toMetrics: metricsFor(to, scale) };
}

function options(): HarnessStatsOptions {
  return { modes: ["default", "plan", "auto"], models: ["claude-sonnet-5-5", "claude-opus-5-5", "gpt-5.2"], revisions: revisions(2.6 * 1.3), currentRevision: CURRENT_REVISION };
}

function dataFor(input: HarnessStatsQueryInput): HarnessStatsData {
  const scale = scaleOf(input.filter);
  switch (input.kind) {
    case "options": return { kind: "options", value: options() };
    case "overview": return { kind: "overview", value: overview(input.filter, scale) };
    case "usage-vs": return { kind: "usage-vs", value: usageVs(scale) };
    case "context": return { kind: "context", value: context(scale) };
    case "disclosure": return { kind: "disclosure", value: disclosure(scale) };
    case "plugins": return { kind: "plugins", value: plugins(input.filter) };
    case "versions": return { kind: "versions", value: versions(input, scale) };
  }
}

export async function mockHarnessStats(input: HarnessStatsQueryInput): Promise<HarnessStatsQueryResult | null> {
  return {
    requestId: input.requestId,
    kind: input.kind,
    generatedAt: new Date().toISOString(),
    dataVersion: MOCK_HARNESS_STATS_SYNC.dataVersion,
    sync: MOCK_HARNESS_STATS_SYNC,
    data: dataFor(input),
  };
}
