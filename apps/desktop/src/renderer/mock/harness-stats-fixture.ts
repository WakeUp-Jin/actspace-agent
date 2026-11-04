import type {
  HarnessCompareRow,
  HarnessFlag,
  HarnessPluginRow,
  HarnessPluginSource,
  HarnessRevisionInfo,
  HarnessStatsContext,
  HarnessStatsData,
  HarnessStatsDisclosure,
  HarnessStatsFilter,
  HarnessStatsOptions,
  HarnessStatsOverview,
  HarnessStatsPlugins,
  HarnessStatsQueryInput,
  HarnessStatsQueryResult,
  HarnessStatsRuntime,
  HarnessStatsSummary,
  HarnessStatsSyncStatus,
  HarnessStatsTools,
  HarnessStatsVersions,
  HarnessToolRow,
} from "@actspace/shared";

/**
 * 浏览器 mock 下「Harness 统计」页的数据，取自已确认的 demo
 * （docs/design-docs/frontend/harness-stats-demo.html，30 天、harness r8、4,812 次请求）。
 * 改时间范围和会话类型会按比例缩放计数，其余筛选只影响「运行时统计受限」的提示，方便走查界面。
 * `?mock=harness-stats` 直接打开到这个页面（见 components/harness-stats/dev-start.ts）。
 */
export const MOCK_HARNESS_STATS_SYNC: HarnessStatsSyncStatus = { phase: "idle", completedSessions: 0, totalSessions: 0, eventsRead: 0, dataVersion: 1, failedSessions: 0 };

const HARNESS_ID = "actspace-harness";
const REQUESTS = 4812;
const DAY_MS = 86_400_000;

const pow2Ms = (value: number) => 2 ** Math.ceil(Math.log2(Math.max(1, value)));
const pow2Tokens = (value: number) => 16 * 2 ** Math.max(0, Math.ceil(Math.log2(Math.max(16, value) / 16)));
const daysAgoIso = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();
const dayKey = (daysAgo: number) => daysAgoIso(daysAgo).slice(0, 10);

/* ------------------------------------------------------------ 工具与插件 */

// [name, pluginId, exposures, calls, schemaTokens, outAvg, outP95, failureRate, denied, p50Ms, p95Ms, lastUsedDaysAgo]
const TOOL_SEED: ReadonlyArray<readonly [string, string, number, number, number, number, number, number, number, number, number, number]> = [
  ["read_file", "filesystem-read", 4812, 3104, 410, 1820, 6400, 0.012, 0, 38, 160, 0],
  ["grep", "filesystem-search", 4812, 1286, 520, 640, 2900, 0.008, 0, 120, 900, 0],
  ["glob", "filesystem-search", 4812, 402, 300, 210, 900, 0.002, 0, 45, 210, 0],
  ["list_directory", "filesystem-read", 4812, 188, 260, 380, 1300, 0.005, 0, 22, 80, 1],
  ["edit_file", "filesystem-write", 4120, 1544, 690, 120, 480, 0.041, 12, 31, 140, 0],
  ["write_file", "filesystem-write", 4120, 233, 380, 60, 120, 0.009, 4, 28, 95, 0],
  ["delete_file", "filesystem-write", 4120, 7, 240, 40, 60, 0, 2, 12, 30, 12],
  ["bash", "shell-tools", 4120, 1890, 980, 1100, 5200, 0.076, 31, 1400, 28000, 0],
  ["task_output", "background-tasks", 4812, 61, 210, 900, 4200, 0, 0, 15, 60, 1],
  ["task_wait", "background-tasks", 4812, 22, 190, 300, 900, 0.045, 0, 8200, 60000, 2],
  ["task_list", "background-tasks", 4812, 19, 180, 140, 300, 0, 0, 6, 20, 1],
  ["task_stop", "background-tasks", 4812, 9, 170, 30, 40, 0, 0, 40, 120, 4],
  ["web_search", "web-tools", 4812, 74, 350, 1600, 3100, 0.027, 0, 2100, 6400, 1],
  ["web_fetch", "web-tools", 4812, 52, 330, 4100, 12800, 0.096, 0, 1800, 9200, 1],
  ["explore", "actspace.subagent", 4812, 57, 860, 1400, 3800, 0.018, 0, 48000, 190000, 0],
  ["agent", "actspace.subagent", 4812, 38, 1240, 2100, 5200, 0.053, 0, 96000, 410000, 1],
  ["todo_write", "todo", 4812, 26, 620, 90, 160, 0, 0, 4, 9, 7],
  ["todo_read", "todo", 4812, 4, 150, 120, 200, 0, 0, 3, 6, 19],
  ["inspect_image", "image-inspection", 4812, 11, 290, 260, 600, 0.091, 0, 3900, 7800, 3],
  ["generate_image", "image-generation", 4812, 3, 460, 80, 120, 0.333, 0, 14000, 21000, 22],
  ["harness_inspect", "actspace.plugin-manager", 4812, 5, 420, 1900, 3600, 0, 0, 90, 300, 3],
  ["plugin_manager", "actspace.plugin-manager", 4812, 2, 1580, 600, 900, 0, 1, 26000, 31000, 3],
  ["word_count", "user.word-count", 812, 14, 120, 20, 40, 0, 0, 2, 5, 0],
];

