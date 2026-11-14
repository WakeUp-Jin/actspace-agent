/**
 * Harness 统计的共享契约：设置页「Harness 统计」、Desktop 主进程汇总 Worker，
 * 以及第二期 Agent 查询工具共用同一套类型、规则阈值和分档。
 * 设计见 docs/design-docs/自进化的方案设计/11-Harness统计设计.md；页面口径见 docs/design-docs/frontend/front-统计页规范.md。
 *
 * 单位约定：名字以 Rate / Share 结尾的字段，以及上下文窗口占比（window.p50 / p95、triggerWindowP50）都是 0–1 的小数，
 * 没有样本时为 null；*Ms 是毫秒；*Tokens 是估算 token。
 */

/** 页面按卡片需要并行取的几块数据。 */
export const HARNESS_STATS_QUERY_KINDS = [
  "options",
  "overview",
  "usage-vs",
  "context",
  "disclosure",
  "plugins",
  "versions",
] as const;
export type HarnessStatsQueryKind = (typeof HARNESS_STATS_QUERY_KINDS)[number];

export type HarnessStatsRange = "day" | "week" | "month" | "total";
export type HarnessStatsSessionKind = "main" | "child" | "side" | "all";

/** 版本键：`<harnessId>@<revision>`；没有版本信息的旧记录为 `unknown`。 */
export type HarnessRevisionKey = string;
export const HARNESS_UNKNOWN_REVISION = "unknown";

export type HarnessStatsFilter = {
  readonly range: HarnessStatsRange;
  readonly mode?: string;
  readonly model?: string;
  readonly sessionKind: HarnessStatsSessionKind;
  readonly revision?: HarnessRevisionKey;
};

export type HarnessStatsQueryInput = {
  readonly requestId: string;
  readonly kind: HarnessStatsQueryKind;
  readonly filter: HarnessStatsFilter;
  /** 只用于 versions：对比的两个版本；缺省为最近两个有数据的版本。 */
  readonly compare?: { readonly from: HarnessRevisionKey; readonly to: HarnessRevisionKey };
};

export type HarnessStatsSyncStatus = {
  /** idle：没有在补数据；syncing：正在读会话日志或统计文件；failed：上次同步失败。 */
  readonly phase: "idle" | "syncing" | "failed";
  readonly completedSessions: number;
  readonly totalSessions: number;
  readonly eventsRead: number;
  /** 每次同步提交新数据后递增；页面据此判断缓存是否过期。 */
  readonly dataVersion: number;
  readonly error?: string;
  /** 读取失败、被跳过的会话数。 */
  readonly failedSessions: number;
};

export type HarnessStatsStatusInput = { readonly consumerId: string };

export type HarnessStatsQueryResult = {
  readonly requestId: string;
  readonly kind: HarnessStatsQueryKind;
  readonly generatedAt: string;
  readonly dataVersion: number;
  readonly sync: HarnessStatsSyncStatus;
  readonly data: HarnessStatsData;
};

export type HarnessStatsData =
  | { readonly kind: "options"; readonly value: HarnessStatsOptions }
  | { readonly kind: "overview"; readonly value: HarnessStatsOverview }
  | { readonly kind: "usage-vs"; readonly value: HarnessStatsUsageVs }
  | { readonly kind: "context"; readonly value: HarnessStatsContext }
  | { readonly kind: "disclosure"; readonly value: HarnessStatsDisclosure }
  | { readonly kind: "plugins"; readonly value: HarnessStatsPlugins }
  | { readonly kind: "versions"; readonly value: HarnessStatsVersions };

export type HarnessPluginSource = "builtin" | "user" | "evolved" | "unknown";

export type HarnessStatsOptions = {
  readonly modes: readonly string[];
  readonly models: readonly string[];
  readonly revisions: readonly HarnessRevisionInfo[];
  readonly currentRevision: HarnessRevisionKey | null;
};

export type HarnessRevisionInfo = {
  readonly key: HarnessRevisionKey;
  readonly harnessId: string | null;
  readonly revision: number | null;
  readonly description: string | null;
  /** 首次 / 最后一次出现在数据里的时间（ISO）。 */
  readonly firstSeenAt: string | null;
  readonly lastSeenAt: string | null;
  /** 当前时间范围与筛选下的请求数。 */
  readonly requests: number;
};