const FAILURE_CODES: Record<string, ReadonlyArray<{ code: string; count: number }>> = {
  bash: [{ code: "exit_code_nonzero", count: 71 }, { code: "timeout", count: 59 }, { code: "sandbox_denied", count: 14 }],
  edit_file: [{ code: "old_string_not_found", count: 41 }, { code: "stale_file", count: 22 }],
  web_fetch: [{ code: "http_error", count: 3 }, { code: "timeout", count: 2 }],
};

function toolRows(scale: number): HarnessToolRow[] {
  return TOOL_SEED.map(([name, pluginId, exposures, calls, schema, out, outP95, failRate, denied, p50, p95, lastDays]) => {
    const scaledCalls = Math.round(calls * scale);
    const failed = Math.round(scaledCalls * failRate);
    return {
      name,
      pluginId,
      exposures: Math.round(exposures * scale),
      calls: scaledCalls,
      completed: scaledCalls - failed,
      failed,
      denied: Math.round(denied * scale),
      aborted: Math.round(scaledCalls * 0.004),
      unknownOutcome: 0,
      failureCodes: failed ? (FAILURE_CODES[name] ?? [{ code: "tool_error", count: failed }]) : [],
      schemaTokens: schema,
      outputTokensAvg: out,
      outputTokensP95: pow2Tokens(outP95),
      durationP50Ms: pow2Ms(p50),
      durationP95Ms: pow2Ms(p95),
      truncated: name === "read_file" ? Math.round(31 * scale) : name === "bash" ? Math.round(19 * scale) : 0,
      repeatedSameArgs: name === "read_file" ? Math.round(52 * scale) : name === "grep" ? Math.round(30 * scale) : 0,
      retryAfterFailure: name === "bash" ? Math.round(88 * scale) : name === "edit_file" ? Math.round(45 * scale) : 0,
      foldedOutputs: name === "read_file" ? Math.round(310 * scale) : name === "bash" ? Math.round(180 * scale) : 0,
      foldedTokens: name === "read_file" ? Math.round(1_100_000 * scale) : name === "bash" ? Math.round(600_000 * scale) : 0,
      lastUsedAt: calls ? daysAgoIso(lastDays) : null,
    };
  });
}

// [id, source, contextTokens, services, serviceCalls, listeners, journalEvents, loadMs]
const PLUGIN_SEED: ReadonlyArray<readonly [string, HarnessPluginSource, number, number, number, number, number, number]> = [
  ["filesystem-read", "builtin", 670, 1, 0, 0, 0, 4],
  ["filesystem-search", "builtin", 820, 0, 0, 0, 0, 3],
  ["filesystem-write", "builtin", 1310, 0, 0, 0, 0, 3],
  ["shell-tools", "builtin", 980, 0, 0, 1, 0, 6],
  ["background-tasks", "builtin", 1140, 1, 418, 2, 286, 5],
  ["web-tools", "builtin", 680, 1, 126, 0, 0, 9],
  ["actspace.subagent", "builtin", 2100, 1, 95, 2, 285, 11],
  ["todo", "builtin", 770, 0, 0, 0, 0, 2],
  ["image-inspection", "builtin", 290, 0, 0, 0, 0, 2],
  ["image-generation", "builtin", 460, 0, 0, 0, 0, 3],
  ["actspace.plugin-manager", "builtin", 2000, 1, 7, 0, 9, 14],
  ["user.word-count", "evolved", 120, 0, 0, 0, 0, 2],
  ["actspace.sandbox", "builtin", 0, 3, 1311, 1, 0, 21],
  ["actspace.auto-review", "builtin", 0, 1, 203, 0, 0, 4],
  ["actspace.compaction", "builtin", 0, 1, 4812, 0, 0, 3],
  ["context-disclosure", "builtin", 640, 0, 0, 1, 1184, 4],
  ["actspace.english-learning", "user", 380, 0, 0, 2, 0, 7],
  ["actspace.side-chat", "builtin", 0, 0, 0, 2, 0, 3],
];

const LISTENERS: HarnessStatsPlugins["listeners"] = [
  { pluginId: "actspace.english-learning", event: "session/created", calls: 412, errors: 12, avgMs: 3 },
  { pluginId: "actspace.side-chat", event: "session/created", calls: 412, errors: 0, avgMs: 1 },
  { pluginId: "context-disclosure", event: "tools/result", calls: 7310, errors: 0, avgMs: 1 },
  { pluginId: "background-tasks", event: "session/disposed", calls: 398, errors: 0, avgMs: 1 },
  { pluginId: "shell-tools", event: "tools/pre-execute", calls: 1890, errors: 0, avgMs: 0.4 },
  { pluginId: "actspace.sandbox", event: "tools/pre-execute", calls: 1203, errors: 0, avgMs: 2 },
];

const SERVICES: HarnessStatsPlugins["services"] = [
  { providerPluginId: "actspace.sandbox", service: "sandbox", method: "exec", calls: 1203, errors: 0, avgMs: 1350, p95Ms: 8192 },
  { providerPluginId: "actspace.sandbox", service: "sandbox", method: "policy", calls: 108, errors: 0, avgMs: 2, p95Ms: 4 },
  { providerPluginId: "actspace.sandbox", service: "sandbox", method: "seatbelt", calls: 0, errors: 0, avgMs: null, p95Ms: null },
  { providerPluginId: "actspace.compaction", service: "compaction", method: "maybeCompact", calls: 4812, errors: 0, avgMs: 1, p95Ms: 2 },
  { providerPluginId: "background-tasks", service: "background", method: "registry", calls: 418, errors: 0, avgMs: 3, p95Ms: 8 },
  { providerPluginId: "actspace.auto-review", service: "autoReview", method: "review", calls: 203, errors: 6, avgMs: 2900, p95Ms: 8192 },
  { providerPluginId: "web-tools", service: "web", method: "searchProvider", calls: 126, errors: 4, avgMs: 2000, p95Ms: 8192 },
  { providerPluginId: "actspace.subagent", service: "subagent", method: "provider", calls: 95, errors: 2, avgMs: 72000, p95Ms: 262144 },
  { providerPluginId: "actspace.plugin-manager", service: "harness", method: "pluginManager", calls: 7, errors: 0, avgMs: 3100, p95Ms: 4096 },
  { providerPluginId: "filesystem-read", service: "fs", method: "readGuard", calls: 0, errors: 0, avgMs: null, p95Ms: null },
];