export type HarnessFlagLevel = "warn" | "error" | "info";
export type HarnessFlagRuleId =
  | "tool-costly-unused"
  | "plugin-costly-unused"
  | "tool-failure-rate"
  | "plugin-load-failure"
  | "listener-errors"
  | "service-never-called"
  | "skill-never-read"
  | "compaction-reread"
  | "mis-sleep"
  | "context-churn";

/** 点击后跳到哪张卡片（或底部明细），切到哪个 tab，定位哪一行。 */
export type HarnessStatsTarget = {
  readonly card: "usage-vs" | "sources" | "compaction" | "disclosure" | "runtime" | "detail";
  readonly tab?: string;
  readonly key?: string;
};

export type HarnessFlag = {
  readonly rule: HarnessFlagRuleId;
  readonly level: HarnessFlagLevel;
  readonly title: string;
  readonly detail: string;
  /** 卡片右侧的分类说明，例如「占用 vs 使用」。 */
  readonly category: string;
  readonly target: HarnessStatsTarget;
};

export type HarnessBucketAverage = { readonly bucket: string; readonly avgTokens: number };

/** 一个版本（或全部数据）的指标卡与版本对比用数。比例是 0–1，没有样本为 null。 */
export type HarnessRevisionMetrics = {
  readonly requests: number;
  readonly avgContextTokens: number | null;
  /** 系统提示词 + 工具定义 + 规则 + Skills 目录的每次请求平均。 */
  readonly fixedOverheadTokens: number | null;
  readonly avgContextWindow: number | null;
  readonly cacheBrokenRate: number | null;
  /** 被打断的请求 / 其他请求的实际缓存命中率。 */
  readonly cacheHitBroken: number | null;
  readonly cacheHitOther: number | null;
  readonly toolCalls: number;
  readonly toolFailureRate: number | null;
  readonly topFailedTool: { readonly name: string; readonly failed: number } | null;
  readonly repeatRate: number | null;
  readonly truncateRate: number | null;
  readonly compactions: number;
  readonly rereadRate: number | null;
  readonly foldedTokens: number;
  readonly activeHitRate: number | null;
  /** 该版本加载的插件数（运行时统计）。 */
  readonly plugins: number | null;
};

export type HarnessStatsOverview = {
  readonly flags: readonly HarnessFlag[];
  /** 指标卡看的版本：筛选选中的版本，未选时是有数据的最新版本。 */
  readonly current: HarnessRevisionKey | null;
  readonly previous: HarnessRevisionKey | null;
  readonly metrics: HarnessRevisionMetrics | null;
  readonly previousMetrics: HarnessRevisionMetrics | null;
};

export type HarnessToolRow = {
  readonly name: string;
  readonly pluginId: string | null;
  /** 出现在多少次模型请求里。 */
  readonly exposures: number;
  readonly calls: number;
  readonly failed: number;
  readonly failureCodes: readonly { readonly code: string; readonly count: number }[];
  /** 工具定义平均 token。 */
  readonly schemaTokens: number | null;
  readonly truncated: number;
  readonly repeated: number;
};
export type HarnessUsagePluginRow = {
  readonly pluginId: string;
  readonly source: HarnessPluginSource;
  readonly tools: readonly string[];
  readonly calls: number;
  readonly failed: number;
  /** 这个插件的工具定义平均每次请求合计多少 token。 */
  readonly schemaTokens: number | null;
  /** 插件工具里最多的一次曝光数（≈ 带着这个插件的请求数）。 */
  readonly exposures: number;
};
export type HarnessSkillRow = {
  readonly id: string;
  readonly source: string | null;
  /** 出现在多少次请求的 Skills 目录里。 */
  readonly listed: number;
  /** 目录里这一条的平均 token。 */
  readonly catalogTokens: number | null;
  readonly skillReads: number;
  readonly assetReads: number;
  readonly lastReadAt: string | null;
};

export type HarnessStatsUsageVs = {
  readonly requests: number;
  readonly tools: readonly HarnessToolRow[];
  readonly plugins: readonly HarnessUsagePluginRow[];
  readonly skills: readonly HarnessSkillRow[];
};

export type HarnessSourceRow = {
  readonly key: string;
  readonly kind: "tools" | "skills" | "section" | "supplement" | "model-facts" | "other";
  /** 上下文 6 类之一（systemPrompt / tools / rules / skills / summarizedConversation / conversation）。 */
  readonly bucket: string;
  readonly owner: string | null;
  readonly id: string;
  readonly appearances: number;
  readonly avgTokens: number;
  /** 与同一会话上一次请求相比内容（token 数）变了的比例。 */
  readonly changeRate: number | null;
};