const DEPENDENCIES: HarnessStatsPlugins["dependencies"] = [
  { caller: "shell-tools", callee: "actspace.sandbox", service: "sandbox.exec", calls: 1203 },
  { caller: "tools.approval", callee: "actspace.auto-review", service: "autoReview.review", calls: 203 },
  { caller: "actspace.core.agent-loop", callee: "actspace.compaction", service: "compaction.maybeCompact", calls: 4812 },
  { caller: "web-tools", callee: "web-tools", service: "web.searchProvider", calls: 126 },
  { caller: "actspace.subagent", callee: "background-tasks", service: "background.registry", calls: 31 },
];

function pluginRows(tools: readonly HarnessToolRow[], scale: number): HarnessPluginRow[] {
  return PLUGIN_SEED.map(([pluginId, source, context, services, serviceCalls, listeners, events, loadMs]) => {
    const own = tools.filter((tool) => tool.pluginId === pluginId);
    const ownListeners = LISTENERS.filter((item) => item.pluginId === pluginId);
    return {
      pluginId,
      source,
      tools: own.length,
      toolCalls: own.reduce((sum, tool) => sum + tool.calls, 0),
      toolFailures: own.reduce((sum, tool) => sum + tool.failed, 0),
      contextTokens: context || null,
      services,
      serviceCalls: Math.round(serviceCalls * scale),
      listeners,
      listenerCalls: Math.round(ownListeners.reduce((sum, item) => sum + item.calls, 0) * scale),
      listenerErrors: Math.round(ownListeners.reduce((sum, item) => sum + item.errors, 0) * scale),
      journalEvents: Math.round(events * scale),
      loads: 14,
      loadFailures: 0,
      loadP50Ms: pow2Ms(loadMs),
      lastLoadError: null,
    };
  });
}

/* ------------------------------------------------------------ 其他固定数据 */

const BUCKETS = [
  { bucket: "systemPrompt", avgTokens: 3100 },
  { bucket: "tools", avgTokens: 13400 },
  { bucket: "rules", avgTokens: 2200 },
  { bucket: "skills", avgTokens: 1900 },
  { bucket: "summarizedConversation", avgTokens: 2800 },
  { bucket: "conversation", avgTokens: 41000 },
];
const AVG_TOKENS = BUCKETS.reduce((sum, item) => sum + item.avgTokens, 0);

const TREND = [118, 96, 140, 162, 151, 88, 72, 130, 171, 190, 184, 166, 95, 80, 158, 177, 202, 188, 196, 110, 98, 175, 210, 221, 198, 205, 120, 104, 214, 233];

const REVISIONS: HarnessRevisionInfo[] = [
  { key: `${HARNESS_ID}@5`, harnessId: HARNESS_ID, revision: 5, description: "基线（自进化 V1 合入）", firstSeenAt: daysAgoIso(55), lastSeenAt: daysAgoIso(41), requests: 9120 },
  { key: `${HARNESS_ID}@6`, harnessId: HARNESS_ID, revision: 6, description: "模型与连接改版", firstSeenAt: daysAgoIso(41), lastSeenAt: daysAgoIso(34), requests: 6480 },
  { key: `${HARNESS_ID}@7`, harnessId: HARNESS_ID, revision: 7, description: "自进化：新增 word_count", firstSeenAt: daysAgoIso(34), lastSeenAt: daysAgoIso(1), requests: 3120 },
  { key: `${HARNESS_ID}@8`, harnessId: HARNESS_ID, revision: 8, description: "后台任务面板 + 沙盒图标", firstSeenAt: daysAgoIso(1), lastSeenAt: daysAgoIso(0), requests: 1692 },
];
const CURRENT_REVISION = REVISIONS[REVISIONS.length - 1]!.key;

function flags(): HarnessFlag[] {
  return [
    { rule: "tool-costly-unused", level: "warn", title: "plugin_manager 占用高、使用极少", detail: "工具定义 1,580 token，出现在 4,812 次请求里；30 天只调用 2 次。平均每次调用摊到 3.8M token 的定义成本。", category: "工具 · 成本 vs 使用", target: { tab: "tools", key: "plugin_manager" } },
    { rule: "plugin-costly-unused", level: "warn", title: "todo 插件两个工具调用率 0.6%", detail: "todo_write + todo_read 合计 770 token/请求，30 天共调用 30 次；最后一次 todo_read 在 19 天前。", category: "插件 · 成本 vs 使用", target: { tab: "plugins", key: "todo" } },
    { rule: "tool-failure-rate", level: "error", title: "bash 失败率 7.6%", detail: "1,890 次中失败 144 次：超时 59、退出码非零 71、沙盒拒绝 14。另有 31 次被用户拒绝。", category: "工具 · 失败", target: { tab: "tools", key: "bash" } },
    { rule: "compaction-reread", level: "warn", title: "压缩后 23% 会话在 5 步内重读同一文件", detail: "212 次压缩中 49 次之后很快重读了压缩前读过的文件，平均 2.4 个文件，可能是摘要丢了关键信息。", category: "压缩 · 信息丢失", target: { tab: "disclosure" } },
    { rule: "listener-errors", level: "error", title: "english-learning 监听器报错 12 次", detail: "session/created 监听触发 412 次，报错 12 次（错误被吞掉，只写了日志）。", category: "插件 · 监听", target: { tab: "plugins", key: "actspace.english-learning" } },
    { rule: "skill-never-read", level: "info", title: "skill xlsx 从未被读取", detail: "列在 Skills 列表里 4,812 次请求，0 次读取 SKILL.md。", category: "Skills", target: { tab: "context" } },
    { rule: "background-unread", level: "info", title: "6 个后台任务启动后没人读输出", detail: "共启动 142 个后台任务，其中 6 个从未被 task_output / task_wait 读取。", category: "运行 · 后台任务", target: { tab: "runtime" } },
    { rule: "service-never-called", level: "info", title: "服务 sandbox.seatbelt、fs.readGuard 0 次调用", detail: "两个服务已注册但 30 天没有任何插件调用。", category: "插件 · 服务", target: { tab: "plugins", key: "actspace.sandbox" } },
  ];
}

/* ------------------------------------------------------------ 按 kind 组装 */

function scaleOf(filter: HarnessStatsFilter): number {
  const range = { day: 1 / 30, week: 7 / 30, month: 1, total: 2.6 }[filter.range];
  const session = { main: 1, child: 0.22, side: 0.06, all: 1.3 }[filter.sessionKind];
  return range * session;
}

function summary(scale: number): HarnessStatsSummary {
  const tools = toolRows(scale);
  const calls = tools.reduce((sum, tool) => sum + tool.calls, 0);
  const failed = tools.reduce((sum, tool) => sum + tool.failed, 0);
  return {
    plugins: { loaded: 48, withTools: 13, evolved: 1, user: 1 },
    toolCalls: { calls, failureRate: calls ? failed / calls : null, tools: tools.length },
    context: { avgEstimatedTokens: AVG_TOKENS, toolsShare: 13400 / AVG_TOKENS },
    compaction: { count: Math.round(212 * scale), activeHitRate: 0.713 },
    requests: Math.round(REQUESTS * scale),
  };
}

function options(): HarnessStatsOptions {
  return {
    modes: ["Agent", "Plan", "Ask"],
    models: ["claude-opus-5-5", "deepseek-v4", "kimi-k3"],
    workspaces: ["/Users/demo/code/actspace-agent", "/Users/demo/code/side-project/site", "/Users/demo/notes"],
    revisions: REVISIONS,
    currentRevision: CURRENT_REVISION,
  };
}