export type HarnessStatsContext = {
  readonly requests: number;
  readonly buckets: readonly HarnessBucketAverage[];
  readonly avgEstimatedTokens: number | null;
  readonly sources: readonly HarnessSourceRow[];
};

export type HarnessCompactionRecord = {
  readonly id: string;
  readonly time: string | null;
  readonly trigger: string;
  readonly ok: boolean;
  readonly failureCode: string | null;
  readonly beforeTokens: number | null;
  readonly afterTokens: number | null;
  readonly durationMs: number | null;
  readonly rereads: number;
};

export type HarnessStatsDisclosure = {
  readonly cycles: number;
  readonly activeHitRate: number | null;
  readonly misSleepRate: number | null;
  readonly indexConversionRate: number | null;
  readonly capHits: number;
  /** 11 档：0–9、10–19 … 90–99、100 条活跃路径。 */
  readonly activeHistogram: readonly number[];
  /** 6 档：睡 1、2、3、4、5、6+ 个周期后被唤醒。 */
  readonly sleepHistogram: readonly number[];
  readonly topPaths: readonly { readonly path: string; readonly reads: number }[];
  readonly compaction: {
    readonly count: number;
    readonly auto: number;
    readonly manual: number;
    readonly failed: number;
    readonly avgBeforeTokens: number | null;
    readonly avgAfterTokens: number | null;
    readonly avgDurationMs: number | null;
    readonly rereadRate: number | null;
    readonly triggerWindowP50: number | null;
    readonly avgStepsBetween: number | null;
    readonly foldedOutputs: number;
    readonly foldedTokens: number;
  };
  /** 时间倒序，最多 200 条。 */
  readonly records: readonly HarnessCompactionRecord[];
};

export type HarnessServiceRow = {
  readonly providerPluginId: string | null;
  readonly service: string;
  readonly method: string;
  readonly calls: number;
  readonly errors: number;
  readonly p95Ms: number | null;
};
export type HarnessListenerRow = {
  readonly pluginId: string;
  readonly event: string;
  readonly calls: number;
  readonly errors: number;
};
export type HarnessPluginRow = {
  readonly pluginId: string;
  readonly source: HarnessPluginSource;
  readonly tools: number;
  readonly toolCalls: number;
  readonly contextTokens: number | null;
  readonly loads: number;
  readonly loadFailures: number;
  readonly lastLoadError: string | null;
};

export type HarnessStatsPlugins = {
  readonly rows: readonly HarnessPluginRow[];
  readonly services: readonly HarnessServiceRow[];
  readonly listeners: readonly HarnessListenerRow[];
  readonly loadP50Ms: number | null;
  /** 统计文件里还没有任何运行时数据（例如统计刚开启）。 */
  readonly runtimeEmpty: boolean;
};

export type HarnessStatsVersions = {
  readonly revisions: readonly HarnessRevisionInfo[];
  readonly from: HarnessRevisionKey | null;
  readonly to: HarnessRevisionKey | null;
  readonly fromMetrics: HarnessRevisionMetrics | null;
  readonly toMetrics: HarnessRevisionMetrics | null;
};

/* ---------------------------- 分档与规则 ---------------------------- */

/** 16 档对数直方图：耗时从 1ms 起每档 ×2，输出 token 从 16 起每档 ×2。最后一档收所有更大的值。 */
export const HARNESS_HISTOGRAM_BUCKETS = 16;
export const HARNESS_DURATION_BASE_MS = 1;
export const HARNESS_TOKEN_BASE = 16;

export function harnessHistogramIndex(value: number, base: number): number {
  if (!Number.isFinite(value) || value <= base) return 0;
  return Math.min(HARNESS_HISTOGRAM_BUCKETS - 1, Math.ceil(Math.log2(value / base)));
}
/** 档位上界（含）。P50 / P95 取所在档的上界，页面写「约」。 */
export function harnessHistogramUpperBound(index: number, base: number): number {
  return base * 2 ** index;
}
export function harnessHistogramQuantile(histogram: readonly number[], q: number, base: number): number | null {
  const total = histogram.reduce((sum, value) => sum + value, 0);
  if (!total) return null;
  const target = Math.max(1, Math.ceil(total * q));
  let seen = 0;
  for (let index = 0; index < histogram.length; index++) {
    seen += histogram[index] ?? 0;
    if (seen >= target) return harnessHistogramUpperBound(index, base);
  }
  return harnessHistogramUpperBound(histogram.length - 1, base);
}
export function emptyHarnessHistogram(): number[] {
  return Array.from({ length: HARNESS_HISTOGRAM_BUCKETS }, () => 0);
}
export function addHarnessHistograms(target: number[], source: readonly number[]): number[] {
  for (let index = 0; index < HARNESS_HISTOGRAM_BUCKETS; index++)
    target[index] = (target[index] ?? 0) + (source[index] ?? 0);
  return target;
}