function overview(filter: HarnessStatsFilter, scale: number): HarnessStatsOverview {
  const days = { day: 1, week: 7, month: 30, total: 30 }[filter.range];
  const series = TREND.slice(-days).map((value, index, list) => ({ day: dayKey(list.length - 1 - index), value: Math.round(value * (scale / (days / 30 || 1)) ) }));
  return {
    flags: flags(),
    dailyToolCalls: series,
    buckets: BUCKETS,
    avgEstimatedTokens: AVG_TOKENS,
    harness: { currentRevision: CURRENT_REVISION, currentSince: daysAgoIso(1), plugins: 48, toolPlugins: 13, tools: TOOL_SEED.length, statsFileBytes: 2_202_009, statsWriteFailures: 0, lastRebuildAt: daysAgoIso(0.4) },
  };
}

function plugins(filter: HarnessStatsFilter, scale: number): HarnessStatsPlugins {
  const limited = Boolean(filter.mode || filter.model || filter.workspaceRoot) || filter.sessionKind === "child" || filter.sessionKind === "side";
  return { rows: pluginRows(toolRows(scale), scale), services: SERVICES, dependencies: DEPENDENCIES, listeners: LISTENERS, runtimeFilterLimited: limited, runtimeEmpty: false };
}

function tools(scale: number): HarnessStatsTools {
  return {
    rows: toolRows(scale),
    approvals: { asked: 412, userApproved: 154, userDenied: 48, timedOut: 7, autoApproved: 197, autoDeclined: 6, sessionGrantUsed: 1086, scopeDenied: 12, avgWaitMs: 6800 },
    bash: { sandboxed: 1203, unsandboxed: 687, unknownEnvironment: 0, escalations: 41, foreground: 1748, background: 142 },
    waste: { repeatedSameArgs: 96, retryAfterFailure: 133, truncated: 58, foldedOutputs: 604, foldedTokens: 1_900_000 },
  };
}

function context(): HarnessStatsContext {
  return {
    requests: REQUESTS,
    incompleteRequests: 0,
    buckets: BUCKETS,
    avgEstimatedTokens: AVG_TOKENS,
    window: { p50: 0.38, p95: 0.79, overThreshold: 212 },
    estimate: { deltaRate: -0.062, worstModel: "anthropic/claude-haiku-5.5", worstDeltaRate: 0.384, samples: 4690 },
    cache: { hitRate: 0.814, systemChanges: 9, runtimeChanges: 1492 },
    sources: [
      { key: "context-system", kind: "section", owner: "core", id: "context-system", appearances: 4812, avgTokens: 3100, maxTokens: 3300, changeRate: 0.002 },
      { key: "context-runtime", kind: "section", owner: "core", id: "context-runtime", appearances: 4812, avgTokens: 420, maxTokens: 610, changeRate: 0.31 },
      { key: "context-rules", kind: "section", owner: "core", id: "context-rules", appearances: 4812, avgTokens: 2200, maxTokens: 5100, changeRate: 0.004 },
      { key: "context-skills", kind: "skills", owner: "actspace.skills", id: "context-skills", appearances: 4812, avgTokens: 1900, maxTokens: 1900, changeRate: 0 },
      { key: "context-tools", kind: "tools", owner: null, id: "context-tools", appearances: 4812, avgTokens: 13400, maxTokens: 14100, changeRate: 0.006 },
      { key: "context-background-tasks", kind: "supplement", owner: "background-tasks", id: "context-background-tasks", appearances: 812, avgTokens: 210, maxTokens: 900, changeRate: 0.47 },
      { key: "context-disclosure", kind: "supplement", owner: "context-disclosure", id: "context-disclosure", appearances: 1690, avgTokens: 640, maxTokens: 2400, changeRate: 0.12 },
      { key: "context-conversation", kind: "other", owner: null, id: "context-conversation", appearances: 4812, avgTokens: 43800, maxTokens: 158000, changeRate: null },
    ],
    skills: [
      { id: "frontend-verification", source: "user", listed: 4812, selected: 38, skillReads: 38, assetReads: 112, lastReadAt: daysAgoIso(0) },
      { id: "actspace-plugin-development", source: "user", listed: 4812, selected: 3, skillReads: 3, assetReads: 9, lastReadAt: daysAgoIso(3) },
      { id: "git-commit", source: "user", listed: 4812, selected: 61, skillReads: 61, assetReads: 0, lastReadAt: daysAgoIso(0) },
      { id: "mermaid", source: "builtin", listed: 4812, selected: 14, skillReads: 14, assetReads: 3, lastReadAt: daysAgoIso(1) },
      { id: "release-notes", source: "user", listed: 4812, selected: 6, skillReads: 6, assetReads: 2, lastReadAt: daysAgoIso(6) },
      { id: "pdf", source: "builtin", listed: 4812, selected: 2, skillReads: 2, assetReads: 0, lastReadAt: daysAgoIso(20) },
      { id: "xlsx", source: "builtin", listed: 4812, selected: 0, skillReads: 0, assetReads: 0, lastReadAt: null },
    ],
    skillsCatalogTokens: 1900,
  };
}

function disclosure(scale: number): HarnessStatsDisclosure {
  return {
    cycles: Math.round(212 * scale),
    activeHitRate: 0.713,
    sleepingReads: 384,
    wakeShare: 0.094,
    avgSleepCycles: 2.1,
    misSleepRate: 0.061,
    sleepingPaths: 4080,
    indexTokensAvg: 640,
    indexReads: 17,
    indexConversions: 11,
    capHits: 3,
    activeHistogram: [3, 9, 18, 31, 42, 37, 28, 19, 12, 8, 5],
    sleepHistogram: [142, 96, 61, 38, 22, 25],
    topPaths: [
      { path: "apps/desktop/src/renderer/components/WorkbenchLayout.tsx", reads: 14 },
      { path: "packages/shared/src/runtime-v2/projection.ts", reads: 11 },
      { path: "docs/design-docs/frontend/front-新功能开发清单.md", reads: 9 },
    ],
    compaction: {
      count: Math.round(212 * scale),
      auto: Math.round(188 * scale),
      manual: Math.round(24 * scale),
      failed: 3,
      avgBeforeTokens: 162_000,
      avgAfterTokens: 18_000,
      avgDurationMs: 21_400,
      rereadRate: 0.231,
      triggerWindowP50: 0.81,
      stepsBetweenHistogram: [8, 22, 41, 52, 38, 24, 14, 9, 4],
      foldedOutputs: 604,
      foldedTokens: 1_900_000,
      failureReasons: [{ code: "摘要超时", count: 2 }, { code: "模型报错", count: 1 }],
    },
  };
}

function runtime(scale: number): HarnessStatsRuntime {
  return {
    turns: Math.round(618 * scale),
    avgSteps: 7.1,
    stepLimitHits: 6,
    stepsHistogram: [96, 141, 118, 84, 61, 43, 29, 21, 13, 6, 6],
    endReasons: { completed: 545, aborted: 41, failed: 26, stepLimit: 6, other: 0 },
    retries: { total: 57, byCode: [{ code: "限流", count: 31 }, { code: "超时", count: 18 }, { code: "其他", count: 8 }] },
    interventions: { aborted: 41, steering: 38, queued: 14 },
    delegations: { byPreset: [{ presetId: "actspace.subagent.explore", count: 57, avgDurationMs: 41_000 }, { presetId: "actspace.subagent.general", count: 31, avgDurationMs: 96_000 }, { presetId: "actspace.subagent.fork", count: 7, avgDurationMs: 88_000 }, { presetId: "actspace.subagent.codex", count: 3, avgDurationMs: 210_000 }], failed: 3, avgSteps: 14.2, avgDurationMs: 72_000, avgReturnTokens: 1700 },
    background: { byKind: [{ kind: "bash", count: 131 }, { kind: "agent", count: 11 }], completed: 118, failed: 9, stopped: 15, avgDurationMs: 246_000, unread: 6 },
    sideChats: { sessions: 23, avgTurns: 4.3 },
    modeSwitches: 71,
    modeShare: [{ mode: "Agent", requests: 3946 }, { mode: "Plan", requests: 626 }, { mode: "Ask", requests: 240 }],
    auxiliary: [
      { purpose: "session-title", calls: 412, failed: 3, avgMs: 1800 },
      { purpose: "compaction-summary", calls: 212, failed: 3, avgMs: 21_400 },
      { purpose: "auto-review", calls: 203, failed: 6, avgMs: 2900 },
      { purpose: "side-chat-title", calls: 23, failed: 0, avgMs: 1500 },
    ],
  };
}