/** 「值得关注」规则阈值。改阈值只改这里；第二期 Agent 查询引用同一张表。 */
export const HARNESS_FLAG_RULES = {
  toolCostlyUnused: { maxCallRate: 0.01, minSchemaTokens: 300, minExposures: 200 },
  pluginCostlyUnused: { maxCallRate: 0.01, minSchemaTokens: 500, minExposures: 200 },
  toolFailureRate: { minFailureRate: 0.05, minCalls: 30 },
  pluginLoadFailure: { minFailures: 1 },
  listenerErrors: { minErrors: 1 },
  serviceNeverCalled: { minRangeDays: 7 },
  skillNeverRead: { minListed: 200 },
  compactionReread: { minRate: 0.2, minCompactions: 10 },
  misSleep: { minRate: 0.1, minSleepingPaths: 50 },
  contextChurn: { minChangeRate: 0.2, minAppearances: 200 },
} as const;

/** 压缩后多少步内重读算“压缩后重读”；查索引后多少步内读了索引里的文件算“索引转化”。 */
export const HARNESS_REREAD_WINDOW_STEPS = 5;
export const HARNESS_INDEX_CONVERSION_STEPS = 5;
/** 披露活跃集合上限，与 selectNextActivePathIds 一致。 */
export const HARNESS_ACTIVE_PATH_LIMIT = 100;
/** 版本对比时样本少于这个请求数就提示「偏少，仅供参考」。 */
export const HARNESS_COMPARE_MIN_REQUESTS = 200;

/* ---------------------------- 统计文件 ---------------------------- */

/** `<dataRoot>/harness-stats/YYYY-MM.jsonl` 的一行：小时级运行时累计值。 */
export type HarnessRuntimeStatLine = {
  readonly v: 1;
  readonly t: "runtime";
  /** 小时起点 ISO，例如 2026-11-01T09:00:00.000Z。 */
  readonly hour: string;
  readonly revision: HarnessRevisionKey;
  readonly kind: "service" | "listener";
  /** 插件 entry id（调用方或监听方）。旧文件里的 `dependency` 行读取时忽略。 */
  readonly plugin: string;
  /** service：服务名；listener：事件名。 */
  readonly name: string;
  /** service：方法名；listener：空串。 */
  readonly method: string;
  /** service：提供该服务的插件；其他为 null。 */
  readonly provider: string | null;
  readonly calls: number;
  readonly errors: number;
  readonly totalMs: number;
  readonly histogram: readonly number[];
};

/** 每次挂载一个 Harness 版本写一条；工具归属在插件注册工具时追加。 */
export type HarnessInventoryLine = {
  readonly v: 1;
  readonly t: "inventory";
  readonly at: string;
  readonly revision: HarnessRevisionKey;
  readonly plugin: string;
  readonly source: HarnessPluginSource;
  readonly provides: readonly string[];
  readonly loadMs: number | null;
  readonly ok: boolean;
  readonly error: string | null;
};
export type HarnessToolOwnerLine = {
  readonly v: 1;
  readonly t: "tool-owner";
  readonly at: string;
  readonly revision: HarnessRevisionKey;
  /** 注册工具的插件 entry id。 */
  readonly plugin: string;
  /** 工具定义上的 pluginId（会话日志 tool/call.pluginId 用的就是它）。 */
  readonly toolPluginId: string | null;
  readonly tool: string;
};
/** 旧文件里还有 `health` / `dependency` 行，读取时忽略。 */
export type HarnessStatsFileLine = HarnessRuntimeStatLine | HarnessInventoryLine | HarnessToolOwnerLine;

export function harnessRevisionKey(
  harnessId: string | null | undefined,
  revision: number | null | undefined,
): HarnessRevisionKey {
  return typeof harnessId === "string" && harnessId && typeof revision === "number" && Number.isFinite(revision)
    ? `${harnessId}@${revision}`
    : HARNESS_UNKNOWN_REVISION;
}