const COMPARE: ReadonlyArray<Omit<HarnessCompareRow, "from" | "to"> & { readonly values: readonly [number, number] }> = [
  { id: "avg-steps", label: "每轮平均步数", better: "lower", format: "number", values: [7.8, 7.1] },
  { id: "tool-failure", label: "工具调用失败率", better: "lower", format: "rate", values: [0.061, 0.048] },
  { id: "bash-failure", label: "bash 失败率", better: "lower", format: "rate", values: [0.094, 0.076] },
  { id: "avg-context", label: "每次请求平均上下文", better: "lower", format: "tokens", values: [61_200, 64_800] },
  { id: "tools-context", label: "工具定义占用", better: "lower", format: "tokens", values: [12_900, 13_400] },
  { id: "active-hit", label: "活跃命中率", better: "higher", format: "rate", values: [0.68, 0.71] },
  { id: "reread", label: "压缩后重读率", better: "lower", format: "rate", values: [0.27, 0.23] },
  { id: "step-limit", label: "碰到步数上限", better: "lower", format: "count", values: [9, 6] },
];

function versions(input: HarnessStatsQueryInput): HarnessStatsVersions {
  const from = input.compare?.from ?? REVISIONS[2]!.key;
  const to = input.compare?.to ?? REVISIONS[3]!.key;
  const flip = REVISIONS.findIndex((item) => item.key === from) > REVISIONS.findIndex((item) => item.key === to);
  const requests = (key: string) => REVISIONS.find((item) => item.key === key)?.requests ?? 0;
  return {
    revisions: REVISIONS,
    from,
    to,
    compare: COMPARE.map(({ values, ...row }) => ({ ...row, from: flip ? values[1] : values[0], to: flip ? values[0] : values[1] })),
    lowSample: Math.min(requests(from), requests(to)) < 2000,
    evolutionOps: [
      { action: "create", count: 2, failed: 0 },
      { action: "build", count: 3, failed: 1 },
      { action: "prepare", count: 2, failed: 0 },
      { action: "apply", count: 1, failed: 0 },
      { action: "discard", count: 1, failed: 0 },
    ],
    evolvedPlugins: [{ pluginId: "user.word-count", calls: 14, failures: 0, sessions: 9 }],
  };
}

function dataFor(input: HarnessStatsQueryInput): HarnessStatsData {
  const scale = scaleOf(input.filter);
  switch (input.kind) {
    case "summary": return { kind: "summary", value: summary(scale) };
    case "options": return { kind: "options", value: options() };
    case "overview": return { kind: "overview", value: overview(input.filter, scale) };
    case "plugins": return { kind: "plugins", value: plugins(input.filter, scale) };
    case "tools": return { kind: "tools", value: tools(scale) };
    case "context": return { kind: "context", value: context() };
    case "disclosure": return { kind: "disclosure", value: disclosure(scale) };
    case "runtime": return { kind: "runtime", value: runtime(scale) };
    case "versions": return { kind: "versions", value: versions(input) };
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
